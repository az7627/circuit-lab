import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {component,createPreset} from '../dist/models.js';
import {serializeExperiment} from '../dist/files.js';

const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const browser=await chromium.launch({channel:process.env.CIRCUIT_LAB_BROWSER||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results=[];
page.on('pageerror',error=>errors.push(error.stack));
if(process.argv.includes('--baseline'))await page.route('**/workbench.js*',route=>route.fulfill({contentType:'text/javascript',body:execFileSync('git',['show','v2.10.0-beta.2:dist/workbench.js'],{encoding:'utf8',windowsHide:true})}));
const load=async(state,name)=>{await page.locator('#experimentFile').setInputFiles({name:'flow.json',mimeType:'application/json',buffer:Buffer.from(serializeExperiment(state,name))});await page.waitForFunction(name=>document.getElementById('activeExperimentName').textContent===name,name);await page.waitForTimeout(350);};
const select=async id=>{await page.locator(`[data-component="${id}"]`).focus();await page.keyboard.press('Enter');};
async function track(){
  await page.waitForFunction(()=>{const animation=document.querySelector('.wire-flow')?.getAnimations()[0];return animation&&animation.startTime!==null;});
  await page.evaluate(()=>{window.flowReferences=[...document.querySelectorAll('.wire-flow')].map(node=>{const animation=node.getAnimations()[0];return {node,animation,start:animation.startTime,time:animation.currentTime,wire:node.parentElement.dataset.wire};});});
}
async function check(label){
  const report=await page.evaluate(()=>window.flowReferences.map(({node,animation,start,time,wire})=>({wire,connected:node.isConnected,sameNode:node===document.querySelector(`[data-wire="${wire}"] .wire-flow`),sameAnimation:node.getAnimations()[0]===animation,startPreserved:animation.startTime===start,elapsed:animation.currentTime-time})));
  assert.ok(report.length>0,label);
  for(const flow of report){assert.ok(flow.connected&&flow.sameNode&&flow.sameAnimation&&flow.startPreserved,`${label}: animation restarted: ${JSON.stringify(flow)}`);assert.ok(flow.elapsed>400,`${label}: animation must keep progressing`);}
  results.push({label,wires:report.length,continuous:true});
}
try{
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForSelector('[data-add]',{state:'attached'});
  for(const mode of ['schematic','physical']){
    const circuit=createPreset('ohm');circuit.viewMode=mode;await load(circuit,`持续调节 ${mode}`);await select('e1');await track();
    await page.evaluate(async()=>{for(let i=0;i<60;i++){const input=document.getElementById('propertyRange');input.value=String(2+(i%20)*.5);input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(requestAnimationFrame);}});
    await check(`${mode}: changing voltage every frame`);
    await select('r1');await track();
    await page.evaluate(async()=>{for(let i=0;i<60;i++){const input=document.getElementById('propertyRange');input.value=String(5+i%25);input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(requestAnimationFrame);}});
    await check(`${mode}: changing resistance/current every frame`);
    const dynamic=createPreset('free');dynamic.viewMode=mode;dynamic.simulationRate=.01;
    dynamic.components=[component('e1','battery',180,350,6),component('r1','resistor',180,150,100),component('c1','capacitor',460,150,100000),component('m1','motor',460,350,12)];
    dynamic.wires=[['e1:0','r1:0'],['r1:1','c1:0'],['c1:1','e1:1'],['e1:0','m1:0'],['m1:1','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
    await load(dynamic,`动态电流 ${mode}`);await track();await page.waitForTimeout(800);await check(`${mode}: capacitor/motor simulation updates`);
    await page.locator('#currentToggle').evaluate(input=>{input.checked=false;input.dispatchEvent(new Event('change'));});assert.equal(await page.locator('.wire-flow').count(),0);
    await page.locator('#currentToggle').evaluate(input=>{input.checked=true;input.dispatchEvent(new Event('change'));});assert.ok(await page.locator('.wire-flow').count()>0);
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.wire-flow').first().evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
    await select('r1');await page.keyboard.press('Delete');assert.equal(await page.locator('[data-component="r1"]').count(),0);assert.equal(await page.locator('[data-wire="w1"]').count(),0);
    await page.locator('#undoButton').click();assert.equal(await page.locator('[data-wire="w1"]').count(),1);
  }
  assert.deepEqual(errors,[]);await mkdir('artifacts/current-flow',{recursive:true});await writeFile('artifacts/current-flow/report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.kill();}
