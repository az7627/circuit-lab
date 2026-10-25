import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {serializeExperiment,parseExperiment} from '../dist/files.js';
import {component,createPreset} from '../dist/models.js';
import {screenshotCircuit} from '../tests/fixtures/screenshot-circuit.mjs';
import {directTerminalCircuit} from '../tests/fixtures/direct-terminal-circuit.mjs';
import {seriesReturnCircuit} from '../tests/fixtures/series-return-circuit.mjs';
import {electricalSignature} from '../dist/connections.js';
import {countWireCrossings} from '../dist/layout.js';

const root=fileURLToPath(new URL('../',import.meta.url)),artifacts=new URL('../artifacts/circuits/',import.meta.url);
await mkdir(artifacts,{recursive:true});
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
const browser=await chromium.launch({channel:process.env.CIRCUIT_LAB_BROWSER||'chrome',headless:true}),errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack));
const shot=async name=>{await page.waitForFunction(()=>!document.getElementById('toast').classList.contains('visible'));await page.waitForTimeout(220);await page.screenshot({path:fileURLToPath(new URL(name,artifacts))});if(name.startsWith('direct-')&&!name.includes('light'))await page.locator('#boardWrap').screenshot({path:fileURLToPath(new URL(name.replace('.png','-canvas.png'),artifacts))});};
const imported=async(state,name)=>{await page.locator('#experimentFile').setInputFiles({name:`${name}.json`,mimeType:'application/json',buffer:Buffer.from(serializeExperiment(state,name))});await page.waitForFunction(name=>document.getElementById('activeExperimentName').textContent===name,name);await page.waitForTimeout(250);};
const select=async id=>{await page.locator('button[data-tool="select"]').click();await page.locator(`[data-component="${id}"]`).focus();await page.locator(`[data-component="${id}"]`).press('Enter');};
const persisted=()=>page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments.find(e=>e.id===d.activeId).state;});
try{
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>document.querySelectorAll('[data-add]').length===15);
  const direct=directTerminalCircuit(),ends=direct.wires.map(w=>[w.a,w.b]);direct.wires=[];
  await imported(direct,'端子直连回归');await page.locator('#fitButton').click();await page.waitForTimeout(300);await page.locator('button[data-tool="junction"]').click();
  for(const [a,b] of ends){await page.locator(`[data-terminal="${a}"]`).click();await page.locator(`[data-terminal="${b}"]`).click();}
  await page.locator('button[data-tool="select"]').click();await page.waitForTimeout(250);assert.equal((await persisted()).junctions.length,0);await shot('direct-schematic.png');
  const directStarted=performance.now();await page.locator('[data-view-mode="physical"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='physical'&&!document.querySelector('#board').hasAttribute('aria-busy'));const directSwitchMs=performance.now()-directStarted;
  await page.waitForTimeout(250);assert.equal(await page.locator('[data-junction]').count(),0);await shot('direct-physical.png');const actual=await persisted();assert.equal(electricalSignature(actual),electricalSignature(directTerminalCircuit()));assert.equal(countWireCrossings(actual,'physical'),0);
  await page.emulateMedia({colorScheme:'light'});await shot('direct-physical-light.png');await page.emulateMedia({colorScheme:'dark'});
  const reconstructed=await persisted();delete reconstructed.layouts.schematic;await imported(reconstructed,'实物反推电路');await page.locator('[data-view-mode="schematic"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='schematic');await shot('direct-generated-schematic.png');
  const forward=directTerminalCircuit();for(const w of forward.wires)for(const end of ['a','b']){if(w[end]==='a1:0')w[end]='a1:1';else if(w[end]==='a1:1')w[end]='a1:2';}await imported(forward,'正接小量程支路');await page.locator('[data-view-mode="physical"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='physical');await shot('direct-forward-physical.png');assert.equal(countWireCrossings(await persisted(),'physical'),0);
  const returning=seriesReturnCircuit();await imported(returning,'串联返回无交叉');await page.locator('#fitButton').click();await shot('direct-return-schematic.png');
  const returnStarted=performance.now();await page.locator('[data-view-mode="physical"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='physical'&&!document.querySelector('#board').hasAttribute('aria-busy'));const returnSwitchMs=performance.now()-returnStarted;
  await shot('direct-return-physical.png');const returnPhysical=await persisted();assert.equal(electricalSignature(returnPhysical),electricalSignature(returning));assert.equal(countWireCrossings(returnPhysical,'physical',{sharedRadius:8}),0);
  await select('l2');await page.locator('#deleteSelected').click();await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return !d.experiments.find(e=>e.id===d.activeId).state.components.some(c=>c.id==='l2');});assert.doesNotMatch(await page.locator('#toast').textContent(),/空间不足|校验未通过/);
  const downloadPromise=page.waitForEvent('download');await page.locator('#experimentExportButton').click();const exported=await downloadPromise,exportPath=fileURLToPath(new URL('return-after-delete.json',artifacts));await exported.saveAs(exportPath);assert.equal(parseExperiment(await readFile(exportPath,'utf8')).state.components.length,5);
  await page.locator('#undoButton').click();await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments.find(e=>e.id===d.activeId).state.components.length===6;});await page.locator('#redoButton').click();await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments.find(e=>e.id===d.activeId).state.components.length===5;});
  await page.reload();await page.waitForSelector('[data-component="s1"]');assert.equal(await page.locator('[data-component]').count(),5);await page.waitForTimeout(300);
  const savedBeforeQuota=await page.evaluate(()=>localStorage.getItem('circuit-lab-experiments-v2'));
  await page.evaluate(()=>{const original=Storage.prototype.setItem;window.circuitSaveFailure='QuotaExceededError';Storage.prototype.setItem=function(key,value){if(key==='circuit-lab-experiments-v2'&&window.circuitSaveFailure)throw new DOMException('Simulated storage failure',window.circuitSaveFailure);return original.call(this,key,value);};});
  await page.locator('[data-add="resistor"]').click();await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('为此应用分配的存储空间不足'));assert.equal(await page.evaluate(()=>localStorage.getItem('circuit-lab-experiments-v2')),savedBeforeQuota);
  await page.evaluate(()=>window.circuitSaveFailure='');await page.keyboard.press('Control+s');await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments.find(e=>e.id===d.activeId).state.components.length===6;});
  const savedBeforePermission=await page.evaluate(()=>localStorage.getItem('circuit-lab-experiments-v2'));await page.evaluate(()=>window.circuitSaveFailure='SecurityError');await page.locator('#propertyNumber').fill('30');await page.locator('#propertyNumber').press('Tab');await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('阻止了此应用使用本地存储'));assert.equal(await page.evaluate(()=>localStorage.getItem('circuit-lab-experiments-v2')),savedBeforePermission);
  await page.evaluate(()=>window.circuitSaveFailure='');await page.keyboard.press('Control+s');await page.waitForFunction(()=>{const d=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return d.experiments.find(e=>e.id===d.activeId).state.components.find(c=>c.id==='r1')?.value===30;});await page.reload();await page.waitForSelector('[data-component="r1"]');
  for(const preset of ['series','parallel','ohm']){await imported(createPreset(preset),`结构回归 ${preset}`);await page.locator('[data-view-mode="physical"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='physical');await shot(`structure-${preset}.png`);}
  const twoWay=createPreset('free');twoWay.components=[component('e1','battery',0,0,6),component('d1','spdt',100,0),component('d2','spdt',200,0),component('l1','lamp',300,0,10)];twoWay.wires=[['e1:0','d1:0'],['d1:1','d2:1'],['d1:2','d2:2'],['d2:0','l1:0'],['l1:1','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));await imported(twoWay,'双控无交叉回归');await page.locator('[data-view-mode="physical"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='physical');await shot('structure-two-way.png');assert.equal(countWireCrossings(await persisted(),'physical',{sharedRadius:8}),0);
  await imported(screenshotCircuit(),'三灯双表回归');await page.locator('#fitButton').click();await page.waitForTimeout(300);assert.ok(await page.locator('.connection-dot').count()>=4);await shot('schematic.png');
  const started=performance.now();await page.locator('[data-view-mode="physical"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='physical'&&!document.querySelector('#board').hasAttribute('aria-busy'));const switchMs=performance.now()-started;
  await page.waitForTimeout(300);assert.equal(await page.locator('[data-junction]').count(),0);assert.equal(await page.locator('[data-wire]').count(),9);assert.equal(await page.locator('[data-component="l1"] .physical-symbol circle').count(),0);await shot('physical.png');
  await page.locator('[data-view-mode="schematic"]').click();await page.waitForFunction(()=>document.querySelector('#board').dataset.viewMode==='schematic');await page.waitForTimeout(250);assert.equal((await persisted()).junctions.length,6);
  await page.reload();await page.waitForSelector('[data-component="e1"]');await select('e1');await page.locator('#internalResistance').fill('2');await page.locator('#internalResistance').press('Tab');assert.match(await page.locator('#componentPhysics').textContent(),/路端电压/);await shot('battery.png');

  const dynamics=createPreset('free');dynamics.viewMode='physical';dynamics.simulationRate=.1;
  dynamics.components=[component('e1','battery',200,420,6),component('r1','resistor',200,160,100),component('c1','capacitor',500,160,10000),component('m1','motor',500,420,12)];
  dynamics.wires=[['e1:0','r1:0'],['r1:1','c1:0'],['c1:1','e1:1'],['e1:0','m1:0'],['m1:1','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  await imported(dynamics,'充放电与电机');await select('c1');await page.locator('#simulationRate').selectOption('0.01');await page.locator('#dischargeCapacitor').click();const early=await page.locator('#componentPhysics').textContent();await page.waitForTimeout(500);assert.notEqual(await page.locator('#componentPhysics').textContent(),early);await shot('capacitor.png');
  await select('m1');await page.locator('#motorStall').click();assert.match(await page.locator('#motorStall').textContent(),/释放/);assert.match(await page.locator('#componentPhysics').textContent(),/机械功率 0.00 W/);await page.locator('#motorStall').click();await page.waitForTimeout(600);await shot('motor.png');
  await page.locator('[data-add="rheostat"]').click();const rheostat=await page.locator('[data-component^="t"]').getAttribute('data-component');assert.equal(await page.locator(`[data-owner-component="${rheostat}"]`).count(),3);await page.locator('#sliderPosition').fill('75');assert.match(await page.locator('#componentPhysics').textContent(),/15.00 Ω/);await shot('rheostat.png');
  await page.locator('[data-add="led"]').click();assert.equal(await page.locator('[data-add="led"]').count(),1);assert.ok(await page.locator('.physical-led-body').count());await shot('led.png');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);await shot('mobile.png');
  assert.deepEqual(errors,[]);await writeFile(new URL('timing.json',artifacts),JSON.stringify({directSwitchMs,switchMs,returnSwitchMs},null,2));console.log(`电路互转、无交叉串联返回、删元件保存与导出、配额及权限错误区分、元件动态界面通过；端子直连 ${Math.round(directSwitchMs)} ms，带分支节点 ${Math.round(switchMs)} ms，串联返回 ${Math.round(returnSwitchMs)} ms。`);
}catch(error){await shot('failed.png').catch(()=>{});await writeFile(new URL('error.txt',artifacts),`${error.stack}\n${errors.join('\n')}`);throw error;}
finally{await browser.close();server.kill();}
