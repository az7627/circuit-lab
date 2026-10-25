import {component,createPreset} from '../../dist/models.js';

const wire=(id,a,b,via=[])=>({id,a,b,via});

export function voltmeterTapCircuit(){
  const state=createPreset('free');
  state.components=[component('l2','lamp',440,80,10),component('l1','lamp',440,270,10),component('a1','ammeter',200,270),component('v1','voltmeter',650,345),component('r1','resistor',800,480,10,90),component('e1','battery',300,700,6),component('s1','switch',650,700)];
  state.components.find(c=>c.id==='s1').closed=false;
  state.junctions=[{id:'n1',x:90,y:80},{id:'n2',x:800,y:80},{id:'n3',x:90,y:270},{id:'n4',x:800,y:270},{id:'n5',x:90,y:700},{id:'n6',x:800,y:700}];
  state.wires=[wire('w1','n1:0','l2:0'),wire('w2','l2:1','n2:0'),wire('w3','n1:0','n3:0'),wire('w4','n3:0','a1:1'),wire('w5','a1:0','l1:0'),wire('w6','l1:1','n4:0'),wire('w7','n2:0','n4:0'),wire('w8','n4:0','r1:0'),wire('w9','r1:1','n6:0'),wire('w10','n6:0','s1:1'),wire('w11','s1:0','e1:0'),wire('w12','e1:1','n5:0'),wire('w13','n5:0','n3:0'),wire('w14','v1:0','n4:0',[{x:800,y:345}])];
  return state;
}

export function bypassCircuit(){
  const state=createPreset('free');
  state.components=[component('l1','lamp',240,230,10),component('l2','lamp',490,230,10),component('l3','lamp',740,230,10),component('e1','battery',350,650,6),component('s1','switch',630,650)];
  state.junctions=[{id:'n1',x:130,y:230},{id:'n2',x:850,y:230},{id:'n3',x:130,y:650},{id:'n4',x:850,y:650}];
  state.wires=[wire('w1','n1:0','l1:0'),wire('w2','l1:1','l2:0'),wire('w3','l2:1','l3:0'),wire('w4','l3:1','n2:0'),wire('w5','n2:0','n4:0'),wire('w6','n4:0','s1:1'),wire('w7','s1:0','e1:0'),wire('w8','e1:1','n3:0'),wire('w9','n3:0','n1:0')];
  return state;
}
