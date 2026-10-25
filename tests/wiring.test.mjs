import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectOnWire,splitWire,wirePoints} from '../dist/wiring.js';
import {solveCircuit} from '../dist/solver.js';
const positions={'e:0':{x:0,y:0},'r:0':{x:120,y:80}};
const point=key=>positions[key];

test('inserting a node on a routed wire keeps both old bends and projects onto the segment',()=>{
  const wire={id:'w',a:'e:0',b:'r:0',via:[{x:60,y:0},{x:60,y:80}]};
  const hit=projectOnWire(wire,{x:64,y:36},point);
  assert.deepEqual(hit.point,{x:60,y:36});
  const result=splitWire(wire,{x:64,y:36},point,'n:0','w2');
  assert.deepEqual(result.wires[0],{id:'w',a:'e:0',b:'n:0',via:[{x:60,y:0}]});
  assert.deepEqual(result.wires[1],{id:'w2',a:'n:0',b:'r:0',via:[{x:60,y:80}]});
});
test('splitting at a corner does not add duplicate zero-length bends',()=>{
  const wire={id:'w',a:'e:0',b:'r:0',via:[{x:60,y:0},{x:60,y:80}]};
  const result=splitWire(wire,{x:60,y:0},point,'n:0','w2');
  assert.deepEqual(result.wires[0].via,[]);
  assert.deepEqual(result.wires[1].via,[{x:60,y:80}]);
  assert.equal(splitWire(wire,{x:0,y:0},point,'n:0','w2'),null);
});
test('automatic paths are orthogonal and respect explicit straight routes',()=>{
  const automatic=wirePoints({a:'e:0',b:'r:0'},point);
  for(let i=1;i<automatic.length;i++)assert.ok(automatic[i].x===automatic[i-1].x||automatic[i].y===automatic[i-1].y);
  assert.deepEqual(wirePoints({a:'e:0',b:'r:0',via:[]},point),[positions['e:0'],positions['r:0']]);
});
test('a junction split preserves the physical circuit and supports a new parallel branch',()=>{
  const parts=[{id:'e',type:'battery',value:6},{id:'r',type:'resistor',value:10},{id:'r2',type:'resistor',value:10}];
  const wires=[{id:'w1',a:'e:0',b:'n1:0'},{id:'w2',a:'n1:0',b:'r:0'},{id:'w3',a:'r:1',b:'n2:0'},{id:'w4',a:'n2:0',b:'e:1'}];
  const nodes=[{id:'n1',x:40,y:0},{id:'n2',x:40,y:100}];
  const result=solveCircuit(parts,wires,nodes);
  assert.equal(result.status,'ok');assert.ok(Math.abs(result.current-.6)<1e-9);
  assert.ok(Math.abs(result.wires.w1-.6)<1e-9);assert.ok(Math.abs(result.wires.w2-.6)<1e-9);
  const branched=solveCircuit(parts,[...wires,{id:'w5',a:'n1:0',b:'r2:0'},{id:'w6',a:'r2:1',b:'n2:0'}],nodes);
  assert.ok(Math.abs(branched.current-1.2)<1e-9);assert.ok(Math.abs(branched.nodes['n1:0']-6)<1e-9);
  assert.ok(Math.abs(branched.wires.w1-1.2)<1e-9);assert.ok(Math.abs(branched.wires.w2-.6)<1e-9);
});
test('unconnected junctions and invalid node references are handled safely',()=>{
  const result=solveCircuit([],[],[{id:'n',x:1,y:1}]);
  assert.equal(result.status,'open');assert.equal(result.nodes['n:0'],0);
  assert.equal(solveCircuit([],[{id:'w',a:'n:0',b:'missing:0'}],[{id:'n'}]).status,'invalid');
});
test('new resistive components use their actual configured resistance',()=>{
  for(const type of ['rheostat','bell','buzzer','heater']) {
    const result=solveCircuit([{id:'e',type:'battery',value:6},{id:'load',type,value:20}],[{id:'a',a:'e:0',b:'load:0'},{id:'b',a:'load:1',b:'e:1'}]);
    assert.equal(result.status,'ok');assert.ok(Math.abs(result.current-.3)<1e-9);assert.ok(Math.abs(result.components.load.power-1.8)<1e-9);
  }
});
test('a capacitor is open and an ideal inductor conducts in steady DC',()=>{
  const wires=[{id:'a',a:'e:0',b:'x:0'},{id:'b',a:'x:1',b:'r:0'},{id:'c',a:'r:1',b:'e:1'}];
  const base=[{id:'e',type:'battery',value:6},{id:'r',type:'resistor',value:10}];
  const cap=solveCircuit([...base,{id:'x',type:'capacitor',value:100}],wires);
  assert.equal(cap.status,'open');assert.equal(cap.current,0);assert.ok(Math.abs(cap.components.x.voltage-6)<1e-9);
  const coil=solveCircuit([...base,{id:'x',type:'inductor',value:100}],wires);
  assert.equal(coil.status,'ok');assert.ok(Math.abs(coil.current-.6)<1e-9);assert.ok(Math.abs(coil.components.x.current-.6)<1e-9);assert.equal(coil.components.x.voltage,0);
});
test('a blown fuse interrupts the circuit while an intact fuse has 0.2 ohm resistance',()=>{
  const wires=[{id:'a',a:'e:0',b:'f:0'},{id:'b',a:'f:1',b:'r:0'},{id:'c',a:'r:1',b:'e:1'}];
  const base=[{id:'e',type:'battery',value:6},{id:'r',type:'resistor',value:10}];
  const intact=solveCircuit([...base,{id:'f',type:'fuse',value:1,blown:false}],wires);
  assert.ok(Math.abs(intact.current-6/10.2)<1e-9);
  const blown=solveCircuit([...base,{id:'f',type:'fuse',value:1,blown:true}],wires);
  assert.equal(blown.status,'open');assert.equal(blown.current,0);assert.ok(Math.abs(blown.components.f.voltage-6)<1e-9);
});
