import assert from 'node:assert/strict';
import {test} from 'node:test';
import {voltmeterTapCircuit,bypassCircuit} from './fixtures/schematic-editing.mjs';
import {component} from '../dist/models.js';
import {routeCircuit,pointIn,routeIsClear,countWireCrossings,convertView} from '../dist/layout.js';
import {wirePoints} from '../dist/wiring.js';
import {electricalSignature,schematicJunctionDots} from '../dist/connections.js';
import {solveCircuit} from '../dist/solver.js';
import {serializeExperiment,parseExperiment} from '../dist/files.js';

const draw=state=>routeCircuit(state,'schematic',{preserveSchematic:true});
const points=(state,wire)=>wirePoints(wire,key=>pointIn(state,key,'schematic')).map(({x,y})=>({x,y}));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const stable=(state,old)=>assert.deepEqual(state.wires.filter(w=>old.some(before=>before.id===w.id)),old,'an edit must preserve established wire geometry');
const clear=state=>{assert.equal(countWireCrossings(state,'schematic'),0);for(const w of state.wires)assert.ok(routeIsClear(points(state,w),state,w,'schematic'),w.id);};

test('a voltmeter tap follows the existing horizontal lead without moving the right bus',()=>{
  const state=voltmeterTapCircuit(),original=structuredClone(state);draw(state);assert.deepEqual(state.wires,original.wires);
  state.wires.push({id:'w99',a:'v1:1',b:'l1:1'});const signature=electricalSignature(state);draw(state);stable(state,original.wires);assert.deepEqual(state.components,original.components);assert.deepEqual(state.junctions,original.junctions);
  assert.deepEqual(points(state,state.wires.at(-1)),[{x:596,y:345},{x:596,y:270},{x:494,y:270}]);assert.ok(schematicJunctionDots(state,k=>pointIn(state,k)).some(p=>p.x===596&&p.y===270));assert.equal(electricalSignature(state),signature);clear(state);
  state.components.find(c=>c.id==='s1').closed=true;draw(state);close(solveCircuit(state.components,state.wires,state.junctions).components.v1.voltage,0);stable(state,original.wires);
});

test('a direct bypass goes above the two lamps and leaves the main loop intact',()=>{
  const state=bypassCircuit();draw(state);const original=structuredClone(state);state.wires.push({id:'w99',a:'l1:0',b:'l2:1'});const signature=electricalSignature(state);draw(state);
  stable(state,original.wires);assert.deepEqual(state.components,original.components);assert.deepEqual(state.junctions,original.junctions);assert.equal(electricalSignature(state),signature);clear(state);
  const path=points(state,state.wires.at(-1));assert.ok(path.slice(1,-1).every(p=>p.y<190),'the bypass must stay above the symbols and labels');
  const dots=schematicJunctionDots(state,k=>pointIn(state,k));for(const x of [186,544])assert.ok(dots.some(p=>p.x===x&&p.y===230),'a branch directly at a terminal also needs a filled dot');
  const solution=solveCircuit(state.components,state.wires,state.junctions);close(solution.components.l1.current,0);close(solution.components.l2.current,0);close(Math.abs(solution.components.l3.current),.6);
});

test('completing a bypass through a hand-placed node retains the node and its first lead',()=>{
  const state=bypassCircuit();draw(state);const loop=structuredClone(state.wires);state.junctions.push({id:'n20',x:340,y:70});state.wires.push({id:'w99',a:'l1:0',b:'n20:0'});draw(state);const first=structuredClone(state.wires);
  state.wires.push({id:'w100',a:'n20:0',b:'l2:1'});draw(state);stable(state,loop);stable(state,first);assert.deepEqual(state.junctions.at(-1),{id:'n20',x:340,y:70});assert.deepEqual(points(state,state.wires.at(-1)),[{x:340,y:70},{x:544,y:70},{x:544,y:230}]);clear(state);
  const solution=solveCircuit(state.components,state.wires,state.junctions);close(solution.components.l1.current,0);close(solution.components.l2.current,0);close(Math.abs(solution.components.l3.current),.6);
});

test('a one-lamp short and a closed-switch bypass both retain their electrical effect',()=>{
  const short=bypassCircuit();draw(short);short.wires.push({id:'w99',a:'l1:0',b:'l1:1'});draw(short);clear(short);const result=solveCircuit(short.components,short.wires,short.junctions);close(result.components.l1.current,0);close(Math.abs(result.components.l2.current),.3);close(Math.abs(result.components.l3.current),.3);
  const state=bypassCircuit();draw(state);const original=structuredClone(state.wires);state.components.push(component('s2','switch',380,70));state.wires.push({id:'w99',a:'l1:0',b:'s2:0'});draw(state);state.wires.push({id:'w100',a:'s2:1',b:'l2:1'});draw(state);const traces=structuredClone(state.wires);
  for(const closed of [false,true,false,true]){state.components.find(c=>c.id==='s2').closed=closed;draw(state);assert.deepEqual(state.wires,traces);stable(state,original);clear(state);const solved=solveCircuit(state.components,state.wires,state.junctions);close(Math.abs(solved.components.l1.current),closed?0:.2);close(Math.abs(solved.components.l3.current),closed?.6:.2);}
});

test('later branches cannot collapse an already completed bypass back onto a single bus',()=>{
  const state=bypassCircuit();state.junctions=[];state.wires=[{id:'w1',a:'e1:1',b:'l1:0',via:[{x:130,y:650},{x:130,y:230}]},{id:'w2',a:'l1:1',b:'l2:0',via:[]},{id:'w3',a:'l2:1',b:'l3:0',via:[]},{id:'w4',a:'l3:1',b:'s1:1',via:[{x:850,y:230},{x:850,y:650}]},{id:'w5',a:'s1:0',b:'e1:0',via:[]}];
  routeCircuit(state);state.wires.push({id:'w99',a:'l1:0',b:'l2:1'});routeCircuit(state);const completed=structuredClone(state.wires);
  state.components.push(component('l4','lamp',1050,400,10));state.wires.push({id:'w100',a:'l4:0',b:'l1:0'});routeCircuit(state);stable(state,completed);clear(state);
});

test('edited measurement and bypass geometry survive files, reload routing and view round trips',()=>{
  for(const [make,a,b] of [[voltmeterTapCircuit,'v1:1','l1:1'],[bypassCircuit,'l1:0','l2:1']]){
    const state=make();draw(state);state.wires.push({id:'w99',a,b});draw(state);const original=structuredClone(state),loaded=parseExperiment(serializeExperiment(state,'编辑接线回归')).state;draw(loaded);assert.deepEqual(loaded.wires,original.wires);assert.equal(electricalSignature(loaded),electricalSignature(original));
    convertView(loaded,'physical');convertView(loaded,'schematic');assert.deepEqual(loaded.wires,original.wires);assert.deepEqual(loaded.junctions,original.junctions);assert.deepEqual(loaded.components,original.components);
  }
});
