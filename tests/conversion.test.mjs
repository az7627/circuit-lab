import assert from 'node:assert/strict';
import {test} from 'node:test';
import {screenshotCircuit} from './fixtures/screenshot-circuit.mjs';
import {convertView,pointIn,routeIsClear} from '../dist/layout.js';
import {electricalSignature,schematicJunctionDots} from '../dist/connections.js';
import {wirePoints,nearestConnection} from '../dist/wiring.js';
import {solveCircuit} from '../dist/solver.js';
import {serializeExperiment,parseExperiment} from '../dist/files.js';
import {normalizeState} from '../dist/data.js';
import {directTerminalCircuit} from './fixtures/direct-terminal-circuit.mjs';
import {seriesReturnCircuit} from './fixtures/series-return-circuit.mjs';
import {countWireCrossings} from '../dist/layout.js';

const electrical=state=>solveCircuit(state.components,state.wires,state.junctions);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('the three-lamp screenshot converts into nine post-to-post wires without helper dots',()=>{
  const state=screenshotCircuit(),signature=electricalSignature(state),before=electrical(state),original=structuredClone(state),start=performance.now();
  convertView(state,'physical');const elapsed=performance.now()-start;
  assert.ok(elapsed<1000,`conversion blocked for ${elapsed} ms`);assert.equal(state.junctions.length,0);assert.equal(state.wires.length,9);assert.ok(state.components.every(c=>c.angle===0));assert.equal(electricalSignature(state),signature);
  const after=electrical(state);close(after.components.a2.current,1.2);close(after.components.a1.current,-.6);close(after.current,before.current);
  for(const w of state.wires){assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k),'physical'),state,w),w.id);assert.ok(w.physicalVia.length<50);}
  const physical=structuredClone(state.components),restored=parseExperiment(serializeExperiment(state,'截图回归')).state;
  convertView(restored,'schematic');assert.deepEqual(restored.wires,original.wires);assert.deepEqual(restored.junctions,original.junctions);assert.deepEqual(restored.components,original.components);
  for(let i=0;i<3;i++){convertView(restored,'physical');assert.equal(restored.junctions.length,0);assert.deepEqual(restored.components,physical);convertView(restored,'schematic');assert.deepEqual(restored.wires,original.wires);}
});

test('legacy physical layouts are upgraded once and corrupt inactive wiring is rejected',()=>{
  const state=screenshotCircuit();state.layouts={physical:{version:2,poses:Object.fromEntries(state.components.map(c=>[c.id,{x:c.x,y:c.y,angle:c.angle}]))}};
  assert.equal(convertView(state,'physical').newLayout,true);assert.equal(state.layouts.physical.version,5);assert.equal(state.junctions.length,0);assert.ok(state.components.every(c=>c.angle===0));
  convertView(state,'schematic');assert.equal(convertView(state,'physical').newLayout,false);
  state.layouts.schematic.wires[0].a='missing:0';assert.equal(normalizeState(state),null);
});

test('a physical wiring change invalidates the cached schematic and keeps all new nets',()=>{
  const state=screenshotCircuit();convertView(state,'physical');state.wires=state.wires.filter(w=>!w.a.startsWith('l2:')&&!w.b.startsWith('l2:'));const signature=electricalSignature(state);
  assert.equal(convertView(state,'schematic').newLayout,true);assert.equal(electricalSignature(state),signature);close(electrical(state).components.l2.current,0);
  convertView(state,'physical');assert.equal(electricalSignature(state),signature);
});

test('a stale cache signature cannot replace the active electrical connections',()=>{
  const state=screenshotCircuit();convertView(state,'physical');const signature=electricalSignature(state);
  state.layouts.schematic.wires[0].a='e1:1';assert.equal(convertView(state,'schematic').newLayout,true);assert.equal(electricalSignature(state),signature);
});

test('changing only the positive meter range post invalidates the other view wiring',()=>{
  const state=directTerminalCircuit();convertView(state,'physical');convertView(state,'schematic');const original=electricalSignature(state);
  for(const w of state.wires)for(const end of ['a','b'])if(w[end]==='a1:0')w[end]='a1:2';
  assert.notEqual(electricalSignature(state),original);const changed=electricalSignature(state);
  for(const mode of ['physical','schematic','physical']){
    convertView(state,mode);assert.equal(electricalSignature(state),changed);assert.ok(state.wires.some(w=>w.a==='a1:2'||w.b==='a1:2'));assert.ok(state.wires.every(w=>w.a!=='a1:0'&&w.b!=='a1:0'));close(electrical(state).components.a1.current,-.6);
  }
});

test('restoring a hand-wired physical view preserves its intentional junctions and traces',()=>{
  const state=screenshotCircuit();state.viewMode='physical';state.wires.forEach(w=>w.physicalVia=structuredClone(w.via??[]));const original=structuredClone(state);
  convertView(state,'schematic');convertView(state,'physical');assert.deepEqual(state.wires,original.wires);assert.deepEqual(state.junctions,original.junctions);assert.deepEqual(state.components,original.components);
});

test('a crossed automatic or legacy physical cache is replanned rather than restored',()=>{
  for(const legacy of [false,true]){
    const state=seriesReturnCircuit(),signature=electricalSignature(state);convertView(state,'physical');const physical=structuredClone(state);convertView(state,'schematic');
    const cache=state.layouts.physical;if(legacy)delete cache.automatic;cache.wires.forEach(w=>w.physicalVia=[{x:1000,y:1000}]);
    assert.ok(countWireCrossings({...physical,wires:cache.wires},'physical')>0);
    assert.equal(convertView(state,'physical').newLayout,true);assert.equal(electricalSignature(state),signature);assert.equal(countWireCrossings(state,'physical',{sharedRadius:8}),0);assert.equal(state.layouts.physical.automatic,true);
  }
});

test('failed crossing-free conversion leaves the original circuit and both cached views intact',()=>{
  const state=directTerminalCircuit();state.components=state.components.filter(c=>c.type==='battery');state.wires=[];state.junctions=Array.from({length:6},(_,i)=>({id:`n${i+1}`,x:(i%3)*200,y:Math.floor(i/3)*300}));
  let resistor=0,wire=0;const add=(a,b)=>state.wires.push({id:`w${++wire}`,a,b});
  for(let a=1;a<=3;a++)for(let b=4;b<=6;b++){const id=`r${++resistor}`;state.components.push({...state.components[0],id,type:'resistor',value:20});add(`${id}:0`,`n${a}:0`);add(`${id}:1`,`n${b}:0`);}
  add('e1:1','n1:0');add('e1:0','n4:0');const original=structuredClone(state);
  assert.throws(()=>convertView(state,'physical'),error=>error.name==='CircuitLayoutError');assert.deepEqual(state,original);
});

test('schematic dots mark connected T branches, but omit elbows and insulated crossings',()=>{
  const locations={a:{x:0,y:0},b:{x:100,y:0},c:{x:50,y:0},d:{x:50,y:80},e:{x:75,y:-30},f:{x:75,y:30}};
  const state={components:[],junctions:Object.entries(locations).map(([id,p])=>({id,...p})),wires:[{id:'w1',a:'a:0',b:'b:0',via:[]},{id:'w2',a:'b:0',b:'c:0',via:[]},{id:'w3',a:'c:0',b:'d:0',via:[]},{id:'w4',a:'e:0',b:'f:0',via:[]}]};
  const dots=schematicJunctionDots(state,key=>locations[key.split(':')[0]]);assert.deepEqual(dots,[{x:50,y:0}]);
  state.wires=[{id:'w1',a:'a:0',b:'d:0',via:[{x:50,y:0}]}];assert.deepEqual(schematicJunctionDots(state,key=>locations[key.split(':')[0]]),[]);
});

test('ending near a wire snaps to its segment and ending near a post prefers that post',()=>{
  const points={a:{x:0,y:0},b:{x:100,y:0}},wires=[{id:'w1',a:'a',b:'b',via:[]}],point=key=>points[key];
  assert.equal(nearestConnection(wires,['a','b'],{x:50,y:7},point).wire,'w1');assert.deepEqual(nearestConnection(wires,['a','b'],{x:50,y:7},point).point,{x:50,y:0});
  assert.equal(nearestConnection(wires,['a','b'],{x:97,y:5},point).terminal,'b');assert.equal(nearestConnection(wires,['a','b'],{x:50,y:20},point),null);
});
