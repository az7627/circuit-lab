import assert from 'node:assert/strict';
import {test} from 'node:test';
import {meterConnection,meterScale} from '../dist/meters.js';
import {solveCircuit} from '../dist/solver.js';
import {componentTerminal} from '../dist/visuals.js';
import {physicalSymbol} from '../dist/physical.js';
import {component,createPreset} from '../dist/models.js';
import {serializeExperiment,parseExperiment} from '../dist/files.js';

test('a positive binding post selects the student meter range without changing ideal circuit readings',()=>{
  for(const type of ['ammeter','voltmeter'])for(const positive of [0,2]){
    const meter={id:'m',type},parts=[{id:'e',type:'battery',value:3},{id:'r',type:'resistor',value:10},meter];
    const ends=type==='ammeter'?[['e:0',`m:${positive}`],['m:1','r:0'],['r:1','e:1']]:[['e:0','r:0'],['r:1','e:1'],['e:0',`m:${positive}`],['m:1','e:1']];const wires=ends.map(([a,b],i)=>({id:`w${i}`,a,b})),result=solveCircuit(parts,wires),connection=meterConnection(meter,wires);
    assert.equal(result.status,'ok');assert.ok(Math.abs(result.current-.3)<1e-9);assert.equal(connection.range,type==='ammeter'?(positive===2?.6:3):(positive===2?3:15));assert.ok(Math.abs(result.components.m[type==='ammeter'?'current':'voltage']-(type==='ammeter'?.3:3))<1e-9);
  }
});
test('meter ticks and the pointer use the same zero, midpoint and full-scale angle',()=>{
  for(const range of [.6,3,15]){assert.equal(meterScale(0,range).angle,-60);assert.equal(meterScale(range/2,range).angle,0);assert.equal(meterScale(range,range).angle,60);assert.equal(meterScale(range*2,range).overload,true);assert.equal(meterScale(-range/10,range).reversed,true);}
  assert.match(physicalSymbol(component('a1','ammeter',0,0),{current:.3,range:.6}),/data-angle="0"/);
});
test('power and meter polarity is negative at left and positive at right in both views',()=>{
  for(const mode of ['schematic','physical'])for(const type of ['battery','ammeter','voltmeter']){const c=component('x1',type,0,0);assert.ok(componentTerminal(c,1,mode).x<componentTerminal(c,0,mode).x);}
});
test('two positive posts are reported as a range connection conflict',()=>{
  const result=solveCircuit([{id:'a',type:'ammeter'}],[{id:'w1',a:'a:0',b:'a:1'},{id:'w2',a:'a:2',b:'a:1'}]);assert.equal(result.status,'invalid');assert.match(result.message,/量程/);
});
test('the low-range third post survives export and import',()=>{
  const state=createPreset('free');state.components=[component('e1','battery',0,0),component('a1','ammeter',200,0)];state.wires=[{id:'w1',a:'e1:0',b:'a1:2'}];assert.deepEqual(parseExperiment(serializeExperiment(state,'小量程')).state.wires,state.wires);
});
test('physical devices omit printed component names and lamp brightness changes continuously',()=>{
  for(const type of ['ammeter','voltmeter','motor','bell','rheostat'])assert.doesNotMatch(physicalSymbol(component('x1',type,0,0)),/直流电流表|直流电压表|直流电动机|滑动变阻器|电铃/);
  const c=component('l1','lamp',0,0),dim=physicalSymbol(c,{power:.1}),bright=physicalSymbol(c,{power:3.6});assert.notEqual(dim.match(/physical-lamp-glass[^>]*fill="([^"]*)"/)[1],bright.match(/physical-lamp-glass[^>]*fill="([^"]*)"/)[1]);
});
