import assert from 'node:assert/strict';
import {test} from 'node:test';
import {directTerminalCircuit} from './fixtures/direct-terminal-circuit.mjs';
import {seriesReturnCircuit} from './fixtures/series-return-circuit.mjs';
import {component,createPreset} from '../dist/models.js';
import {analyzeCircuit,circuitNets} from '../dist/topology.js';
import {routeCircuit,convertView,pointIn,routeIsClear,countWireCrossings} from '../dist/layout.js';
import {wirePoints} from '../dist/wiring.js';
import {electricalSignature,schematicJunctionDots} from '../dist/connections.js';
import {solveCircuit} from '../dist/solver.js';
import {physicalLabelOffset,physicalBounds} from '../dist/physical.js';

const tree=t=>t.kind==='leaf'?t.key:{[t.kind]:t.children.map(tree)};
const readings=state=>solveCircuit(state.components,state.wires,state.junctions);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('textbook analysis identifies the parallel lamps and preserves both meter scopes',()=>{
  const state=directTerminalCircuit(),cluster=analyzeCircuit(state).clusters[0];
  assert.equal(cluster.kind,'parallel');assert.deepEqual(tree(cluster.loadTree),{parallel:['l1','l2','l3']});
  assert.deepEqual(tree(cluster.tree),{parallel:['l1',{series:[{parallel:['l2',{series:['a1','l3']}]},'a2']}]});
  assert.equal(analyzeCircuit(createPreset('series')).clusters[0].kind,'series');
  assert.equal(analyzeCircuit(createPreset('parallel')).clusters[0].kind,'parallel');
});

test('direct terminal clicks form straight shared buses with at most two turns per lead',()=>{
  const state=directTerminalCircuit(),poses=structuredClone(state.components),signature=electricalSignature(state);routeCircuit(state);
  assert.deepEqual(state.components,poses);assert.equal(state.junctions.length,0);assert.equal(electricalSignature(state),signature);assert.equal(countWireCrossings(state),0);
  const paths=state.wires.map(w=>wirePoints(w,k=>pointIn(state,k)));
  assert.ok(paths.every(path=>path.length<=4),'a common node must not become a staircase');
  assert.deepEqual(paths[2],[{x:292,y:298},{x:123,y:298},{x:123,y:416}]);
  assert.equal(paths[0][1].x,paths[2][1].x);assert.equal(paths[1][1].x,paths[6][1].x);assert.equal(paths[1][1].x,paths[6][2].x);
  assert.equal(paths[3].length,2);assert.equal(paths[7].length,2);assert.equal(schematicJunctionDots(state,k=>pointIn(state,k)).length,4);
  for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k)),state,w),w.id);
});

test('bus geometry does not depend on terminal click order or old individual bends',()=>{
  const one=directTerminalCircuit(),two=structuredClone(one);two.wires.reverse().forEach(w=>{[w.a,w.b]=[w.b,w.a];w.via=[{x:1800,y:-600},{x:1800,y:1400}];});routeCircuit(one);routeCircuit(two);
  const paths=state=>state.wires.map(w=>({id:w.id,points:wirePoints(w,k=>pointIn(state,k))})).sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(paths(two).map(p=>({...p,points:p.points.reverse()})),paths(one));
});

test('physical equipment and curved cables preserve branch membership independently of schematic positions',()=>{
  const state=directTerminalCircuit(),signature=electricalSignature(state),before=readings(state);routeCircuit(state);const diagram=structuredClone(state.components);convertView(state,'physical');
  const part=id=>state.components.find(c=>c.id===id);
  assert.notEqual(part('a1').y,part('l3').y);assert.notEqual(part('a2').y,part('l2').y);
  const nets=circuitNets(state);
  assert.equal(nets.find('a2:1'),nets.find('l2:0'));assert.equal(nets.find('a2:1'),nets.find('l3:0'));assert.notEqual(nets.find('a2:1'),nets.find('l1:1'));
  assert.equal(nets.find('a1:1'),nets.find('l3:1'));assert.notEqual(nets.find('a1:1'),nets.find('e1:1'));
  assert.equal(state.junctions.length,0);assert.equal(state.wires.length,8);assert.equal(countWireCrossings(state),0);assert.equal(electricalSignature(state),signature);
  const after=readings(state);close(after.current,before.current);close(after.components.a2.current,1.2);close(after.components.a1.current,-.6);
  for(const w of state.wires){const points=wirePoints(w,k=>pointIn(state,k),'physical');assert.ok(routeIsClear(points,state,w),w.id);
    const a=points[0],b=points.at(-1),chord=Math.hypot(b.x-a.x,b.y-a.y),length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
    assert.ok(points.some(p=>Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/(chord||1)>5),`${w.id} should have natural cable slack`);
    assert.ok(length<chord*1.7+80,`${w.id} makes an excessive detour`);
    for(const c of state.components){const label=physicalLabelOffset(c),box={x:c.x-44,y:c.y+label.y-14,right:c.x+44,bottom:c.y+label.y+3};for(const p of points)assert.ok(!(p.x>box.x&&p.x<box.right&&p.y>box.y&&p.y<box.bottom),`${w.id} covers ${c.id}'s label`);}
  }
  convertView(state,'schematic');assert.deepEqual(state.components,diagram);assert.equal(countWireCrossings(state),0);
});

test('identical electrical nodes yield the same equipment arrangement despite different drawing geometry',()=>{
  const one=directTerminalCircuit(),two=structuredClone(one);
  two.components.forEach((c,i)=>Object.assign(c,{x:2400-i*173,y:-800+(i%3)*541,angle:(i%4)*90}));
  two.wires.reverse().forEach(w=>w.via=[{x:3100,y:-1200},{x:-1400,y:1900}]);
  convertView(one,'physical');convertView(two,'physical');
  assert.deepEqual(two.components,one.components);assert.equal(electricalSignature(two),electricalSignature(one));
  assert.deepEqual(tree(analyzeCircuit(two).clusters[0].tree),tree(analyzeCircuit(one).clusters[0].tree));
});

test('every parallel block shares its split and join while series blocks meet in path order',()=>{
  const {tree:root}=analyzeCircuit(directTerminalCircuit()).clusters[0];
  const visit=block=>{if(block.kind==='leaf')return;if(block.kind==='parallel')for(const child of block.children){assert.equal(child.a,block.a);assert.equal(child.b,block.b);}else{assert.equal(block.children[0].a,block.a);assert.equal(block.children.at(-1).b,block.b);for(let i=1;i<block.children.length;i++)assert.equal(block.children[i-1].b,block.children[i].a);}block.children.forEach(visit);};visit(root);
});

test('a common series return follows the lower row without crossing the parallel bank',()=>{
  for(const closed of [false,true]){
    const state=seriesReturnCircuit();state.components.find(c=>c.id==='s1').closed=closed;const signature=electricalSignature(state),before=readings(state);
    assert.deepEqual(tree(analyzeCircuit(state).clusters[0].tree),{series:['s1','l1',{parallel:['l2','l3','v1']}]});
    convertView(state,'physical');assert.equal(electricalSignature(state),signature);assert.equal(countWireCrossings(state,'physical',{sharedRadius:8}),0);assert.equal(state.junctions.length,0);
    const part=id=>state.components.find(c=>c.id===id);assert.equal(part('l1').y,part('s1').y);assert.equal(part('s1').y,part('e1').y);assert.ok(part('l1').x<part('s1').x&&part('s1').x<part('e1').x);
    assert.ok(part('l2').y<part('s1').y&&part('l3').y<part('s1').y);const after=readings(state);close(after.current,before.current);close(after.current,closed?.4:0);close(Math.abs(after.components.v1.voltage),closed?2:0);
    for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k),'physical'),state,w),w.id);
    const physical=structuredClone(state);convertView(state,'schematic');convertView(state,'physical');assert.deepEqual(state.components,physical.components);assert.deepEqual(state.wires,physical.wires);
  }
});

test('mixed series and parallel arrangements never trade a crossing for a shorter cable',()=>{
  const shapes=[['S','L','L'],{parallel:['L','L']},['S','L',{parallel:['L','L','V']}],[{parallel:['L','L','V']},'S','L'],['S',{parallel:[['L',{parallel:['L','L']}],'L']},'R'],[{parallel:['L','L']},{parallel:['L','L']}],{parallel:[['S','L'],['R','L'],'L']},{parallel:['L','L','L','V','V']}];
  for(const shape of shapes){
    const state=createPreset('free'),counts={};let nextNode=0,nextWire=0;
    const node=()=>{const id=`n${++nextNode}`;state.junctions.push({id,x:0,y:0});return `${id}:0`;},connect=(a,b)=>state.wires.push({id:`w${++nextWire}`,a,b});
    state.components=[component('e1','battery',0,0,6)];const start=node(),end=node();connect('e1:1',start);connect('e1:0',end);
    const build=(block,a,b)=>{if(Array.isArray(block)){let previous=a;block.forEach((child,i)=>{const next=i===block.length-1?b:node();build(child,previous,next);previous=next;});}else if(block.parallel)block.parallel.forEach(child=>build(child,a,b));else{const type={S:'switch',L:'lamp',R:'resistor',V:'voltmeter'}[block],id={S:'s',L:'l',R:'r',V:'v'}[block]+(counts[block]=(counts[block]??0)+1);state.components.push(component(id,type,0,0));connect(`${id}:0`,a);connect(`${id}:1`,b);}};
    build(shape,start,end);const signature=electricalSignature(state),before=readings(state);convertView(state,'physical');
    assert.equal(electricalSignature(state),signature);assert.equal(countWireCrossings(state,'physical',{sharedRadius:8}),0,JSON.stringify(shape));close(readings(state).current,before.current);
    for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k),'physical'),state,w),w.id);
  }
});

test('a correctly connected low-range branch ammeter keeps its positive post and reading',()=>{
  const state=directTerminalCircuit();
  for(const w of state.wires)for(const end of ['a','b']){if(w[end]==='a1:0')w[end]='a1:1';else if(w[end]==='a1:1')w[end]='a1:2';}
  const signature=electricalSignature(state);convertView(state,'physical');
  assert.equal(electricalSignature(state),signature);assert.equal(countWireCrossings(state),0);close(readings(state).components.a1.current,.6);
  assert.ok(state.wires.some(w=>w.a==='a1:2'||w.b==='a1:2'));assert.ok(state.wires.every(w=>w.a!=='a1:0'&&w.b!=='a1:0'));
});

test('successive nested parallel banks retain series order without overlapping equipment',()=>{
  const state=createPreset('free');state.components=['e1','s1','r0','r1','l1','l2','l3','a1','r2','l4'].map(id=>component(id,id[0]==='e'?'battery':id[0]==='s'?'switch':id[0]==='r'?'resistor':id[0]==='a'?'ammeter':'lamp',0,0));
  state.wires=[['e1:0','s1:0'],['s1:1','r0:0'],['r0:1','r1:0'],['r0:1','l3:0'],['r1:1','l1:0'],['r1:1','l2:0'],['l1:1','a1:0'],['l2:1','a1:0'],['l3:1','a1:0'],['a1:1','r2:0'],['a1:1','l4:0'],['r2:1','e1:1'],['l4:1','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  const signature=electricalSignature(state),before=readings(state),hierarchy=tree(analyzeCircuit(state).clusters[0].tree);
  assert.equal(analyzeCircuit(state).clusters[0].kind,'mixed');convertView(state,'physical');assert.equal(electricalSignature(state),signature);assert.deepEqual(tree(analyzeCircuit(state).clusters[0].tree),hierarchy);close(readings(state).current,before.current);
  const boxes=state.components.map(physicalBounds);for(let i=0;i<boxes.length;i++)for(const b of boxes.slice(i+1)){const a=boxes[i];assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'physical apparatus must remain separate');}
  for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k),'physical'),state,w),w.id);
});

test('real mixed circuits and open switches keep their structure',()=>{
  const state=createPreset('free');state.components=[component('e1','battery',0,0),component('s1','switch',100,0),component('r1','resistor',200,0),component('l1','lamp',300,0),component('l2','lamp',300,200)];state.components[1].closed=false;
  state.wires=[['e1:0','s1:0'],['s1:1','r1:0'],['r1:1','l1:0'],['r1:1','l2:0'],['l1:1','e1:1'],['l2:1','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  assert.equal(analyzeCircuit(state).clusters[0].kind,'mixed');const signature=electricalSignature(state);convertView(state,'physical');assert.equal(electricalSignature(state),signature);assert.equal(readings(state).current,0);
  state.components.find(c=>c.id==='s1').closed=true;const closed=readings(state);close(closed.current,.4);close(Math.abs(closed.components.l1.current),.2);close(Math.abs(closed.components.l2.current),.2);
});

test('voltmeter probes attach to the measured load without carrying the main path',()=>{
  for(const name of ['series','parallel','ohm']){
    const state=createPreset(name),before=readings(state).current;convertView(state,'physical');assert.equal(countWireCrossings(state),0,name);
    const main=state.wires.filter(w=>!w.a.startsWith('v1:')&&!w.b.startsWith('v1:'));close(solveCircuit(state.components,main,state.junctions).current,before);
    if(name==='series')for(const w of state.wires.filter(w=>w.a.startsWith('v1:')||w.b.startsWith('v1:')))assert.ok(w.a.startsWith('l1:')||w.b.startsWith('l1:'),'both probes must connect directly across the lamp');
  }
});

test('independent circuits remain separate even when their original positions coincide',()=>{
  const state=createPreset('free');state.components=[component('e1','battery',0,0,6),component('e2','battery',0,0,9),component('r1','resistor',200,0,10),component('r2','resistor',200,0,30)];
  state.wires=[['e1:0','r1:0'],['e1:1','r1:1'],['e2:0','r2:0'],['e2:1','r2:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  const signature=electricalSignature(state);assert.equal(analyzeCircuit(state).clusters.length,2);convertView(state,'physical');assert.equal(electricalSignature(state),signature);close(readings(state).current,.9);assert.equal(countWireCrossings(state),0);
});

test('the previous grid cache upgrades without moving the hand-placed schematic',()=>{
  for(const version of [3,4]){
    const state=directTerminalCircuit(),poses=structuredClone(state.components);state.layouts={schematic:{version:3,signature:electricalSignature(state),poses:Object.fromEntries(state.components.map(c=>[c.id,{x:c.x,y:c.y,angle:c.angle}]))},physical:{version,poses:{}}};
    convertView(state,'physical');assert.equal(state.layouts.physical.version,5);assert.equal(countWireCrossings(state),0);convertView(state,'schematic');assert.deepEqual(state.components,poses);
    assert.equal(countWireCrossings(state),0);assert.ok(state.wires.every(w=>wirePoints(w,k=>pointIn(state,k)).length<=4));
  }
});

test('a fresh schematic restores electrical branch hierarchy from independently arranged equipment',()=>{
  const state=directTerminalCircuit();convertView(state,'physical');const signature=electricalSignature(state);delete state.layouts.schematic;convertView(state,'schematic');
  const part=id=>state.components.find(c=>c.id===id);assert.ok(part('l1').y<part('l2').y&&part('l2').y<part('l3').y);assert.equal(part('a2').y,part('l2').y);assert.equal(part('a1').y,part('l3').y);
  assert.equal(electricalSignature(state),signature);assert.equal(countWireCrossings(state),0);for(const w of state.wires)assert.ok(routeIsClear(wirePoints(w,k=>pointIn(state,k)),state,w),w.id);
});
