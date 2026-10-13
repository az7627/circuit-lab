import assert from 'node:assert/strict';
import {test} from 'node:test';
import {componentTerminal,componentBounds,lampAppearance,fitCamera,upgradeStoredState} from '../dist/visuals.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('rheostat terminals connect the lower fixed end and upper slider, including rotations',()=>{
  const c={type:'rheostat',x:300,y:250,angle:0};
  assert.deepEqual(componentTerminal(c,0),{x:246,y:268});
  assert.deepEqual(componentTerminal(c,1),{x:300,y:196});
  const rotated={...c,angle:90};
  close(componentTerminal(rotated,0).x,282);close(componentTerminal(rotated,0).y,196);
  close(componentTerminal(rotated,1).x,354);close(componentTerminal(rotated,1).y,250);
});
test('bell terminals meet the two downward leads and stay inside its selection box',()=>{
  for(const angle of [0,90,180,270]){
    const c={type:'bell',x:300,y:250,angle},box=componentBounds(c);
    for(const index of [0,1]){const t=componentTerminal(c,index);assert.ok(t.x>=box.x&&t.x<=box.x+box.width&&t.y>=box.y&&t.y<=box.y+box.height);}
  }
  assert.deepEqual(componentTerminal({type:'bell',x:0,y:0,angle:0},0),{x:-14,y:54});
});
test('lamp brightness increases with power while radius and opacity remain modest',()=>{
  const values=[0,.05,.3,.9,3.6,14.4,10000].map(lampAppearance);
  assert.equal(values[0].opacity,0);
  for(let i=1;i<values.length;i++){
    assert.ok(values[i].level>values[i-1].level);assert.ok(values[i].opacity<=.70);assert.ok(values[i].radius<=46);
  }
  assert.notEqual(values[2].fill,values[4].fill);
  assert.deepEqual(lampAppearance(NaN),lampAppearance(0));
});
test('fit camera centers all circuit content and keeps it within wide and tall viewports',()=>{
  const bounds={x:83,y:60,width:710,height:420};
  for(const viewport of [{width:900,height:450},{width:350,height:700}]){
    const c=fitCamera(bounds,viewport),scale=Math.min(viewport.width/840,viewport.height/510)*c.zoom;
    close(c.x,438);close(c.y,270);
    assert.ok(bounds.width*scale<=viewport.width);assert.ok(bounds.height*scale<=viewport.height);
  }
});
test('upgrading old buzzer circuits retains IDs, electrical connections and records',()=>{
  const old={components:[{id:'z1',type:'buzzer'},{id:'t1',type:'rheostat'},{id:'l1',type:'lamp'}],wires:[{id:'w1',a:'z1:0',b:'t1:1',via:[{x:50,y:50}]},{id:'w2',a:'l1:0',b:'l1:1',via:[{x:20,y:20}]}],records:[{current:.2,circuit:{components:[{id:'z1',type:'buzzer'}],wires:[{id:'old',a:'z1:0',b:'z1:1'}]}}]};
  const upgraded=upgradeStoredState(old);
  assert.equal(upgraded.components[0].type,'bell');assert.equal(upgraded.components[0].id,'z1');
  assert.equal(upgraded.wires[0].b,'t1:1');assert.equal(upgraded.wires[0].via,undefined);assert.equal(upgraded.wires[1].via.length,1);
  assert.equal(upgraded.records[0].current,.2);assert.equal(upgraded.records[0].circuit.components[0].type,'bell');
  assert.deepEqual(upgradeStoredState(upgraded),upgraded);
});
