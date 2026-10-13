/** Geometry shared by rendering and electrically equivalent wire splitting. */
const same = (a,b) => Math.hypot(a.x-b.x,a.y-b.y) < 1e-7;
export function wirePoints(wire, terminalPoint) {
  const a=terminalPoint(wire.a), b=terminalPoint(wire.b);
  const via=wire.via ?? (Math.abs(a.y-b.y)<1e-7 || Math.abs(a.x-b.x)<1e-7 ? [] : [{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y}]);
  return [a,...via,b].filter((p,i,points)=>!i || !same(p,points[i-1]));
}
export function projectOnWire(wire, point, terminalPoint) {
  const points=wirePoints(wire,terminalPoint);
  let best=null;
  for(let i=0;i<points.length-1;i++) {
    const a=points[i], b=points[i+1], dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
    const t=length ? Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)) : 0;
    const p={x:a.x+t*dx,y:a.y+t*dy}, distance=Math.hypot(point.x-p.x,point.y-p.y);
    if(!best || distance<best.distance) best={point:p,distance,segment:i,points};
  }
  return best;
}
export function splitWire(wire, point, terminalPoint, junctionTerminal, secondId) {
  const hit=projectOnWire(wire,point,terminalPoint);
  if(!hit || same(hit.point,hit.points[0]) || same(hit.point,hit.points.at(-1))) return null;
  const before=[...hit.points.slice(0,hit.segment+1),hit.point].filter((p,i,all)=>!i || !same(p,all[i-1]));
  const after=[hit.point,...hit.points.slice(hit.segment+1)].filter((p,i,all)=>!i || !same(p,all[i-1]));
  return {point:hit.point,wires:[
    {id:wire.id,a:wire.a,b:junctionTerminal,via:before.slice(1,-1)},
    {id:secondId,a:junctionTerminal,b:wire.b,via:after.slice(1,-1)}
  ]};
}
