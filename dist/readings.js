export const CURRENT_ZERO=1e-6,VOLTAGE_ZERO=1e-3;
export const currentReading=value=>Math.abs(value)<CURRENT_ZERO?0:value;
export const voltageReading=value=>Math.abs(value)<VOLTAGE_ZERO?0:value;

// Quantize the classroom readings and visual feedback, while the simulation
// retains its full precision for capacitor charge and motor integration.
export function displayReadings(result){
  return {...result,current:currentReading(result.current),sourceVoltage:result.sourceVoltage===null?null:voltageReading(result.sourceVoltage),
    nodes:Object.fromEntries(Object.entries(result.nodes).map(([id,v])=>[id,voltageReading(v)])),
    wires:Object.fromEntries(Object.entries(result.wires).map(([id,i])=>[id,currentReading(i)])),
    components:Object.fromEntries(Object.entries(result.components).map(([id,reading])=>{
      const value={...reading,current:currentReading(reading.current),voltage:voltageReading(reading.voltage)};
      if(value.current===0||value.voltage===0)value.power=0;
      if('backEmf' in value)value.backEmf=voltageReading(value.backEmf);
      if(value.current===0)for(const key of ['internalPower','heatPower','mechanicalPower'])if(key in value)value[key]=0;
      return [id,value];
    }))};
}
