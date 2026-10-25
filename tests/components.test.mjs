import assert from 'node:assert/strict';
import {test} from 'node:test';
import {solveCircuit} from '../dist/solver.js';
import {CircuitSimulation} from '../dist/simulation.js';
import {component,createPreset} from '../dist/models.js';
import {normalizeState} from '../dist/data.js';
import {bellResponse,BellAudio} from '../dist/audio.js';

const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const wires=ends=>ends.map(([a,b],i)=>({id:`w${i+1}`,a,b}));
const loop=wires([['e1:0','r1:0'],['r1:1','e1:1']]);

test('a real battery drops terminal voltage, dissipates internal heat and limits a short',()=>{
  const parts=[{id:'e1',type:'battery',value:6,internalResistance:2},{id:'r1',type:'resistor',value:10}],r=solveCircuit(parts,loop);
  near(r.current,.5);near(r.components.e1.voltage,5);near(r.components.e1.internalPower,.5);near(r.components.r1.power,2.5);
  const short=solveCircuit([parts[0]],[{id:'w1',a:'e1:0',b:'e1:1'}]);assert.equal(short.status,'short');near(short.current,3);near(short.components.e1.current,-3);near(short.components.e1.internalPower,18);
  const parallel=solveCircuit([parts[0],{id:'e2',type:'battery',value:9,internalResistance:2}],wires([['e1:0','e2:0'],['e1:1','e2:1']]));assert.notEqual(parallel.status,'invalid');near(parallel.components.e1.current,.75);near(parallel.components.e2.current,-.75);
  assert.equal(solveCircuit([{...parts[0],internalResistance:-1}],[]).status,'invalid');
});

test('motor running current differs from U/r, conserves power and rises on stall',()=>{
  const parts=[{id:'e1',type:'battery',value:6},{id:'r1',type:'motor',value:12}],r=solveCircuit(parts,loop).components.r1;
  assert.ok(r.backEmf>0);assert.ok(r.current<.5);near(r.voltage,r.backEmf+r.current*12);near(r.power,r.heatPower+r.mechanicalPower);
  const simulation=new CircuitSimulation(),initial=simulation.read(parts,loop).components.r1;near(initial.current,.5);
  let result;for(let i=0;i<100;i++)result=simulation.advance(parts,loop,[],.02);
  assert.ok(result.components.r1.current<initial.current*.3);assert.ok(result.components.r1.backEmf>4);
  parts[1].stalled=true;const stopped=simulation.read(parts,loop).components.r1;near(stopped.current,.5);near(stopped.mechanicalPower,0);
});

test('an RC circuit charges with the RC time constant and discharges without a battery',()=>{
  const parts=[{id:'e1',type:'battery',value:6},{id:'r1',type:'resistor',value:100},{id:'c1',type:'capacitor',value:10000,chargeVoltage:0}],connected=wires([['e1:0','r1:0'],['r1:1','c1:0'],['c1:1','e1:1']]),simulation=new CircuitSimulation();
  near(simulation.read(parts,connected).components.r1.current,6/100.05,.00001);
  let result;for(let i=0;i<100;i++)result=simulation.advance(parts,connected,[],.01);
  near(parts[2].chargeVoltage,6*(1-Math.exp(-1)),.02);assert.ok(result.components.c1.current>0);
  const charged=parts[2].chargeVoltage,discharging=wires([['r1:0','c1:0'],['c1:1','r1:1']]);
  for(let i=0;i<100;i++)result=simulation.advance(parts.slice(1),discharging,[],.01);
  near(parts[2].chargeVoltage,charged*Math.exp(-1),.02);assert.ok(result.components.c1.current<0);assert.ok(Math.abs(result.wires.w1)>0);assert.equal(result.status,'ok');
  const isolated=parts[2].chargeVoltage;simulation.advance([parts[2]],[],[],.05);near(parts[2].chargeVoltage,isolated);
  const state=createPreset('free');state.components=[component('c1','capacitor',0,0)];state.components[0].chargeVoltage=charged;near(normalizeState(state).components[0].chargeVoltage,charged);
});

test('LEDs conduct only forward and a series resistor sets a safe current',()=>{
  const parts=[{id:'e1',type:'battery',value:6},{id:'r1',type:'resistor',value:330},{id:'g1',type:'led',value:2}],forward=wires([['e1:0','r1:0'],['r1:1','g1:0'],['g1:1','e1:1']]);
  let result=solveCircuit(parts,forward);near(result.components.g1.current,4/340,1e-7);assert.ok(result.components.g1.current<.02);near(result.components.g1.power+result.components.r1.power+result.components.e1.power,0,1e-7);
  result=solveCircuit(parts,wires([['e1:0','r1:0'],['r1:1','g1:1'],['g1:0','e1:1']]));assert.equal(result.components.g1.current,0);assert.equal(result.status,'open');assert.equal(result.current,0);assert.ok(Object.values(result.wires).every(current=>current===0));
  result=solveCircuit([{...parts[0],value:1},...parts.slice(1)],forward);assert.equal(result.components.g1.current,0);assert.equal(result.status,'open');
});

test('rheostat A–P and B–P change oppositely; A–B stays at its full resistance',()=>{
  for(const slider of [0,.25,.75,1]){
    const parts=[{id:'e1',type:'battery',value:6,internalResistance:1},{id:'t1',type:'rheostat',value:20,slider}];
    const result=(one,two)=>solveCircuit(parts,wires([['e1:0',`t1:${one}`],[`t1:${two}`,'e1:1']]));
    near(result(0,1).current,6/(1+20*slider));near(result(2,1).current,6/(1+20*(1-slider)));near(result(0,2).current,6/21);near(result(0,2).components.t1.voltage,120/21);
  }
  const divider=solveCircuit([{id:'e1',type:'battery',value:6},{id:'t1',type:'rheostat',value:20,slider:.25},{id:'v1',type:'voltmeter'}],wires([['e1:0','t1:2'],['e1:1','t1:0'],['t1:1','v1:0'],['t1:0','v1:1']]));near(divider.components.v1.voltage,1.5);
});

test('bell supply changes strike cadence and amplitude, with a separate clock for each bell',()=>{
  const weak=bellResponse(.1),strong=bellResponse(5);assert.ok(strong.period<weak.period);assert.ok(strong.amplitude>weak.amplitude);
  const bell=new BellAudio(),strikes=[];bell.context={state:'running',currentTime:0};bell.bells=[{id:'a',...weak},{id:'b',...strong}];bell.strike=b=>strikes.push(b.id);
  const oldDocument=globalThis.document;globalThis.document={hidden:false};
  try{for(let t=0;t<2;t+=.025){bell.context.currentTime=t;bell.tick();}assert.ok(strikes.filter(id=>id==='b').length>strikes.filter(id=>id==='a').length);bell.silence();assert.equal(bell.nextStrike.size,0);}
  finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
