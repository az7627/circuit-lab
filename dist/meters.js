export const isMeter=type=>type==='ammeter'||type==='voltmeter';
export const meterRanges=type=>type==='ammeter'?[.6,3]:[3,15];
export function meterConnection(c,wires=[]) {
  const connected=index=>wires.some(w=>w.a===`${c.id}:${index}`||w.b===`${c.id}:${index}`);
  const low=connected(2),high=connected(0),ranges=meterRanges(c.type);
  return {range:low?ranges[0]:ranges[1],positive:low?2:0,conflict:low&&high,connected:connected(1)&&(low||high)};
}
export function meterScale(value,range) {
  const ratio=Number.isFinite(value)?value/range:0;
  return {angle:-60+120*Math.max(-.08,Math.min(1.06,ratio)),overload:ratio>1+1e-8,reversed:ratio< -1e-8,ratio};
}
export function visibleTerminals(c,wires,mode) {
  return isMeter(c.type)?(mode==='physical'?[1,2,0]:[1,meterConnection(c,wires).positive]):['spdt','rheostat'].includes(c.type)?[0,1,2]:[0,1];
}
export function terminalLabel(c,index,wires=[],mode='physical') {
  if(isMeter(c.type)){if(index===1)return '负接线柱 −';const range=mode==='schematic'?meterConnection(c,wires).range:meterRanges(c.type)[index===2?0:1];return `正接线柱 + ${range} ${c.type==='ammeter'?'A':'V'}`;}
  if(c.type==='battery')return index===0?'正极 +':'负极 −';
  return c.type==='spdt'?(index===0?'公共端 C':`支路 ${index} 接线端`):c.type==='rheostat'?(index===1?'上端滑片 P':index===0?'左下固定端 A':'右下固定端 B'):c.type==='led'?(index===0?'阳极 +':'阴极 −'):`接线端 ${index}`;
}
