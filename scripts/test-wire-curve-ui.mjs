import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {createPreset} from '../dist/models.js';
import {serializeExperiment} from '../dist/files.js';
import {idealWireX,rippledWirePoints} from '../tests/fixtures/wire-ripple.mjs';

const artifacts='artifacts/wire-curves';
const viewport={width:1500,height:1000};
const name='导线曲线测试';
const points=rippledWirePoints(),physicalVia=points.slice(1,-1);
const experiment={
  ...createPreset('free'),viewMode:'physical',view:{x:370,y:240,zoom:5},
  junctions:[{id:'n1',...points[0]},{id:'n2',...points.at(-1)}],
  wires:[{id:'w1',a:'n1:0',b:'n2:0',physicalVia}]
};

async function freePort(){
  const socket=createServer();
  await new Promise((resolve,reject)=>socket.on('error',reject).listen(0,'127.0.0.1',resolve));
  const {port}=socket.address();
  await new Promise(resolve=>socket.close(resolve));
  return port;
}

async function measure(page,label,verify){
  await page.locator('#experimentFile').setInputFiles({
    name:'wire-curve.json',mimeType:'application/json',buffer:Buffer.from(serializeExperiment(experiment,name))
  });
  await page.waitForFunction(name=>document.getElementById('activeExperimentName').textContent===name,name);
  await page.locator('#workspace').evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished));});
  const wire=page.locator('.wire-base');
  const geometry=await wire.evaluate(el=>{
    const {a,d,e,f}=el.getScreenCTM();
    return {a,d,e,f,dpr:devicePixelRatio,zoom:+el.ownerSVGElement.dataset.zoom,
      uiZoom:+getComputedStyle(document.documentElement).zoom,path:el.getAttribute('d')};
  });
  const {a,d,e,f,dpr,zoom,uiZoom}=geometry;
  assert.equal(zoom,5);
  assert.equal(uiZoom,1);
  const left=Math.floor(a*348+e),top=Math.floor(d*184+f);
  const clip={x:left,y:top,width:Math.ceil(a*391+e)-left,height:Math.ceil(d*296+f)-top};
  assert.ok(clip.x>0&&clip.y>0);
  const png=await page.screenshot({path:`${artifacts}/${label}.png`,clip,scale:'device'});
  const rows=Array.from({length:97},(_,i)=>{
    const y=Math.floor((d*(192+i)+f-top)*dpr),worldY=(top+(y+.5)/dpr-f)/d;
    return {y,worldY,expected:idealWireX(worldY)};
  });
  const centers=await page.evaluate(async({png,rows,geometry,clip})=>{
    const bytes=Uint8Array.from(atob(png),char=>char.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
    const context=canvas.getContext('2d');
    context.drawImage(bitmap,0,0);
    const {width,height,data}=context.getImageData(0,0,bitmap.width,bitmap.height);
    const {a,e,dpr}=geometry;
    const centers=rows.map(({y,expected})=>{
      const start=Math.floor(((expected-7)*a+e-clip.x)*dpr),end=Math.ceil(((expected+7)*a+e-clip.x)*dpr);
      let first=-1,last=-1;
      for(let x=start;x<=end;x++){
        const offset=4*(y*width+x);
        const red=data[offset],green=data[offset+1];
        if(red>90&&red-green>30){if(first===-1)first=x;last=x;}
      }
      if(first===-1)throw Error(JSON.stringify({y,start,end,width,height,clip,geometry}));
      return (clip.x+(first+last+1)/(2*dpr)-e)/a;
    });
    return {width,height,centers};
  },{png:png.toString('base64'),rows,geometry,clip});
  assert.ok(Math.abs(centers.width-clip.width*dpr)<=2);
  assert.ok(Math.abs(centers.height-clip.height*dpr)<=2);
  const rms=values=>Math.hypot(...values)/Math.sqrt(values.length);
  const residuals=centers.centers.map((x,i)=>x-rows[i].expected);
  const ripple=rms(residuals.slice(1,-1).map((x,i)=>residuals[i]-2*x+residuals[i+2]));
  const deviation=rms(residuals);
  if(verify){
    assert.ok(ripple<.10&&deviation<.65,JSON.stringify({label,dpr,ripple,deviation}));
    const activeState=()=>JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'))
      .experiments.find(experiment=>experiment.name==='导线曲线测试')?.state;
    await page.waitForFunction(activeState);
    assert.deepEqual(await page.evaluate(activeState).then(state=>state.wires[0].physicalVia),physicalVia);
    const midpoint=await wire.evaluate(el=>{
      const p=el.getPointAtLength(el.getTotalLength()*.57);
      const screen=p.matrixTransform(el.getScreenCTM());
      return {x:p.x,y:p.y,screenX:screen.x,screenY:screen.y};
    });
    await page.locator('[data-tool="junction"]').click();
    await page.mouse.click(midpoint.screenX,midpoint.screenY);
    await page.locator('[data-junction="n20"]').waitFor({state:'attached'});
    assert.equal(await page.locator('.wire-base').count(),2);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'))
      .experiments.find(experiment=>experiment.name==='导线曲线测试').state.wires.length===2);
    const node=(await page.evaluate(activeState)).junctions.find(node=>node.id==='n20');
    assert.ok(Math.hypot(node.x-midpoint.x,node.y-midpoint.y)<.2,JSON.stringify({node,midpoint}));
  }
  return {label,dpr,zoom,uiZoom,ripple,deviation,path:geometry.path};
}

async function runBrowser(directory,label,verify){
  const port=await freePort();
  const server=spawn(process.execPath,['server.mjs'],{
    cwd:directory,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','inherit']
  });
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      server.stdout.once('data',resolve);
      server.once('error',reject);
      server.once('exit',code=>reject(Error(`Web server exited ${code}`)));
    });
    browser=await chromium.launch({channel:process.env.CIRCUIT_LAB_BROWSER||'msedge',headless:true});
    const result=[];
    for(const deviceScaleFactor of [1,1.25]){
      const context=await browser.newContext({viewport,deviceScaleFactor,colorScheme:'dark'});
      const page=await context.newPage();
      await page.goto(`http://127.0.0.1:${port}`);
      const report=await measure(page,`${label}-${deviceScaleFactor*100}`,verify);
      assert.equal(report.dpr,deviceScaleFactor);
      result.push(report);
      await context.close();
    }
    assert.equal(result[0].path,result[1].path);
    return result;
  }finally{
    server.kill();
    await browser?.close();
  }
}

async function runNative(executable,label,verify){
  const port=await freePort(),endpoint=`http://127.0.0.1:${port}`;
  const profile=await mkdtemp(path.join(tmpdir(),'circuit-lab-wire-test-'));
  const child=spawn(executable,[],{windowsHide:true,env:{
    ...process.env,CIRCUIT_LAB_SYSTEM_DATA_DIR:profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`
  }});
  let browser,spawnError;
  child.on('error',error=>{spawnError=error;});
  try{
    for(let i=0;i<100;i++){
      if(spawnError)throw spawnError;
      if(child.exitCode!==null)throw Error(`Windows application exited ${child.exitCode}`);
      const response=await fetch(endpoint+'/json/list').catch(()=>null);
      if(response?.ok&&(await response.json()).some(target=>target.type==='page'))break;
      await wait(100);
    }
    browser=await chromium.connectOverCDP(endpoint,{timeout:5000});
    const [page]=browser.contexts()[0].pages();
    await page.waitForSelector('[data-add]',{state:'attached'});
    return await measure(page,label,verify);
  }finally{
    child.kill();
    await browser?.close();
  }
}

function compare(before,after){
  assert.equal(before.dpr,after.dpr);
  assert.ok(after.ripple<before.ripple*.6,JSON.stringify({before,after}));
}

await mkdir(artifacts,{recursive:true});
const reports=await runBrowser(process.cwd(),'fixed',true);
if(process.env.CIRCUIT_LAB_WIRE_BASELINE){
  const before=await runBrowser(process.env.CIRCUIT_LAB_WIRE_BASELINE,'beta6',false);
  before.forEach((report,i)=>compare(report,reports[i]));
  reports.push(...before);
}
if(process.env.CIRCUIT_LAB_WIRE_NATIVE_FIXED){
  const fixed=await runNative(process.env.CIRCUIT_LAB_WIRE_NATIVE_FIXED,'windows-fixed',true);
  reports.push(fixed);
  if(process.env.CIRCUIT_LAB_WIRE_NATIVE_BASELINE){
    const before=await runNative(process.env.CIRCUIT_LAB_WIRE_NATIVE_BASELINE,'windows-beta6',false);
    compare(before,fixed);
    reports.push(before);
  }
}
const metrics=reports.map(({path,...report})=>report);
await writeFile(`${artifacts}/report.json`,JSON.stringify(metrics,null,2));
console.log(JSON.stringify(metrics,null,2));
