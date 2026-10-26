import assert from 'node:assert/strict';
import {test} from 'node:test';
import {currentReading,voltageReading,displayReadings} from '../dist/readings.js';
import {CircuitSimulation} from '../dist/simulation.js';

test('classroom current and voltage thresholds use absolute values and preserve the boundary',()=>{
  for(const sign of [-1,1]){
    assert.equal(currentReading(sign*3e-9),0);assert.equal(currentReading(sign*.999e-6),0);assert.equal(currentReading(sign*1e-6),sign*1e-6);
    assert.equal(voltageReading(sign*.999e-3),0);assert.equal(voltageReading(sign*1e-3),sign*1e-3);
  }
});
test('tiny readings agree across meters, source, nodes, wires and visual power without changing the raw solution',()=>{
  const raw={current:3e-9,sourceVoltage:.0009,nodes:{'a:0':-.0009},wires:{w1:-3e-9},components:{a:{voltage:.0009,current:3e-9,power:2.7e-12,backEmf:.0001,heatPower:1e-12}}},before=structuredClone(raw),shown=displayReadings(raw);
  assert.equal(shown.current,0);assert.equal(shown.sourceVoltage,0);assert.equal(shown.nodes['a:0'],0);assert.equal(shown.wires.w1,0);assert.deepEqual(shown.components.a,{voltage:0,current:0,power:0,backEmf:0,heatPower:0});assert.deepEqual(raw,before);
  assert.equal(displayReadings({...raw,sourceVoltage:null}).sourceVoltage,null);
});
test('reading thresholds do not stop a capacitor from accumulating sub-threshold current',()=>{
  const parts=[{id:'e',type:'battery',value:.0005},{id:'r',type:'resistor',value:1000},{id:'c',type:'capacitor',value:10000,chargeVoltage:0}],wires=[['e:0','r:0'],['r:1','c:0'],['c:1','e:1']].map(([a,b],i)=>({id:`w${i}`,a,b})),simulation=new CircuitSimulation();
  for(let i=0;i<10;i++){const raw=simulation.advance(parts,wires,[],.1),shown=displayReadings(raw);assert.equal(shown.components.r.current,0);assert.equal(shown.components.e.voltage,0);}
  assert.ok(parts[2].chargeVoltage>0&&parts[2].chargeVoltage<.0005);
});
