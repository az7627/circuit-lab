import assert from 'node:assert/strict';
import {test} from 'node:test';
import {component,createPreset,definitions} from '../dist/models.js';
import {terminalIndices} from '../dist/terminals.js';
import {clone,normalizeState} from '../dist/data.js';
import {solveCircuit} from '../dist/solver.js';
import {convertView,routeCircuit,routeOrthogonal,routeIsClear,pointIn,deformCable,moveItem,countWireCrossings} from '../dist/layout.js';
import {circuitNets} from '../dist/topology.js';
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

test('a dragged meter lead goes around the connected lamp instead of cutting across its own glass',()=>{
  const state=regressionScene(),before=clone(state),session={};for(let i=1;i<=60;i++)moveItem(state,'v1',{x:180-114*i/60,y:80+84*i/60},before,{preview:true,session});moveItem(state,'v1',{},before,{finalize:true,session});
  assert.equal(countWireCrossings(state),0);for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k),'physical'),state,w),w.id);
});

test('corrupt inactive layouts are rejected during loading',()=>{
  const state=regressionScene();state.layouts={schematic:{poses:{e1:{x:0,y:null}}}};assert.equal(normalizeState(state),null);
});

test('a hand-drawn physical trace survives parameter updates and a full view round trip',()=>{
  const state=regressionScene(),wire=state.wires[0];wire.physicalVia=[{x:500,y:450},{x:550,y:420},{x:600,y:380}];const trace=clone(wire.physicalVia);
  routeCircuit(state,'physical',{preservePhysical:true});assert.deepEqual(wire.physicalVia,trace);convertView(state,'schematic');convertView(state,'physical');assert.deepEqual(wire.physicalVia,trace);
});

function paths(state){return state.wires.map(w=>({id:w.id,points:wirePoints(w,k=>pointIn(state,k),state.viewMode)})).sort((a,b)=>a.id.localeCompare(b.id));}
function crossingScene(height=80){const s=createPreset('free');s.junctions=[{id:'n1',x:0,y:0},{id:'n2',x:200,y:0},{id:'n3',x:100,y:-height},{id:'n4',x:100,y:height}];s.wires=[{id:'w1',a:'n1:0',b:'n2:0',via:[]},{id:'w2',a:'n3:0',b:'n4:0',via:[]}];return s;}
const connections=state=>state.wires.map(({id,a,b})=>({id,a,b}));

test('routing detects and removes perpendicular crossings, including ones split at a vertex',()=>{
  const state=crossingScene();state.wires[1].via=[{x:100,y:0}];assert.equal(countWireCrossings(state),1);
  routeCircuit(state,'schematic',{optimize:true});assert.equal(countWireCrossings(state),0);
  for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k)),state,w));
});

test('crossing avoidance takes priority over a much shorter route and is independent of wire order',()=>{
  const state=crossingScene(1000),reversed=clone(state);reversed.wires.reverse();routeCircuit(state,'schematic',{optimize:true});routeCircuit(reversed,'schematic',{optimize:true});
  assert.equal(countWireCrossings(state),0);assert.deepEqual(paths(state),paths(reversed));assert.ok(paths(state).some(r=>r.points.some(p=>Math.abs(p.y)>1000||p.x<0||p.x>200)));
});

test('the screenshot circuit becomes two measured loads on a common main branch, with no crossings',()=>{
  const state=regressionScene(),physicalLength=paths(state).reduce((sum,r)=>sum+r.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-r.points[i].x,p.y-r.points[i].y),0),0);
  assert.equal(countWireCrossings(state),0);assert.ok(physicalLength<2600,'physical leads should not take long detours around the meters');convertView(state,'schematic');assert.equal(countWireCrossings(state),0);
  const [l1,l2]=['l1','l2'].map(id=>state.components.find(c=>c.id===id));assert.equal(l1.y,l2.y);
  for(const [v,l] of [['v1',l1],['v2',l2]]){const c=state.components.find(c=>c.id===v);assert.equal(c.x,l.x);assert.ok(c.y<l.y);}
});

test('electrically identical tangled physical layouts produce the same clean schematic',()=>{
  for(const preset of ['series','parallel','ohm']){
    const state=createPreset(preset);state.viewMode='physical';delete state.layouts;const scrambled=clone(state);
    scrambled.components.reverse().forEach((c,i)=>{c.x=100+(i*317)%650;c.y=90+(i*241)%450;c.angle=(i%4)*90;});scrambled.junctions.reverse();scrambled.wires.reverse();
    const electrical=solveCircuit(state.components,state.wires,state.junctions);convertView(state,'schematic');convertView(scrambled,'schematic');
    assert.deepEqual(poses(state).sort((a,b)=>a.id.localeCompare(b.id)),poses(scrambled).sort((a,b)=>a.id.localeCompare(b.id)),preset);
    assert.equal(countWireCrossings(state),0,preset);assert.equal(countWireCrossings(scrambled),0,preset);
    assert.equal(solveCircuit(state.components,state.wires,state.junctions).current,electrical.current,preset);
    for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k)),state,w),`${preset} ${w.id}`);
  }
});

test('a changed physical topology invalidates only the cached schematic layout',()=>{
  const state=regressionScene();convertView(state,'schematic');convertView(state,'physical');const physical=poses(state);
  state.components.push(component('r9','resistor',840,330));state.wires.push({id:'w99',a:'r9:0',b:'l1:0'},{id:'w100',a:'r9:1',b:'l1:1'});
  const result=convertView(state,'schematic');assert.equal(result.newLayout,true);assert.equal(countWireCrossings(state),0);
  convertView(state,'physical');assert.deepEqual(poses(state).filter(c=>c.id!=='r9'),physical);
  const restored=parseExperiment(serializeExperiment(state,'拓扑变化')).state;assert.equal(convertView(restored,'schematic').newLayout,false);
});

test('leaving a legacy converted schematic does not incorrectly mark its broken layout as current',()=>{
  const state=regressionScene();convertView(state,'schematic');const expected=poses(state);delete state.layouts.schematic.version;state.components.forEach((c,i)=>{c.x=100+i*27;c.y=100+i*19;});
  convertView(state,'physical');assert.equal(state.layouts.schematic.version,1);const result=convertView(state,'schematic');assert.equal(result.newLayout,true);assert.deepEqual(poses(state),expected);assert.equal(countWireCrossings(state),0);
});

test('nested series and parallel groups retain orthogonal routes at fractional layout coordinates',()=>{
  const state=createPreset('free');state.viewMode='physical';state.components=[component('e1','battery',0,0),...Array.from({length:6},(_,i)=>component(`r${i+1}`,'resistor',i*100,100))];
  state.wires=[['e1:1','r1:0'],['r1:1','r2:0'],['r2:1','r3:0'],['r3:1','e1:0'],['r1:1','r4:0'],['r4:1','r2:1'],['r1:1','r5:0'],['r5:1','r6:0'],['r6:1','r2:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  convertView(state,'schematic');assert.equal(countWireCrossings(state),0);for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k)),state,w),w.id);assert.ok(normalizeState(state));
});

test('wire-node reduction keeps low-range meter ports, open switches and loose-node chains',()=>{
  const state=regressionScene();state.components.find(c=>c.id==='s1').closed=false;state.wires.find(w=>w.a==='v1:0').a='v1:2';
  state.junctions.push({id:'n1',x:0,y:0},{id:'n2',x:50,y:50});const old=state.wires[0].b;state.wires[0].b='n1:0';state.wires.push({id:'w9',a:'n1:0',b:'n2:0'},{id:'w10',a:'n2:0',b:old});
  const wires=connections(state),nets=circuitNets(state);assert.equal(nets.find('v1:0'),nets.find('v1:2'));assert.equal(nets.find('e1:0'),nets.find(old));
  convertView(state,'schematic');assert.deepEqual(connections(state),wires);assert.equal(countWireCrossings(state),0);assert.equal(solveCircuit(state.components,state.wires,state.junctions).current,0);
});

test('small physical drag steps change the cable continuously and returning restores its trace',()=>{
  const state=createPreset('free');state.viewMode='physical';state.components=[component('l1','lamp',100,100),component('l2','lamp',500,100)];state.wires=[{id:'w1',a:'l1:1',b:'l2:0',physicalVia:[{x:200,y:100},{x:240,y:200},{x:360,y:200},{x:400,y:100}]}];
  const before=clone(state),session={};let previous=paths(state)[0].points;
  const nearest=(p,line)=>Math.min(...line.slice(1).map((b,i)=>{const a=line[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}));
  for(let i=1;i<=60;i++){moveItem(state,'l1',{x:100-i,y:100+i/2},before,{preview:true,session});const next=paths(state)[0].points;assert.ok(Math.max(...next.map(p=>nearest(p,previous)))<20,`jump at ${i}`);previous=next;}
  moveItem(state,'l1',{x:100,y:100},before,{preview:true,session});assert.deepEqual(state.wires[0].physicalVia,before.wires[0].physicalVia);
});

test('moving an unrelated physical component also moves cables away from its body',()=>{
  const state=createPreset('free');state.viewMode='physical';state.components=[component('l1','lamp',0,0),component('l2','lamp',400,0),component('v1','voltmeter',200,-180)];state.wires=[{id:'w1',a:'l1:1',b:'l2:0',physicalVia:[]}];const before=clone(state),session={};
  for(let y=-180;y<=0;y+=5)moveItem(state,'v1',{x:200,y},before,{preview:true,session});moveItem(state,'v1',{},before,{finalize:true,session});
  assert.ok(routeIsClear(wirePoints(state.wires[0],k=>pointIn(state,k),'physical'),state,state.wires[0]));assert.deepEqual(connections(state),connections(before));
});

test('bridge networks, multiple supplies and both SPDT throws survive general graph conversion',()=>{
  const bridge=createPreset('free');bridge.viewMode='physical';bridge.components=[component('e1','battery',100,400,10),...Array.from({length:5},(_,i)=>component(`r${i+1}`,'resistor',100+i*150,150,10))];
  const bridgeEnds=[['e1:0','r1:0'],['e1:0','r3:0'],['r1:1','r2:0'],['r3:1','r4:0'],['r2:1','e1:1'],['r4:1','e1:1'],['r5:0','r1:1'],['r5:1','r3:1']];bridge.wires=bridgeEnds.map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  const spdt=createPreset('free');spdt.viewMode='physical';spdt.components=[component('e1','battery',100,400),component('d1','spdt',200,100),component('l1','lamp',400,100),component('l2','lamp',400,300)];spdt.wires=[['e1:0','d1:0'],['d1:1','l1:0'],['d1:2','l2:0'],['l1:1','e1:1'],['l2:1','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  const islands=createPreset('free');islands.viewMode='physical';islands.components=[component('e1','battery',100,100),component('e2','battery',200,100),component('r1','resistor',100,200),component('r2','resistor',200,200)];islands.wires=[['e1:0','r1:0'],['e1:1','r1:1'],['e2:0','r2:0'],['e2:1','r2:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  for(const s of [bridge,spdt,islands]){const before=solveCircuit(s.components,s.wires,s.junctions),ends=connections(s);convertView(s,'schematic');assert.deepEqual(connections(s),ends);assert.equal(solveCircuit(s.components,s.wires,s.junctions).current,before.current);assert.ok(normalizeState(s));for(const w of s.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(s,k)),s,w),`${s.components.length} ${w.id}`);}
});

test('all physical parts route outside their solids and retain terminal escape space after rotation',()=>{
  for(const type of Object.keys(definitions))for(const angle of [0,90,180,270])for(const ports of ['ammeter','voltmeter'].includes(type)?[[0,1],[2,1]]:[terminalIndices(type)]){const s=createPreset('free');s.viewMode='physical';s.components=[component('e1','battery',80,390),component('p1',type,360,150,undefined,angle)];s.wires=ports.map((index,i)=>({id:`w${i+1}`,a:`p1:${index}`,b:`e1:${index===1?1:0}`}));routeCircuit(s,'physical');for(const w of s.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(s,k),'physical'),s,w),`${type} ${angle} ${w.id}`);}
});
