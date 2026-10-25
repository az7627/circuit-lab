import {component,createPreset} from '../../dist/models.js';

// The follow-up screenshot: eight clicks between pairs of component terminals,
// no helper junctions and no prescribed bends. The upper and lower ammeters
// remain electrically distinct parts of a nested series/parallel circuit.
export function directTerminalCircuit(){
  const state=createPreset('free');
  state.components=[component('e1','battery',740,682,6),component('a1','ammeter',334,682),component('a2','ammeter',494,77),component('l1','lamp',655,298,10),component('l2','lamp',346,298,10),component('l3','lamp',123,470,10,90)];
  state.wires=[['a2:1','l2:0'],['a2:0','l1:1'],['l2:0','l3:0'],['l2:1','l1:0'],['l2:1','a1:0'],['l3:1','a1:1'],['l1:1','e1:0'],['a1:0','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  return state;
}
