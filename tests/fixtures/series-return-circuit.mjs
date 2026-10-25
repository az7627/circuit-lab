import {component,createPreset} from '../../dist/models.js';

// L1 and the open switch are in the common return of L2 || L3. V1 measures
// that parallel bank; its probes must never become part of the load path.
export function seriesReturnCircuit(){
  const state=createPreset('free');
  state.components=[component('e1','battery',740,570,6),component('l1','lamp',180,558,10),component('l2','lamp',280,349,10),component('l3','lamp',280,28,10),component('s1','switch',460,570),component('v1','voltmeter',280,181)];
  state.components.find(c=>c.id==='s1').closed=false;
  state.wires=[['e1:0','l2:1'],['l2:1','l3:1'],['l2:1','v1:0'],['l2:0','l3:0'],['l2:0','v1:1'],['l2:0','l1:0'],['l1:1','s1:0'],['s1:1','e1:1']].map(([a,b],i)=>({id:`w${i+1}`,a,b}));
  return state;
}
