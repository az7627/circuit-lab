import {componentTerminal,componentHitBounds} from './visuals.js?v=2.6';
import {physicalBounds,physicalObstacleBoxes} from './physical.js?v=2.6';
import {wirePoints,simplifyTrace} from './wiring.js?v=2.6';
import {circuitNets,layoutSchematic,topologySignature} from './topology.js?v=2.6';

const eps=1e-6,copy=p=>({x:p.x,y:p.y}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const inflate=(b,p)=>({x:b.x-p,y:b.y-p,width:b.width+p*2,height:b.height+p*2});
const inside=(p,b)=>p.x>b.x+eps&&p.x<b.x+b.width-eps&&p.y>b.y+eps&&p.y<b.y+b.height-eps;
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const compare=(a,b)=>{for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>eps)return a[i]<b[i]?-1:1;return 0;};
const lengthOf=points=>points.slice(1).reduce((sum,p,i)=>sum+distance(p,points[i]),0);
const pointSegmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
const traceDistance=(p,points)=>{let best=Infinity;for(let i=1;i<points.length;i++)best=Math.min(best,pointSegmentDistance(p,points[i-1],points[i]));return Number.isFinite(best)?best:0;};
export function pointIn(state,key,mode=state.viewMode) {
  const [id,index]=key.split(':'),c=state.components.find(c=>c.id===id);
  return c?componentTerminal(c,Number(index),mode):state.junctions.find(n=>n.id===id)??{x:0,y:0};
}
function direction(state,key,mode) {
  const [id,indexText]=key.split(':'),c=state.components.find(c=>c.id===id),index=Number(indexText);if(!c)return null;
  return portDirection(c,index,mode);
}
function portDirection(c,index,mode) {
  let d={x:index===0?-1:1,y:0};
  if(c.type==='battery'||['ammeter','voltmeter'].includes(c.type))d={x:index===1?-1:1,y:0};
  if(['ammeter','voltmeter'].includes(c.type)&&mode==='physical')d={x:0,y:1};
  if(c.type==='bell')d={x:0,y:1};
  if(c.type==='rheostat')d=index===0?{x:-1,y:0}:{x:0,y:-1};
  const r=c.angle*Math.PI/180;return {x:Math.round(d.x*Math.cos(r)-d.y*Math.sin(r)),y:Math.round(d.x*Math.sin(r)+d.y*Math.cos(r))};
}
function boxesFor(state,mode,clearance=mode==='physical'?6:8){return state.components.flatMap(c=>(mode==='physical'?physicalObstacleBoxes(c):[componentHitBounds(c)]).map(box=>({...inflate(box,clearance),id:c.id,component:c,mode})));}
function clipSegment(a,b,box) {
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-box.x],[dx,box.x+box.width-a.x],[-dy,a.y-box.y],[dy,box.y+box.height-a.y]]){if(Math.abs(p)<eps){if(q<=eps)return null;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>=hi-eps)return null;}}
  return {a:{x:a.x+lo*dx,y:a.y+lo*dy},b:{x:a.x+hi*dx,y:a.y+hi*dy},length:Math.max(0,hi-lo)*distance(a,b)};
}
const clippedLength=(a,b,box)=>clipSegment(a,b,box)?.length??0;
function exits(points,boxes,wire) {
  const ranges=new Map();for(const box of boxes){let start=0,end=points.length-1;
    if(box.id===wire.a.split(':')[0]&&inside(points[0],box)){start=points.findIndex(p=>!inside(p,box));if(start<0)start=points.length;}
    if(box.id===wire.b.split(':')[0]&&inside(points.at(-1),box)){end=-1;for(let i=points.length-1;i>=0;i--)if(!inside(points[i],box)){end=i;break;}}
    ranges.set(box,{start,end});
  }return ranges;
}
function portCorridor(p,origin,box,key) {
  if(!box?.component)return true;const d=portDirection(box.component,Number(key.split(':')[1]),box.mode),dx=p.x-origin.x,dy=p.y-origin.y,along=dx*d.x+dy*d.y,across=Math.abs(dx*d.y-dy*d.x);
  // Binding posts are external attachment points: a lead may leave the nut sideways.
  if(box.mode==='physical'&&Math.hypot(dx,dy)<=26)return true;
  return along>=-eps&&across<=6+Math.max(0,along)*.5;
}
function bodyCost(points,boxes,wire,blockedSegments=null) {
  const ranges=exits(points,boxes,wire),blocked=new Set();let penetration=0;
  for(let i=1;i<points.length;i++)for(const box of boxes){
    const hit=clipSegment(points[i-1],points[i],box),range=ranges.get(box);if(!hit||hit.length<eps)continue;
    if(i<=range.start&&portCorridor(hit.a,points[0],box,wire.a)&&portCorridor(hit.b,points[0],box,wire.a)||i>range.end&&portCorridor(hit.a,points.at(-1),box,wire.b)&&portCorridor(hit.b,points.at(-1),box,wire.b))continue;
    blocked.add(box.id??box);penetration+=hit.length;blockedSegments?.add(i);
  }
  return blocked.size+penetration/10000;
}
export function routeIsClear(points,state,wire,mode=state.viewMode) {
  if(points.length<2)return true;
  if(mode==='schematic'&&points.some((p,i)=>i&&Math.abs(p.x-points[i-1].x)>eps&&Math.abs(p.y-points[i-1].y)>eps))return false;
  if(mode==='schematic')for(const [index,next] of [[0,1],[points.length-1,points.length-2]]){const d=direction(state,index===0?wire.a:wire.b,mode);if(d){const a=points[index],b=points[next];if((b.x-a.x)*d.x+(b.y-a.y)*d.y< -eps)return false;}}
  return bodyCost(points,boxesFor(state,mode,mode==='physical'?2:8),wire)<eps;
}

/** Proper crossings, T contacts and overlap, including intersections at grid vertices. */
function intersection(a,b,c,d) {
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)-eps||Math.min(a.x,b.x)>Math.max(c.x,d.x)+eps||Math.max(a.y,b.y)<Math.min(c.y,d.y)-eps||Math.min(a.y,b.y)>Math.max(c.y,d.y)+eps)return null;
  const ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,den=ux*vy-uy*vx;
  if(Math.abs(den)>eps){const t=((c.x-a.x)*vy-(c.y-a.y)*vx)/den,u=((c.x-a.x)*uy-(c.y-a.y)*ux)/den;if(t< -eps||t>1+eps||u< -eps||u>1+eps)return null;return {x:a.x+t*ux,y:a.y+t*uy,weight:(t<eps||t>1-eps?.5:1)*(u<eps||u>1-eps?.5:1)};}
  if(Math.abs((c.x-a.x)*uy-(c.y-a.y)*ux)>eps)return null;
  const length=ux*ux+uy*uy;if(length<eps)return null;
  const t=((c.x-a.x)*ux+(c.y-a.y)*uy)/length,u=((d.x-a.x)*ux+(d.y-a.y)*uy)/length,lo=Math.max(0,Math.min(t,u)),hi=Math.min(1,Math.max(t,u));
  if(hi-lo<eps)return null;return {x:a.x+(lo+hi)/2*ux,y:a.y+(lo+hi)/2*uy,overlap:(hi-lo)*Math.sqrt(length),weight:1};
}
function trackList(tracks){return tracks.map(t=>Array.isArray(t)?{points:t,shared:[]}:t);}
function crosses(a,b,track) {
  let cost=0;for(let i=1;i<track.points.length;i++){const hit=intersection(a,b,track.points[i-1],track.points[i]);if(hit&&!track.shared?.some(p=>distance(p,hit)<40))cost+=hit.overlap?hit.overlap/24+1:hit.weight;}return cost;
}
function crossingsBetween(points,track) {
  const hits=new Set();let overlap=0;for(let i=1;i<points.length;i++)for(let j=1;j<track.points.length;j++){const hit=intersection(points[i-1],points[i],track.points[j-1],track.points[j]);if(!hit||track.shared?.some(p=>distance(p,hit)<40))continue;if(hit.overlap)overlap+=hit.overlap;else hits.add(`${Math.round(hit.x*100)}:${Math.round(hit.y*100)}`);}
  return hits.size+overlap/24;
}
function peers(wire,routes,nets,mode) {
  const net=nets.find(wire.a),own=[wire.a,wire.b];
  return routes.filter(r=>r.wire.id!==wire.id&&(mode==='physical'||nets.find(r.wire.a)!==net)).map(r=>({points:r.points,shared:own.filter(k=>r.wire.a===k||r.wire.b===k).map(k=>r.points[r.wire.a===k?0:r.points.length-1])}));
}
export function countWireCrossings(state,mode=state.viewMode) {
  const nets=circuitNets(state),routes=state.wires.map(wire=>({wire,points:wirePoints(wire,k=>pointIn(state,k,mode),mode)}));let total=0;
  for(let i=0;i<routes.length;i++)for(const track of peers(routes[i].wire,routes.slice(i+1),nets,mode))total+=crossingsBetween(routes[i].points,track);
  return total;
}
class Heap {
  values=[];
  push(value){const a=this.values;a.push(value);let i=a.length-1;while(i){const p=(i-1)>>1;if(compare(a[p].rank,value.rank)<=0)break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&compare(a[child+1].rank,a[child].rank)<0)child++;if(compare(a[child].rank,last.rank)>=0)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
function sparse(points,max=12) {if(points.length<=max)return points;const out=[];for(let i=0;i<max;i++)out.push(points[Math.round(i*(points.length-1)/(max-1))]);return out;}

/** Lexicographic A*: crossings, then component penetration, then shape and length. */
export function routeOrthogonal(start,end,boxes=[],tracks=[],{startDirection=null,endDirection=null,hint=[],allowBodyCrossings=false,ports=[],bendCost=24}={}) {
  tracks=trackList(tracks);const xs=[start.x,end.x],ys=[start.y,end.y],margin=180;
  const region={x:Math.min(start.x,end.x,...hint.map(p=>p.x))-margin,y:Math.min(start.y,end.y,...hint.map(p=>p.y))-margin};region.width=Math.max(start.x,end.x,...hint.map(p=>p.x))-region.x+margin;region.height=Math.max(start.y,end.y,...hint.map(p=>p.y))-region.y+margin;
  // A long existing lead must be bypassable at its ends, even beyond the local window.
  for(const track of tracks){const tx=Math.min(...track.points.map(p=>p.x)),ty=Math.min(...track.points.map(p=>p.y)),right=Math.max(...track.points.map(p=>p.x)),bottom=Math.max(...track.points.map(p=>p.y));if(!overlap(inflate({x:tx,y:ty,width:right-tx,height:bottom-ty},1),region))continue;const x=Math.min(region.x,tx-28),y=Math.min(region.y,ty-28);region.width=Math.max(region.x+region.width,right+28)-x;region.height=Math.max(region.y+region.height,bottom+28)-y;region.x=x;region.y=y;}
  const nearby=boxes.filter(b=>overlap(b,region));for(const b of nearby){xs.push(b.x-2,b.x+b.width+2);ys.push(b.y-2,b.y+b.height+2);}
  for(const p of sparse(hint,16)){xs.push(p.x);ys.push(p.y);}
  for(const track of tracks)for(const p of sparse(simplifyTrace(track.points,3),8))if(p.x>=region.x&&p.x<=region.x+region.width&&p.y>=region.y&&p.y<=region.y+region.height){xs.push(p.x-14,p.x+14);ys.push(p.y-14,p.y+14);}
  xs.push(region.x,region.x+region.width);ys.push(region.y,region.y+region.height);
  const unique=values=>[...new Set(values.map(v=>Math.round(v*1e4)/1e4))].sort((a,b)=>a-b),cap=(values,a,b)=>{const sorted=unique(values),selected=sorted.length<=100?sorted:unique([a,b,...sparse(sorted,96)]);return [...new Set(selected.map(v=>Math.abs(v-a)<.0001?a:Math.abs(v-b)<.0001?b:v))];},x=cap(xs,start.x,end.x),y=cap(ys,start.y,end.y),nx=x.length,ny=y.length;
  const near=(values,n)=>values.findIndex(v=>Math.abs(v-n)<.0001),sx=near(x,start.x),sy=near(y,start.y),ex=near(x,end.x),ey=near(y,end.y),encode=(xi,yi,dir)=>(yi*nx+xi)*3+dir;
  const size=nx*ny*3,g=Array.from({length:3},()=>new Float64Array(size).fill(Infinity)),previous=new Int32Array(size).fill(-1),visited=new Uint8Array(size),costs=new Map(),heap=new Heap(),first=encode(sx,sy,0);
  for(const layer of g)layer[first]=0;heap.push({id:first,rank:[0,0,distance(start,end)]});let final=-1,visits=0;
  while(heap.values.length&&visits++<30000){const {id}=heap.pop();if(visited[id])continue;visited[id]=1;const dir=id%3,cell=(id-dir)/3,xi=cell%nx,yi=Math.floor(cell/nx);if(xi===ex&&yi===ey){final=id;break;}
    const a={x:x[xi],y:y[yi]};
    for(const [xx,yy,nextDir] of [[xi-1,yi,1],[xi+1,yi,1],[xi,yi-1,2],[xi,yi+1,2]]){if(xx<0||xx>=nx||yy<0||yy>=ny)continue;const next=encode(xx,yy,nextDir);if(visited[next])continue;const b={x:x[xx],y:y[yy]},nextCell=yy*nx+xx,key=cell<nextCell?`${cell}:${nextCell}`:`${nextCell}:${cell}`;
      if(id===first&&startDirection&&(b.x-a.x)*startDirection.x+(b.y-a.y)*startDirection.y<=eps)continue;
      if(xx===ex&&yy===ey&&endDirection&&(b.x-a.x)*endDirection.x+(b.y-a.y)*endDirection.y>=-eps)continue;
      if(!costs.has(key)){
        let penetration=0;for(const box of nearby){const onRay=(p,port)=>Math.abs((p.x-port.origin.x)*port.d.y-(p.y-port.origin.y)*port.d.x)<eps&&(p.x-port.origin.x)*port.d.x+(p.y-port.origin.y)*port.d.y>=-eps;if(ports.some(port=>port.d&&port.owner===box.id&&onRay(a,port)&&onRay(b,port)))continue;const amount=clippedLength(a,b,box);if(amount>eps)penetration+=32+amount;}
        const length=distance(a,b),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},deviation=hint.length?Math.min(100,traceDistance(mid,hint)):0;
        costs.set(key,[tracks.reduce((n,t)=>n+crosses(a,b,t),0),penetration,length*(1+.045*deviation)]);
      }
      const cost=costs.get(key);if(!allowBodyCrossings&&cost[1]>eps)continue;
      const score=[g[0][id]+cost[0],g[1][id]+cost[1],g[2][id]+cost[2]+(dir&&dir!==nextDir?bendCost:0)];if(compare(score,g.map(layer=>layer[next]))>=0)continue;
      score.forEach((v,i)=>g[i][next]=v);previous[next]=id;heap.push({id:next,rank:[score[0],score[1],score[2]+Math.abs(b.x-end.x)+Math.abs(b.y-end.y)]});
    }
  }
  if(final<0)return null;
  const result=[];for(let id=final;id>=0;id=previous[id]){const cell=Math.floor(id/3);result.push({x:x[cell%nx],y:y[Math.floor(cell/nx)]});}return simplifyTrace(result.reverse(),.01);
}
function rounded(points,radius=12){if(points.length<3)return points;const out=[copy(points[0])];for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],l=distance(a,b),r=distance(b,c),amount=Math.min(radius,l/3,r/3);if(amount<eps)continue;const p={x:b.x+(a.x-b.x)*amount/l,y:b.y+(a.y-b.y)*amount/l},q={x:b.x+(c.x-b.x)*amount/r,y:b.y+(c.y-b.y)*amount/r};out.push(p);for(const t of [.25,.5,.75,1])out.push({x:(1-t)**2*p.x+2*(1-t)*t*b.x+t*t*q.x,y:(1-t)**2*p.y+2*(1-t)*t*b.y+t*t*q.y});}out.push(copy(points.at(-1)));return out;}
function scoreRoute(points,tracks,boxes,wire,hint=[]) {
  let deviation=0;if(hint.length)for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};deviation+=distance(a,b)*Math.min(100,traceDistance(mid,hint));}
  return [tracks.reduce((n,t)=>n+crossingsBetween(points,t),0),bodyCost(points,boxes,wire),lengthOf(points)+Math.max(0,simplifyTrace(points,2).length-2)*24+deviation*.045];
}
function plannedRoute(state,wire,mode,boxes,tracks,hint=[]) {
  const a=pointIn(state,wire.a,mode),b=pointIn(state,wire.b,mode),options={startDirection:direction(state,wire.a,mode),endDirection:direction(state,wire.b,mode),hint:mode==='physical'?sparse(simplifyTrace(hint,6),6):hint,bendCost:mode==='physical'?72:24,ports:[{owner:wire.a.split(':')[0],origin:a,d:direction(state,wire.a,mode)},{owner:wire.b.split(':')[0],origin:b,d:direction(state,wire.b,mode)}]};
  let best=null,bestScore=null;
  for(const allowBodyCrossings of [false,true]){
    if(allowBodyCrossings&&bestScore?.[0]<eps)break;
    const path=routeOrthogonal(a,b,boxes,tracks,{...options,allowBodyCrossings});if(!path)continue;
    const points=simplifyTrace(path,.01),curve=mode==='physical'?rounded(points):points;
    const straightScore=scoreRoute(points,tracks,boxes,wire,hint),curveScore=scoreRoute(curve,tracks,boxes,wire,hint),candidate=compare(curveScore.slice(0,2),straightScore.slice(0,2))<=0?curve:points,score=scoreRoute(candidate,tracks,boxes,wire,hint);
    if(!best||compare(score,bestScore)<0){best=candidate;bestScore=score;}
  }
  return best;
}
function circuitScore(routes,nets,mode,boxes,polish=null) {
  let crossings=0,bodies=0,style=0;for(let i=0;i<routes.length;i++){const r=routes[i];crossings+=peers(r.wire,routes.slice(i+1),nets,mode).reduce((sum,t)=>sum+crossingsBetween(r.points,t),0);bodies+=bodyCost(r.points,boxes,r.wire);if(polish)style+=scoreRoute(r.points,[],boxes,r.wire,polish.references.get(r.wire.id))[2];}
  return polish?[crossings,bodies,style]:[crossings,bodies];
}
function improvePairs(state,routes,nets,mode,boxes,active,polish=null) {
  let quality=circuitScore(routes,nets,mode,boxes,polish),attempts=0;
  if(quality.every(n=>n<eps))return;
  // Moving one lead can trap another behind it. Re-plan both, then accept only a
  // strict improvement of the complete circuit, in the user's priority order.
  const limit=polish&&quality[0]<eps&&quality[1]<eps?16:32,order=polish?[...routes].sort((a,b)=>lengthOf(b.points)-lengthOf(a.points)):routes;
  for(const focus of order){
    if(!polish?.ids.has(focus.wire.id)&&bodyCost(focus.points,boxes,focus.wire)<eps&&peers(focus.wire,routes,nets,mode).every(t=>crossingsBetween(focus.points,t)<eps))continue;
    for(const other of routes){if(other===focus||attempts++>=limit)continue;
      const oldFocus=focus.points,oldOther=other.points,rest=routes.filter(r=>r!==other),candidate=plannedRoute(state,focus.wire,mode,boxes,peers(focus.wire,rest,nets,mode),polish?.references.get(focus.wire.id)??oldFocus);if(!candidate)continue;focus.points=candidate;
      const second=plannedRoute(state,other.wire,mode,boxes,peers(other.wire,routes,nets,mode),polish?.references.get(other.wire.id)??oldOther);if(second)other.points=second;
      const next=circuitScore(routes,nets,mode,boxes,polish);
      if(compare(next,quality)<0){quality=next;active.add(focus.wire.id);active.add(other.wire.id);if(quality.every(n=>n<eps))return;}
      else {focus.points=oldFocus;other.points=oldOther;}
    }
    if(attempts>=limit)break;
  }
}

/** Every route sees every peer, followed by bounded rip-up / reroute passes. */
export function routeCircuit(state,mode=state.viewMode,{force=false,ids=null,preservePhysical=false,optimize=false}={}) {
  const boxes=boxesFor(state,mode),key=mode==='physical'?'physicalVia':'via',nets=circuitNets(state),routes=state.wires.map(wire=>({wire,points:wirePoints(wire,k=>pointIn(state,k,mode),mode)})).sort((a,b)=>a.wire.id.localeCompare(b.wire.id,undefined,{numeric:true})),active=new Set();
  let initializing=false;const generated=new Set(),references=new Map(routes.map(r=>[r.wire.id,r.points]));
  for(const route of routes){const {wire}=route;if(ids&&!ids.has(wire.id))continue;if(mode==='physical'&&preservePhysical&&wire[key]!==undefined)continue;
    const valid=routeIsClear(route.points,state,wire,mode);if(force||wire[key]===undefined){initializing=true;if(mode==='physical')generated.add(wire.id);const path=plannedRoute(state,wire,mode,boxes,[],force?[]:route.points);if(path)route.points=path;active.add(wire.id);}
    else if(optimize||!valid)active.add(wire.id);
  }
  const passes=force||optimize||initializing?3:1;
  for(let pass=0;pass<passes;pass++){
    let changed=false;const order=pass%2?[...routes].reverse():routes;
    for(const route of order){if(!active.has(route.wire.id))continue;const tracks=peers(route.wire,routes,nets,mode),reference=route.points,before=scoreRoute(route.points,tracks,boxes,route.wire,reference),valid=routeIsClear(route.points,state,route.wire,mode);
      if(valid&&before[0]<eps)continue;
      const candidate=plannedRoute(state,route.wire,mode,boxes,tracks,reference);if(!candidate)continue;const after=scoreRoute(candidate,tracks,boxes,route.wire,reference);
      const wrongGeometry=mode==='schematic'&&route.points.some((p,i)=>i&&Math.abs(p.x-route.points[i-1].x)>eps&&Math.abs(p.y-route.points[i-1].y)>eps);
      if(wrongGeometry||compare(after.slice(0,2),before.slice(0,2))<0||!valid&&after[0]<=before[0]+eps&&after[1]<=before[1]+eps){route.points=candidate;changed=true;}
    }
    if(!changed)break;
  }
  if((force||optimize||initializing)&&routes.length<=40){
    improvePairs(state,routes,nets,mode,boxes,active);
    for(let pass=0;pass<2&&generated.size;pass++){
      const detours=new Set(routes.filter(r=>generated.has(r.wire.id)&&lengthOf(r.points)>1.4*(Math.abs(r.points[0].x-r.points.at(-1).x)+Math.abs(r.points[0].y-r.points.at(-1).y))+40).map(r=>r.wire.id));
      if(!detours.size||!circuitScore(routes,nets,mode,boxes).every(n=>n<eps))break;
      for(const r of routes.filter(r=>detours.has(r.wire.id))){const tracks=peers(r.wire,routes,nets,mode),hint=references.get(r.wire.id),candidate=plannedRoute(state,r.wire,mode,boxes,tracks,hint);if(candidate&&compare(scoreRoute(candidate,tracks,boxes,r.wire,hint),scoreRoute(r.points,tracks,boxes,r.wire,hint))<0)r.points=candidate;}
      improvePairs(state,routes,nets,mode,boxes,active,{ids:detours,references});
    }
  }
  for(const {wire,points} of routes)if(active.has(wire.id))wire[key]=points.slice(1,-1);
}
function saveLayout(state,view){const poses={};for(const item of [...state.components,...state.junctions])poses[item.id]={x:item.x,y:item.y,...('angle' in item?{angle:item.angle}:{})};return {version:2,signature:topologySignature(state),poses,...(view?{view:{...view}}:{})};}
function arrangePhysical(state,newIds) {
  const accepted=[];
  for(const c of [...state.components].sort((a,b)=>Number(newIds.has(a.id))-Number(newIds.has(b.id)))){if(newIds.has(c.id)&&['ammeter','voltmeter'].includes(c.type))c.angle=0;const bound=()=>inflate(physicalBounds(c),14);let box=bound();
    if(newIds.has(c.id)&&accepted.some(b=>overlap(b,box))){const original=copy(c),candidates=[];for(let ring=1;ring<12;ring++)for(let dx=-ring;dx<=ring;dx++)for(let dy=-ring;dy<=ring;dy++)if(Math.max(Math.abs(dx),Math.abs(dy))===ring)candidates.push({x:original.x+dx*160,y:original.y+dy*140});candidates.sort((a,b)=>distance(a,original)-distance(b,original));for(const p of candidates){c.x=p.x;c.y=p.y;box=bound();if(!accepted.some(b=>overlap(b,box)))break;}}
    accepted.push(box);
  }
  for(const n of state.junctions){if(!newIds.has(n.id))continue;for(let attempt=0;attempt<30;attempt++){const box=accepted.find(b=>inside(n,b));if(!box)break;const candidates=[{x:box.x-16,y:n.y},{x:box.x+box.width+16,y:n.y},{x:n.x,y:box.y-16},{x:n.x,y:box.y+box.height+16}];candidates.sort((a,b)=>distance(a,n)-distance(b,n));Object.assign(n,candidates.find(p=>!accepted.some(b=>inside(p,b)))??candidates[0]);}}
}
/** Cached hand layouts survive round trips; changed topology is redrawn from its nodes. */
export function convertView(state,mode,view=null) {
  state.layouts??={};const activeMode=state.viewMode??'schematic',legacy=activeMode==='schematic'&&state.layouts[activeMode]&&state.layouts[activeMode].version!==2;
  state.layouts[activeMode]=saveLayout(state,view);if(legacy)state.layouts[activeMode].version=1;const cached=state.layouts[mode],newIds=new Set();
  const rebuild=mode==='schematic'&&(!cached||cached.version!==2||cached.signature!==topologySignature(state));
  for(const item of [...state.components,...state.junctions]){const pose=cached?.poses?.[item.id];if(pose&&!rebuild)Object.assign(item,pose);else newIds.add(item.id);}
  state.viewMode=mode;
  if(rebuild){layoutSchematic(state);for(const wire of state.wires)delete wire.via;}
  else if(mode==='physical')arrangePhysical(state,newIds);
  routeCircuit(state,mode,{force:rebuild,preservePhysical:mode==='physical'&&Boolean(cached)});state.layouts[mode]=saveLayout(state,cached?.view);
  return {newLayout:!cached||rebuild,view:rebuild?null:cached?.view??null};
}

function samplePath(points,step=14){const total=lengthOf(points),spacing=Math.max(step,total/240),out=[copy(points[0])];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(distance(a,b)/spacing));for(let j=1;j<=steps;j++)out.push({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps});}return out;}
/** Transport curvature with the moving chord; stretching consumes cable slack. */
export function deformCable(points,newStart,newEnd) {
  if(points.length<2)return [copy(newStart),copy(newEnd)];
  const a=points[0],b=points.at(-1),delta={x:newStart.x-a.x,y:newStart.y-a.y};
  if(Math.abs(delta.x-(newEnd.x-b.x))<eps&&Math.abs(delta.y-(newEnd.y-b.y))<eps)return points.map(p=>({x:p.x+delta.x,y:p.y+delta.y}));
  const sampled=samplePath(points),lengths=[0];for(let i=1;i<sampled.length;i++)lengths.push(lengths.at(-1)+distance(sampled[i-1],sampled[i]));const total=lengths.at(-1)||1,oldLength=distance(a,b),newLength=distance(newStart,newEnd),turn=oldLength>eps&&newLength>eps?Math.atan2((b.x-a.x)*(newEnd.y-newStart.y)-(b.y-a.y)*(newEnd.x-newStart.x),(b.x-a.x)*(newEnd.x-newStart.x)+(b.y-a.y)*(newEnd.y-newStart.y)):0;
  const slack=total*total-oldLength*oldLength,scale=slack>1&&newLength>oldLength?Math.sqrt(Math.max(.04,(total*total-newLength*newLength)/slack)):1,rotation=Math.min(1,oldLength/60,newLength/60),cos=1-rotation+Math.cos(turn)*rotation,sin=Math.sin(turn)*rotation;
  const result=sampled.map((p,i)=>{const t=lengths[i]/total,rx=p.x-a.x-(b.x-a.x)*t,ry=p.y-a.y-(b.y-a.y)*t;return {x:newStart.x+(newEnd.x-newStart.x)*t+(rx*cos-ry*sin)*scale,y:newStart.y+(newEnd.y-newStart.y)*t+(rx*sin+ry*cos)*scale};});
  result[0]=copy(newStart);result[result.length-1]=copy(newEnd);return simplifyTrace(result,.2);
}
function projectCable(points,boxes,wire,faces) {
  const sampled=samplePath(points,10),original=sampled.map(copy),ranges=exits(sampled,boxes,wire);
  // The chosen side stays fixed through a drag, preventing alternating detours.
  for(let pass=0;pass<10;pass++)for(let i=1;i<sampled.length-1;i++){
    const p=sampled[i];if(pass<5){p.x=p.x*.8+(sampled[i-1].x+sampled[i+1].x)*.075+original[i].x*.05;p.y=p.y*.8+(sampled[i-1].y+sampled[i+1].y)*.075+original[i].y*.05;}
    for(const box of boxes){const range=ranges.get(box);if((i<range.start&&portCorridor(p,sampled[0],box,wire.a))||(i>range.end&&portCorridor(p,sampled.at(-1),box,wire.b))||!inside(p,box))continue;
      const key=`${wire.id}:${box.id}`,sides=[{axis:'x',value:box.x-2,d:p.x-box.x},{axis:'x',value:box.x+box.width+2,d:box.x+box.width-p.x},{axis:'y',value:box.y-2,d:p.y-box.y},{axis:'y',value:box.y+box.height+2,d:box.y+box.height-p.y}];
      let side=faces.get(key);if(side===undefined){side=sides.reduce((best,s,j)=>s.d<sides[best].d?j:best,0);faces.set(key,side);}p[sides[side].axis]=sides[side].value;
    }
  }
  return simplifyTrace(sampled,.1);
}
function terminalTangents(points,state,wire,strength) {
  if(strength<eps||points.length<2)return points;
  const sampled=samplePath(points,10),lengths=[0];for(let i=1;i<sampled.length;i++)lengths.push(lengths.at(-1)+distance(sampled[i-1],sampled[i]));const total=lengths.at(-1),support=Math.min(80,total*.4),result=sampled.map(copy);if(support<eps)return points;
  for(const reverse of [false,true]){const index=reverse?sampled.length-1:0,next=reverse?index-1:1,d=direction(state,reverse?wire.b:wire.a,'physical');if(!d)continue;const length=distance(sampled[index],sampled[next])||1,v={x:(sampled[next].x-sampled[index].x)/length,y:(sampled[next].y-sampled[index].y)/length};
    for(let i=1;i<sampled.length-1;i++){const arc=reverse?total-lengths[i]:lengths[i],t=arc/support;if(t>=1)continue;const weight=arc*(1-t)**2*strength;result[i].x+=(d.x-v.x)*weight;result[i].y+=(d.y-v.y)*weight;}
  }
  return simplifyTrace(result,.15);
}
function repairPhysicalSpan(state,route,routes,nets,boxes,solids) {
  const {wire}=route,tracks=peers(wire,routes,nets,'physical');let points=route.points;
  // Keep the unaffected curve on both sides of an obstruction. A dense mouse
  // trace is a shape reference, never a sequence of mandatory routing corners.
  for(let pass=0;pass<4;pass++){
    const blocked=new Set();bodyCost(points,solids,wire,blocked);if(!blocked.size)break;
    const segments=[...blocked].sort((a,b)=>a-b);let last=segments[0];for(const i of segments.slice(1)){if(i>last+2)break;last=i;}
    let start=Math.max(0,segments[0]-2),end=Math.min(points.length-1,last+1);
    while(start>0&&boxes.some(b=>inside(points[start],inflate(b,8))))start--;
    while(end<points.length-1&&boxes.some(b=>inside(points[end],inflate(b,8))))end++;
    const a=points[start],b=points[end],hint=points.slice(start,end+1),ports=[];
    if(start===0)ports.push({owner:wire.a.split(':')[0],origin:a,d:direction(state,wire.a,'physical')});
    if(end===points.length-1)ports.push({owner:wire.b.split(':')[0],origin:b,d:direction(state,wire.b,'physical')});
    const self=[{points:points.slice(0,start+1),shared:[a]},{points:points.slice(end),shared:[b]}].filter(t=>t.points.length>1);
    const patch=routeOrthogonal(a,b,boxes,[...tracks,...self],{hint:sparse(simplifyTrace(hint,6),6),bendCost:72,ports,startDirection:start===0?direction(state,wire.a,'physical'):null,endDirection:end===points.length-1?direction(state,wire.b,'physical'):null});
    if(!patch)break;
    const before=scoreRoute(points,tracks,solids,wire),part=[rounded(patch),patch].find(part=>{const candidate=[...points.slice(0,start),...part,...points.slice(end+1)],score=scoreRoute(candidate,tracks,solids,wire);return score[0]<=before[0]+eps&&score[1]<before[1]-eps&&self.every(t=>crossingsBetween(part,t)<eps);});
    if(!part)break;points=[...points.slice(0,start),...part,...points.slice(end+1)];
  }
  return points;
}
function movementCircuit(state,id,before,session) {
  const cached=session.circuit;if(cached?.state===state&&cached.before===before&&cached.id===id&&cached.mode===state.viewMode)return cached.scope;
  // Connectivity is structural: all posts of a part belong to its circuit,
  // including an open switch or a meter. Proximity never joins two circuits.
  const adjacent=new Map();for(const wire of state.wires){const a=wire.a.split(':')[0],b=wire.b.split(':')[0];if(!adjacent.has(a))adjacent.set(a,[]);if(!adjacent.has(b))adjacent.set(b,[]);adjacent.get(a).push(b);adjacent.get(b).push(a);}
  const members=new Set([id]),queue=[id];for(const item of queue)for(const next of adjacent.get(item)??[])if(!members.has(next)){members.add(next);queue.push(next);}
  const wires=state.wires.filter(w=>members.has(w.a.split(':')[0])),scope=wires.length?{...state,components:state.components.filter(c=>members.has(c.id)),junctions:state.junctions.filter(n=>members.has(n.id)),wires}:null;
  // The gesture's snapshot fixes its topology; reuse membership on each frame.
  session.circuit={state,before,id,mode:state.viewMode,scope};return scope;
}
/** Relax only the moving item's circuit; unrelated circuits retain their traces. */
export function moveItem(state,id,pose,before,{preview=false,finalize=false,session={}}={}) {
  const item=state.components.find(c=>c.id===id)??state.junctions.find(n=>n.id===id);if(!item)return;
  Object.assign(item,pose);state=movementCircuit(state,id,before,session);if(!state)return;
  const attached=new Set(),physical=state.viewMode==='physical',boxes=boxesFor(state,state.viewMode),originalItem=before.components.find(c=>c.id===id)??before.junctions.find(n=>n.id===id),strength=originalItem?Math.min(1,(distance(item,originalItem)+(item.angle!==originalItem.angle?80:0))/24):1;session.faces??=new Map();
  for(const wire of state.wires){const incident=wire.a.split(':')[0]===id||wire.b.split(':')[0]===id,old=before.wires.find(w=>w.id===wire.id);if(!old)continue;
    if(!physical){if(incident){attached.add(wire.id);delete wire.via;}continue;}
    let points=wirePoints(wire,k=>pointIn(state,k,'physical'),'physical');if(finalize){if(incident||!routeIsClear(points,state,wire,'physical'))attached.add(wire.id);continue;}
    const original=wirePoints(old,k=>pointIn(before,k,'physical'),'physical');points=incident?deformCable(original,pointIn(state,wire.a,'physical'),pointIn(state,wire.b,'physical')):original;
    if(incident){attached.add(wire.id);if(!routeIsClear(points,state,wire,'physical'))points=terminalTangents(points,state,wire,strength);}
    if(!routeIsClear(points,state,wire,'physical')){attached.add(wire.id);points=projectCable(points,boxes,wire,session.faces);}
    wire.physicalVia=points.slice(1,-1);
  }
  if(physical){
    const solids=boxesFor(state,'physical',2),nets=circuitNets(state),routes=state.wires.map(wire=>({wire,points:wirePoints(wire,k=>pointIn(state,k,'physical'),'physical')}));
    for(const route of routes)if(bodyCost(route.points,solids,route.wire)>eps){route.points=repairPhysicalSpan(state,route,routes,nets,boxes,solids);route.wire.physicalVia=route.points.slice(1,-1);}
    if(preview||circuitScore(routes,nets,'physical',solids).every(n=>n<eps))return;
  }
  if(preview)return;
  routeCircuit(state,state.viewMode,{ids:physical?null:attached,optimize:physical});
}
