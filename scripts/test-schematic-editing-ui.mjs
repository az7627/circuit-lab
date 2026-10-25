import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {voltmeterTapCircuit,bypassCircuit} from '../tests/fixtures/schematic-editing.mjs';
import {serializeExperiment} from '../dist/files.js';
import {component} from '../dist/models.js';
import {solveCircuit} from '../dist/solver.js';
import {countWireCrossings} from '../dist/layout.js';

const root=fileURLToPath(new URL('../',import.meta.url)),artifacts=new URL('../artifacts/editing/',import.meta.url);
await mkdir(artifacts,{recursive:true});
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited: ${code}`)));});
const browser=await chromium.launch({channel:process.env.CIRCUIT_LAB_BROWSER||'chrome',headless:true}),errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack));
const stored=()=>page.evaluate(()=>{const data=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return data.experiments.find(e=>e.id===data.activeId).state;});
const waitWires=count=>page.waitForFunction(count=>{const data=JSON.parse(localStorage.getItem('circuit-lab-experiments-v2'));return data.experiments.find(e=>e.id===data.activeId).state.wires.length===count;},count);
const stable=(before,after)=>{assert.deepEqual(after.components,before.components);assert.deepEqual(after.wires.filter(w=>before.wires.some(old=>old.id===w.id)),before.wires);};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function load(state,name){
  await page.locator('#experimentFile').setInputFiles({name:`${name}.json`,mimeType:'application/json',buffer:Buffer.from(serializeExperiment(state,name))});
  await page.waitForFunction(name=>document.getElementById('activeExperimentName').textContent===name,name);await page.locator('#fitButton').click();await page.waitForTimeout(350);
}
async function connect(a,b,count){await page.locator('button[data-tool="junction"]').click();await page.locator(`[data-terminal="${a}"]`).click();await page.locator(`[data-terminal="${b}"]`).click();await waitWires(count);}
async function shot(name){await page.locator('button[data-tool="select"]').click();await page.waitForFunction(()=>!document.getElementById('toast').classList.contains('visible'));await page.waitForTimeout(240);await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,artifacts))});await page.locator('#boardWrap').screenshot({path:fileURLToPath(new URL(`${name}-canvas.png`,artifacts))});}
async function undoReload(original,edited){
  await page.locator('#undoButton').click();await waitWires(original.wires.length);assert.deepEqual((await stored()).wires,original.wires);
  await page.locator('#redoButton').click();await waitWires(edited.wires.length);assert.deepEqual((await stored()).wires,edited.wires);
  await page.reload();await page.waitForSelector('[data-component="e1"]');await page.waitForTimeout(300);assert.deepEqual((await stored()).wires,edited.wires);
}
try{
  await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>document.querySelectorAll('[data-add]').length===15);
  await load(voltmeterTapCircuit(),'电压表端子接线');const measurement=await stored();
  await connect('v1:1','l1:1',measurement.wires.length+1);const measured=await stored();stable(measurement,measured);assert.deepEqual(measured.junctions,measurement.junctions);assert.equal(countWireCrossings(measured),0);close(solveCircuit(measured.components,measured.wires,measured.junctions).components.v1.voltage,0);
  await undoReload(measurement,measured);await shot('voltmeter-tap');

  await load(bypassCircuit(),'直接跨接两只灯泡');const original=await stored();await connect('l1:0','l2:1',original.wires.length+1);const bypass=await stored();stable(original,bypass);assert.deepEqual(bypass.junctions,original.junctions);assert.equal(countWireCrossings(bypass),0);
  const solved=solveCircuit(bypass.components,bypass.wires,bypass.junctions);close(solved.components.l1.current,0);close(solved.components.l2.current,0);close(Math.abs(solved.components.l3.current),.6);
  await undoReload(original,bypass);await shot('direct-bypass');

  await load(bypassCircuit(),'经过手动节点跨接');await page.locator('#zoomOut').click();await page.waitForTimeout(300);const manual=await stored();await page.locator('button[data-tool="junction"]').click();await page.locator('[data-terminal="l1:0"]').click();
  const target=await page.locator('#board').evaluate(board=>{const p=board.createSVGPoint();p.x=340;p.y=70;const q=p.matrixTransform(board.getScreenCTM());return {x:q.x,y:q.y};});await page.mouse.click(target.x,target.y);await waitWires(manual.wires.length+1);
  const halfway=await stored(),node=halfway.junctions.find(n=>!manual.junctions.some(old=>old.id===n.id));assert.ok(node);assert.equal(node.x,340);assert.equal(node.y,70);stable(manual,halfway);
  await connect(`${node.id}:0`,'l2:1',manual.wires.length+2);const completed=await stored();stable(halfway,completed);assert.deepEqual(completed.junctions,halfway.junctions);assert.equal(countWireCrossings(completed),0);
  await undoReload(halfway,completed);await shot('manual-node-bypass');

  const switched=bypassCircuit();switched.components.push(component('s2','switch',380,70));await load(switched,'开关跨接对照');const baseline=await stored();await connect('l1:0','s2:0',baseline.wires.length+1);await connect('s2:1','l2:1',baseline.wires.length+2);const closed=await stored();stable(baseline,closed);assert.equal(countWireCrossings(closed),0);close(Math.abs(solveCircuit(closed.components,closed.wires,closed.junctions).components.l3.current),.6);await shot('switch-bypass');
  assert.deepEqual(errors,[]);console.log('真实点击电压表接线、直接短接、手动节点跨接和开关对照通过；原线路、节点位置、撤销重做及重载均保持正确。');
}catch(error){await page.screenshot({path:fileURLToPath(new URL('failed.png',artifacts))}).catch(()=>{});await writeFile(new URL('error.txt',artifacts),`${error.stack}\n${errors.join('\n')}`);throw error;}
finally{await browser.close();server.kill();}
