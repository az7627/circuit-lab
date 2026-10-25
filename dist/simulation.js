import {solveCircuit,motorBackEmf} from './solver.js?v=2.6';

/** Runtime memory is separate from drawing history. Merely selecting or moving
 * a part never advances time, recharges a capacitor or restarts a motor. */
export class CircuitSimulation {
  constructor(){this.capacitors=new Map();this.motors=new Map();}
  reset(){this.capacitors.clear();this.motors.clear();}
  context(components,dt){
    const ids=new Set(components.map(c=>c.id));
    for(const map of [this.capacitors,this.motors])for(const id of map.keys())if(!ids.has(id))map.delete(id);
    for(const c of components){
      if(c.type==='capacitor'){
        let memory=this.capacitors.get(c.id);
        if(!memory){memory={voltage:c.chargeVoltage??0,capacity:c.value};this.capacitors.set(c.id,memory);}
        if(memory.capacity!==c.value){memory.voltage*=memory.capacity/c.value;memory.capacity=c.value;c.chargeVoltage=memory.voltage;}
      }
      if(c.type==='motor'&&!this.motors.has(c.id))this.motors.set(c.id,0);
      if(c.type==='motor'&&c.stalled)this.motors.set(c.id,0);
    }
    return {dt,capacitors:Object.fromEntries([...this.capacitors].map(([id,m])=>[id,m.voltage])),motors:Object.fromEntries(this.motors)};
  }
  read(components,wires,junctions=[]){return solveCircuit(components,wires,junctions,this.context(components,.00001));}
  advance(components,wires,junctions=[],elapsed=.04){
    const steps=Math.max(1,Math.ceil(Math.min(.1,Math.max(.000001,elapsed))/.01)),dt=Math.min(.1,Math.max(.000001,elapsed))/steps;
    let result;
    for(let i=0;i<steps;i++){
      result=solveCircuit(components,wires,junctions,this.context(components,dt));if(result.status==='invalid'||result.status==='short')return result;
      for(const c of components){
        const r=result.components[c.id];
        if(c.type==='capacitor'){const memory=this.capacitors.get(c.id);memory.voltage=r.voltage-r.current*.05;c.chargeVoltage=memory.voltage;}
        if(c.type==='motor'){
          const old=this.motors.get(c.id),rate=40/c.value+.72,target=motorBackEmf(r.voltage,c.value);
          const next=c.stalled?0:old+(target-old)*(1-Math.exp(-rate*dt));this.motors.set(c.id,Math.abs(next)<.001?0:next);
        }
      }
    }
    return this.read(components,wires,junctions);
  }
  discharge(id,components){const c=components.find(c=>c.id===id&&c.type==='capacitor');if(c){c.chargeVoltage=0;this.capacitors.set(id,{voltage:0,capacity:c.value});}}
}
