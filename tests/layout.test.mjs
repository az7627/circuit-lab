import assert from 'node:assert/strict';
import {test} from 'node:test';
import {component,createPreset} from '../dist/models.js';
import {clone,normalizeState} from '../dist/data.js';
import {solveCircuit} from '../dist/solver.js';
import {convertView,routeCircuit,routeOrthogonal,routeIsClear,pointIn,deformCable,moveItem} from '../dist/layout.js';
import {wirePoints} from '../dist/wiring.js';
import {serializeExperiment,parseExperiment} from '../dist/files.js';

export function regressionScene(){
  const state=createPreset('free');state.viewMode='physical';
  state.components=[component('v1','voltmeter',180,80),component('v2','voltmeter',430,80),component('l1','lamp',180,260,50),component('l2','lamp',650,300,10),component('s1','switch',180,470),component('e1','battery',430,470,6)];
  const ends=[['e1:0','l2:1'],['l2:0','l1:1'],['l1:0','s1:0'],['s1:1','e1:1'],['v1:1','l1:0'],['v1:0','l1:1'],['v2:1','l2:0'],['v2:0','l2:1']];state.wires=ends.map(([a,b],i)=>({id:`w${i+1}`,a,b}));routeCircuit(state,'physical');return state;
}
const poses=state=>state.components.map(({id,x,y,angle})=>({id,x,y,angle}));

test('orthogonal routing finds a clear path around multiple component obstacles',()=>{
  const boxes=[{x:30,y:-20,width:40,height:50},{x:90,y:10,width:40,height:80}],path=routeOrthogonal({x:0,y:0},{x:150,y:60},boxes);
  assert.ok(path.length>=4);for(let i=1;i<path.length;i++)assert.ok(path[i].x===path[i-1].x||path[i].y===path[i-1].y);
});

test('the two-voltmeter screenshot regression converts without crossing component bodies',()=>{
  const state=regressionScene(),original=poses(state),before=solveCircuit(state.components,state.wires,state.junctions),connections=state.wires.map(({id,a,b})=>({id,a,b}));
  convertView(state,'schematic',{x:420,y:255,zoom:1});
  for(const w of state.wires){const points=wirePoints(w,k=>pointIn(state,k),'schematic');assert.ok(routeIsClear(points,state,w),`${w.id} crosses a component or enters a terminal backwards: ${JSON.stringify(points)}`);}
  assert.deepEqual(state.wires.map(({id,a,b})=>({id,a,b})),connections);assert.equal(solveCircuit(state.components,state.wires,state.junctions).current,before.current);
  convertView(state,'physical');assert.deepEqual(poses(state),original);
});

test('repeated view switches and file loading preserve independent positions, routes, ports and camera',()=>{
  const state=regressionScene();convertView(state,'schematic',{x:111,y:222,zoom:.8});const diagram=poses(state);convertView(state,'physical',{x:333,y:444,zoom:1.2});const physical=poses(state),routes=clone(state.wires);
  for(let i=0;i<4;i++){const s=convertView(state,'schematic',{x:111,y:222,zoom:.8});assert.deepEqual(poses(state),diagram);assert.deepEqual(s.view,{x:333,y:444,zoom:1.2});convertView(state,'physical',{x:333,y:444,zoom:1.2});assert.deepEqual(poses(state),physical);}
  assert.deepEqual(state.wires,routes);const restored=parseExperiment(serializeExperiment(state,'模式转换')).state;assert.deepEqual(restored.layouts,state.layouts);assert.deepEqual(restored.wires,state.wires);
});

test('cable deformation spreads displacement through the trace and rigidly follows two moving ends',()=>{
  const points=[{x:0,y:0},{x:0,y:60},{x:100,y:60},{x:100,y:0}],shape=deformCable(points,{x:-80,y:20},{x:100,y:0});
  assert.deepEqual(shape[0],{x:-80,y:20});assert.deepEqual(shape.at(-1),{x:100,y:0});assert.ok(shape.some(p=>p.x<0&&p.y>40));
  const moved=deformCable(points,{x:30,y:20},{x:130,y:20});assert.deepEqual(moved,[{x:30,y:20},{x:30,y:80},{x:130,y:80},{x:130,y:20}]);
});

test('moving a meter far from its original location repairs attached cables and leaves topology intact',()=>{
  const state=regressionScene(),before=clone(state);moveItem(state,'v1',{x:-200,y:180},before);
  for(const w of state.wires.filter(w=>w.a.startsWith('v1:')||w.b.startsWith('v1:'))){const points=wirePoints(w,k=>pointIn(state,k),'physical');assert.ok(routeIsClear(points,state,w),w.id);assert.deepEqual(points[0],pointIn(state,w.a));assert.deepEqual(points.at(-1),pointIn(state,w.b));}
  assert.equal(solveCircuit(state.components,state.wires,state.junctions).current,solveCircuit(before.components,before.wires,before.junctions).current);assert.ok(normalizeState(state));
});

test('corrupt inactive layouts are rejected during loading',()=>{
  const state=regressionScene();state.layouts={schematic:{poses:{e1:{x:0,y:null}}}};assert.equal(normalizeState(state),null);
});

test('a hand-drawn physical trace survives parameter updates and a full view round trip',()=>{
  const state=regressionScene(),wire=state.wires[0];wire.physicalVia=[{x:500,y:450},{x:550,y:420},{x:600,y:380}];const trace=clone(wire.physicalVia);
  routeCircuit(state,'physical',{preservePhysical:true});assert.deepEqual(wire.physicalVia,trace);convertView(state,'schematic');convertView(state,'physical');assert.deepEqual(wire.physicalVia,trace);
});
