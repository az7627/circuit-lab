import {component,createPreset} from '../../dist/models.js';

// The user's three-lamp, two-ammeter circuit. A2 reads +1.2 A and A1 −0.6 A.
export function screenshotCircuit(){
  const state=createPreset('free');
  state.components=[component('e1','battery',456,643,6),component('s1','switch',542,456,0,90),component('l1','lamp',209,295,10),component('l2','lamp',456,295,10),component('l3','lamp',60,482,10,90),component('a1','ammeter',184,643),component('a2','ammeter',295,73)];
  state.junctions=[{id:'n1',x:60,y:73},{id:'n2',x:542,y:73},{id:'n3',x:60,y:295},{id:'n4',x:330,y:295},{id:'n5',x:60,y:643},{id:'n6',x:330,y:643}];
  const connections=[['n1:0','a2:1'],['a2:0','n2:0'],['n1:0','n3:0'],['n2:0','l2:1',[[542,295]]],['n3:0','l1:0'],['l1:1','n4:0'],['n4:0','l2:0'],['n3:0','l3:0'],['l3:1','n5:0'],['n5:0','a1:1'],['a1:0','n6:0'],['n6:0','e1:1'],['n6:0','n4:0'],['e1:0','s1:1',[[542,643]]],['s1:0','n2:0']];
  state.wires=connections.map(([a,b,via],i)=>({id:`w${i+1}`,a,b,...(via?{via:via.map(([x,y])=>({x,y}))}:{})}));
  return state;
}
