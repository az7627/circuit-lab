/** Geometry shared by rendering and electrically equivalent wire splitting. */
const same = (a,b) => Math.hypot(a.x-b.x,a.y-b.y) < 1e-7;
export function wirePoints(wire, terminalPoint, mode='schematic') {
  const a=terminalPoint(wire.a), b=terminalPoint(wire.b);
  const via=(mode==='physical'?wire.physicalVia:undefined) ?? wire.via ?? (Math.abs(a.y-b.y)<1e-7 || Math.abs(a.x-b.x)<1e-7 ? [] : [{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y}]);
  return [a,...via,b].filter((p,i,points)=>!i || !same(p,points[i-1]));
}
export function projectOnWire(wire, point, terminalPoint, mode='schematic') {
  const points=wirePoints(wire,terminalPoint,mode);
  let best=null;
  for(let i=0;i<points.length-1;i++) {
    const a=points[i], b=points[i+1], dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
    const t=length ? Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)) : 0;
    const p={x:a.x+t*dx,y:a.y+t*dy}, distance=Math.hypot(point.x-p.x,point.y-p.y);
    if(!best || distance<best.distance) best={point:p,distance,segment:i,points};
  }
  return best;
}
/** Snap only an intentional wire endpoint; a passing crossing stays insulated. */
export function nearestConnection(wires,keys,point,terminalPoint,mode='schematic',tolerance=10){
  let terminal=null;
  for(const key of keys){const p=terminalPoint(key),distance=Math.hypot(point.x-p.x,point.y-p.y);if(distance<=tolerance&&(!terminal||distance<terminal.distance))terminal={terminal:key,point:p,distance};}
  if(terminal)return terminal;
  let best=null;for(const wire of wires){const hit=projectOnWire(wire,point,terminalPoint,mode);if(hit&&hit.distance<=tolerance&&(!best||hit.distance<best.distance))best={wire:wire.id,...hit};}
  return best;
}
export function splitWire(wire, point, terminalPoint, junctionTerminal, secondId, mode='schematic') {
  const hit=projectOnWire(wire,point,terminalPoint,mode);
  if(!hit || same(hit.point,hit.points[0]) || same(hit.point,hit.points.at(-1))) return null;
  const first={...wire,b:junctionTerminal},second={...wire,id:secondId,a:junctionTerminal};
  for(const route of ['schematic','physical']) {
    if(route==='physical'&&mode!=='physical'&&!wire.physicalVia)continue;
    const projection=(route===mode?hit:projectOnWire(wire,hit.point,terminalPoint,route))??{points:[terminalPoint(wire.a),terminalPoint(wire.b)],point:hit.point,segment:0};
    const before=[...projection.points.slice(0,projection.segment+1),projection.point];
    const after=[projection.point,...projection.points.slice(projection.segment+1)];
    const key=route==='physical'?'physicalVia':'via';
    first[key]=before.slice(1).filter((p,i,all)=>(!i||!same(p,all[i-1]))&&!same(p,hit.point));
    second[key]=after.slice(0,-1).filter((p,i,all)=>(!i||!same(p,all[i-1]))&&!same(p,hit.point));
  }
  return {point:hit.point,wires:[first,second]};
}

/** Simplify sampled pointer movement while retaining corners and limiting saved size. */
export function simplifyTrace(points,tolerance=1,maxPoints=2048) {
  const input=points.filter((p,i)=>!i||!same(p,points[i-1])).map(p=>({x:p.x,y:p.y}));
  if(input.length<=2)return input;
  function simplify(epsilon) {
    const keep=new Set([0,input.length-1]),stack=[[0,input.length-1]];
    while(stack.length){const [start,end]=stack.pop(),a=input[start],b=input[end],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;let farthest=-1,best=epsilon*epsilon;
      for(let i=start+1;i<end;i++){const p=input[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0,distance=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;if(distance>best){best=distance;farthest=i;}}
      if(farthest>=0){keep.add(farthest);stack.push([start,farthest],[farthest,end]);}
    }
    return [...keep].sort((a,b)=>a-b).map(i=>input[i]);
  }
  let epsilon=Math.max(.01,tolerance),result=simplify(epsilon);
  while(result.length>maxPoints){epsilon*=1.5;result=simplify(epsilon);}
  return result;
}

/** Interior points only: endpoints always follow their component or junction. */
export function tracedRoute(points,start,end,tolerance=1) {
  return simplifyTrace([start,...points,end],tolerance).slice(1,-1);
}
