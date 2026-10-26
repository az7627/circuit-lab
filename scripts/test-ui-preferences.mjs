import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {component,createPreset} from '../dist/models.js';
import {serializeExperiment} from '../dist/files.js';
import {CircuitSimulation} from '../dist/simulation.js';

const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const browser=await chromium.launch({channel:process.env.CIRCUIT_LAB_BROWSER||'msedge',headless:true}),reports=[],errors=[];
let page;
const settle=()=>page.waitForTimeout(350);
async function settings(){if(await page.locator('#settingsButton').evaluate(el=>!!el.closest('#headerActionsMenu')?.hidden))await page.locator('#headerMoreButton').click();await page.locator('#settingsButton').click();}
async function load(state,name){await page.locator('#experimentFile').setInputFiles({name:'preferences.json',mimeType:'application/json',buffer:Buffer.from(serializeExperiment(state,name))});await page.waitForFunction(name=>document.getElementById('activeExperimentName').textContent===name,name);await settle();}
const select=async id=>{await page.locator(`[data-component="${id}"]`).focus();await page.keyboard.press('Enter');};
try{
  await mkdir('artifacts/ui-preferences',{recursive:true});
  for(const viewport of [{width:1600,height:1000},{width:420,height:900}]){
    const context=await browser.newContext({viewport,colorScheme:'dark',hasTouch:true});page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack));
    await page.goto(`http://127.0.0.1:${port}`);await page.waitForSelector('[data-add]',{state:'attached'});
    const tiny=createPreset('free');tiny.components=[component('e1','battery',180,350,3),component('r1','resistor',180,150,100),{...component('c1','capacitor',450,150,100000),chargeVoltage:2.99997},component('a1','ammeter',450,350),component('v1','voltmeter',315,230)];
    tiny.wires=[['e1:0','r1:0'],['r1:1','c1:0'],['c1:1','a1:0'],['a1:1','e1:1'],['r1:0','v1:0'],['r1:1','v1:1']].map(([a,b],i)=>({id:`w${i}`,a,b}));
    const raw=new CircuitSimulation().read(tiny.components,tiny.wires);assert.ok(Math.abs(raw.components.a1.current)>1e-9&&Math.abs(raw.components.a1.current)<1e-6);
    for(const mode of ['schematic','physical']){
      tiny.viewMode=mode;await load(tiny,`微小读数 ${mode}`);
      assert.equal(await page.locator('[data-component="a1"] .component-value').textContent(),'0.00 A');assert.equal(await page.locator('[data-component="v1"] .component-value').textContent(),'0.00 V');assert.equal(await page.locator('.wire-flow').count(),0);
      await select('a1');assert.equal(await page.locator('#selectedCurrent').textContent(),'0.00 A');await select('v1');assert.equal(await page.locator('#selectedVoltage').textContent(),'0.00 V');
    }
    await load(createPreset('ohm'),'界面缩放');
    const header=await page.locator('.site-header').boundingBox();await settings();
    for(const scale of [.75,1.25,2,1]){
      await page.locator('#uiScaleSetting').selectOption(String(scale));await settle();
      const layout=await page.evaluate(()=>{const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {header:box('.site-header'),body:box('body'),dialog:box('#settingsDialog'),setting:box('#uiScaleSetting'),root:document.documentElement.clientWidth};});
      assert.ok(Math.abs(layout.header.height-header.height*scale)<2,JSON.stringify(layout));assert.ok(Math.abs(layout.body.height-viewport.height)<2,JSON.stringify(layout));
      assert.ok(layout.dialog.x>=-1&&layout.dialog.right<=viewport.width+1&&layout.dialog.y>=-1&&layout.dialog.bottom<=viewport.height+1,JSON.stringify(layout));
      assert.ok(layout.setting.x>=layout.dialog.x&&layout.setting.right<=layout.dialog.right+1,JSON.stringify(layout));
      if(scale===2)await page.screenshot({path:`artifacts/ui-preferences/settings-${viewport.width}-200.png`});
    }
    await page.locator('#uiScaleSetting').selectOption('1.25');await settle();await page.reload();await page.waitForSelector('[data-component="e1"]');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).zoom),'1.25');await settings();assert.equal(await page.locator('#uiScaleSetting').inputValue(),'1.25');await page.locator('[data-close="settingsDialog"]').click();await settle();
    const card=page.locator('[data-add="resistor"]');await card.scrollIntoViewIfNeeded();const from=await card.boundingBox(),board=await page.locator('#board').boundingBox(),to={x:board.x+board.width*.2,y:board.y+board.height*.3};
    const expected=await page.locator('#board').evaluate((el,point)=>{const p=el.createSVGPoint();p.x=point.x;p.y=point.y;const q=p.matrixTransform(el.getScreenCTM().inverse());return {x:Math.round(q.x/10)*10,y:Math.round(q.y/10)*10};},to);
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:6});
    const preview=await page.locator('.library-drag-preview').boundingBox();assert.ok(Math.abs(preview.x+preview.width/2-to.x)<2&&Math.abs(preview.y+preview.height/2-to.y)<2,'Scaled drag preview must stay under the pointer');
    await page.mouse.up();await settle();const placed=await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments.find(e=>e.id===d.activeId).state.components.find(c=>c.id==='r2');});
    assert.equal(placed.x,expected.x);assert.equal(placed.y,expected.y);
    if(await page.locator('#headerMoreButton').isVisible()){
      await page.locator('#headerMoreButton').click();const menu=await page.locator('#headerActionsMenu').boundingBox(),button=await page.locator('#headerMoreButton').boundingBox();assert.ok(menu.y>=button.y+button.height&&menu.y-button.y-button.height<20,'Scaled overflow menu must be anchored below its button');await page.keyboard.press('Escape');
    }
    await mkdir('artifacts/ui-preferences',{recursive:true});await page.screenshot({path:`artifacts/ui-preferences/scale-${viewport.width}.png`});reports.push({viewport,thresholds:true,scaleRange:true,persistence:true,dragPlacement:true});await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile('artifacts/ui-preferences/report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}catch(error){if(page&&!page.isClosed()){await mkdir('artifacts/ui-preferences',{recursive:true});await page.screenshot({path:'artifacts/ui-preferences/failed.png'}).catch(()=>{});}throw error;}
finally{await browser.close();server.kill();}
