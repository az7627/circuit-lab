import assert from 'node:assert/strict';
import {test} from 'node:test';
import {solveCircuit} from '../dist/solver.js';
import {component,createPreset} from '../dist/models.js';
import {componentTerminal,componentBounds} from '../dist/visuals.js';
import {normalizeState} from '../dist/data.js';
import {ExperimentStore} from '../dist/experiments.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const parts=()=>[component('e1','battery',100,200,6),component('d1','spdt',300,200),component('l1','lamp',550,120,10),component('l2','lamp',550,320,20)];
const wires=[{id:'w1',a:'e1:0',b:'d1:0'},{id:'w2',a:'d1:1',b:'l1:0'},{id:'w3',a:'d1:2',b:'l2:0'},{id:'w4',a:'l1:1',b:'e1:1'},{id:'w5',a:'l2:1',b:'e1:1'}];

test('SPDT selects exactly one branch and measures the common-contact current',()=>{
  for(const position of [1,2]){const components=parts();components[1].position=position;const result=solveCircuit(components,wires),active=position===1?'l1':'l2',inactive=position===1?'l2':'l1',current=position===1?.6:.3;
    assert.equal(result.status,'ok');close(result.current,current);close(result.components[active].voltage,6);close(result.components[active].current,current);close(result.components[inactive].current,0);close(result.components[inactive].power,0);close(result.components.d1.current,current);close(result.components.d1.power,0);close(result.sourceVoltage,6);close(result.resistance,position===1?10:20);
  }
});
test('an unwired throw opens the circuit while the connected throw powers the load',()=>{
  const components=parts().slice(0,3),circuit=[{id:'w1',a:'e1:0',b:'d1:0'},{id:'w2',a:'d1:2',b:'l1:0'},{id:'w3',a:'l1:1',b:'e1:1'}];
  assert.equal(solveCircuit(components,circuit).status,'open');components[1].position=2;close(solveCircuit(components,circuit).current,.6);
});
test('two SPDT switches support a two-way lighting circuit for all four positions',()=>{
  for(const first of [1,2])for(const second of [1,2]){const components=[component('e1','battery',0,0,6),{...component('d1','spdt',100,0),position:first},{...component('d2','spdt',200,0),position:second},component('l1','lamp',300,0,10)],circuit=[{id:'w1',a:'e1:0',b:'d1:0'},{id:'w2',a:'d1:1',b:'d2:1'},{id:'w3',a:'d1:2',b:'d2:2'},{id:'w4',a:'d2:0',b:'l1:0'},{id:'w5',a:'l1:1',b:'e1:1'}],result=solveCircuit(components,circuit);
    assert.equal(result.status,first===second?'ok':'open');close(result.components.l1.current,first===second?.6:0);
  }
});
test('only the selected throw can short the battery',()=>{
  const components=parts().slice(0,3),circuit=[{id:'w1',a:'e1:0',b:'d1:0'},{id:'w2',a:'d1:1',b:'e1:1'},{id:'w3',a:'d1:2',b:'l1:0'},{id:'w4',a:'l1:1',b:'e1:1'}];
  assert.equal(solveCircuit(components,circuit).status,'short');components[1].position=2;close(solveCircuit(components,circuit).current,.6);
});
test('SPDT storage retains its third terminal and selected throw after reload',()=>{
  let content=null;const storage={getItem:()=>content,setItem:(key,value)=>content=value},store=new ExperimentStore(storage),state=createPreset('free');state.components=parts();state.components[1].position=2;state.wires=wires;
  store.save(state,'双掷开关实验');const loaded=new ExperimentStore(storage).data.experiments[0].state;
  assert.equal(loaded.components[1].position,2);assert.ok(loaded.wires.some(w=>w.a==='d1:2'));close(solveCircuit(loaded.components,loaded.wires).current,.3);
});
test('invalid SPDT positions and nonexistent contacts are rejected',()=>{
  const state=createPreset('free');state.components=parts();state.wires=wires;state.components[1].position=3;
  assert.equal(normalizeState(state),null);assert.equal(solveCircuit(state.components,state.wires).status,'invalid');state.components[1].position=1;state.wires=[...wires,{id:'w6',a:'d1:3',b:'e1:1'}];assert.equal(normalizeState(state),null);assert.equal(solveCircuit(state.components,state.wires).status,'invalid');
});
test('all three SPDT terminals remain aligned with the symbol and within bounds after rotations',()=>{
  const c=component('d1','spdt',300,250);assert.deepEqual(componentTerminal(c,0),{x:246,y:250});assert.deepEqual(componentTerminal(c,1),{x:354,y:226});assert.deepEqual(componentTerminal(c,2),{x:354,y:274});
  for(const angle of [0,90,180,270]){const rotated={...c,angle},bounds=componentBounds(rotated);for(const index of [0,1,2]){const p=componentTerminal(rotated,index);assert.ok(p.x>=bounds.x&&p.x<=bounds.x+bounds.width&&p.y>=bounds.y&&p.y<=bounds.y+bounds.height);}}
});
