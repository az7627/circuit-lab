import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPreset,component,definitions} from '../dist/models.js';
import {normalizeState} from '../dist/data.js';
import {serializeExperiment,parseExperiment} from '../dist/files.js';
import {ExperimentStore} from '../dist/experiments.js';
import {solveCircuit} from '../dist/solver.js';
import {componentTerminal} from '../dist/visuals.js';
import {physicalSymbol,physicalHitBounds,physicalBounds} from '../dist/physical.js';
import {terminalIndices} from '../dist/terminals.js';
import {wirePoints,projectOnWire,splitWire,simplifyTrace,tracedRoute} from '../dist/wiring.js';

test('both representations retain topology, readings and their independent routes after file and storage round trips',()=>{
  const state=createPreset('series'),before=solveCircuit(state.components,state.wires,state.junctions);
  state.viewMode='physical';state.wires[0].physicalVia=[{x:92,y:210},{x:49,y:95},{x:200,y:60}];
  const original=JSON.stringify(state),file=parseExperiment(serializeExperiment(state,'实物实验')).state;
  let saved=null;const storage={getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};
  new ExperimentStore(storage).save(file,'实物实验');
  const restored=new ExperimentStore(storage).data.experiments[0].state;
  assert.equal(restored.viewMode,'physical');assert.deepEqual(restored.wires,state.wires);assert.equal(JSON.stringify(state),original);
  for(const mode of ['schematic','physical','schematic']){restored.viewMode=mode;const result=solveCircuit(restored.components,restored.wires,restored.junctions);assert.equal(result.current,before.current);assert.equal(result.sourceVoltage,before.sourceVoltage);assert.deepEqual(result.components,before.components);}
  assert.equal(normalizeState({...state,viewMode:undefined}).viewMode,'schematic');
});

test('freehand routes retain loops and corners while reducing redundant pointer samples',()=>{
  const points=[{x:0,y:0},{x:1,y:0},{x:30,y:0},{x:30,y:30},{x:0,y:30},{x:0,y:0},{x:50,y:-10}];
  const simplified=simplifyTrace(points,.5);assert.equal(simplified.length,6);assert.deepEqual(simplified[0],points[0]);assert.deepEqual(simplified.at(-1),points.at(-1));assert.deepEqual(simplified[3],{x:0,y:30});
  const route=tracedRoute(points.slice(1,-1),points[0],points.at(-1),.5);assert.deepEqual(route,simplified.slice(1,-1));
  const dense=Array.from({length:8000},(_,i)=>({x:i,y:10*Math.sin(i/3)})),bounded=simplifyTrace(dense,.1,2048);assert.ok(bounded.length<=2048);assert.deepEqual(bounded.at(-1),dense.at(-1));
});

test('freehand geometry is used for hit testing and splitting without losing the alternate route',()=>{
  const positions={'e1:0':{x:0,y:0},'l1:0':{x:100,y:0}},point=key=>positions[key],wire={id:'w1',a:'e1:0',b:'l1:0',via:[{x:50,y:0}],physicalVia:[{x:0,y:50},{x:100,y:50}]};
  assert.deepEqual(wirePoints(wire,point,'physical'),[positions['e1:0'],...wire.physicalVia,positions['l1:0']]);
  assert.equal(projectOnWire(wire,{x:50,y:51},point,'physical').distance,1);
  const split=splitWire(wire,{x:50,y:51},point,'n20:0','w2','physical');positions['n20:0']=split.point;
  assert.deepEqual(split.point,{x:50,y:50});assert.deepEqual(split.wires[0].physicalVia,[{x:0,y:50}]);assert.deepEqual(split.wires[1].physicalVia,[{x:100,y:50}]);
  for(const mode of ['physical','schematic']){assert.deepEqual(wirePoints(split.wires[0],point,mode).at(-1),positions['n20:0']);assert.deepEqual(wirePoints(split.wires[1],point,mode)[0],positions['n20:0']);}
  const originalParts=[component('e1','battery',0,0,6),component('l1','lamp',100,0,10)];
  const oldResult=solveCircuit(originalParts,[wire,{id:'w3',a:'l1:1',b:'e1:1'}]),newResult=solveCircuit(originalParts,[...split.wires,{id:'w3',a:'l1:1',b:'e1:1'}],[{id:'n20',...split.point}]);assert.equal(newResult.current,oldResult.current);
});

test('all physical parts and rotated terminals fit their body and camera bounds',()=>{
  for(const type of Object.keys(definitions))for(const angle of [0,90,180,270]){
    const c=component('x1',type,200,300,undefined,angle),box=physicalHitBounds(c),bounds=physicalBounds(c),svg=physicalSymbol(c,{current:.6,voltage:6,power:3.6});
    assert.ok(svg.includes('physical-part'));assert.ok(!svg.includes('NaN'));assert.ok(!svg.includes('undefined'));
    for(const i of terminalIndices(type)){const p=componentTerminal(c,i);for(const b of [box,bounds])assert.ok(p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height,`${type} at ${angle}, terminal ${i}`);}
  }
});

test('a loop with overlapping terminals can still be split in physical view',()=>{
  const wire={id:'w1',a:'n1:0',b:'n2:0',physicalVia:[{x:0,y:50},{x:50,y:50},{x:50,y:0}]},point=()=>({x:0,y:0});
  const result=splitWire(wire,{x:25,y:50},point,'n3:0','w2','physical');assert.deepEqual(result.point,{x:25,y:50});assert.equal(result.wires.length,2);assert.ok(result.wires.every(w=>Array.isArray(w.via)&&Array.isArray(w.physicalVia)));
});

test('invalid or excessive physical routes are rejected without corrupting old experiments',()=>{
  const state=createPreset('series');
  for(const route of [[null],[{x:NaN,y:0}],'bad',Array.from({length:2049},()=>({x:0,y:0}))]){state.wires[0].physicalVia=route;assert.equal(normalizeState(state),null);}
  state.wires[0].physicalVia=[];assert.ok(normalizeState(state));delete state.wires[0].physicalVia;assert.ok(normalizeState(state));
});
