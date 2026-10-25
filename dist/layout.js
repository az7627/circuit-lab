import {componentTerminal,componentHitBounds,labelOffset} from './visuals.js?v=2.6';
import {physicalBounds,physicalObstacleBoxes,physicalLabelOffset} from './physical.js?v=2.6';
import {wirePoints,simplifyTrace} from './wiring.js?v=2.6';
import {circuitNets,layoutSchematic} from './topology.js?v=2.6';
import {arrangeBench} from './bench.js';
import {electricalSignature,directPhysicalConnections} from './connections.js';
import {pruneLayoutCaches} from './data.js?v=2.6';

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
  if(c.type==='rheostat')d=index===1?{x:0,y:-1}:{x:index===0?-1:1,y:0};
  if(mode==='physical'&&c.physicalFlip)d.x=-d.x;
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
  // A schematic lead may branch vertically from a horizontal terminal (or
  // horizontally from a vertical one). The outward half-plane stays outside
  // the symbol even though its rectangular hit target includes empty corners.
  if(box.mode==='schematic')return along>=-eps;
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
  let cost=0;for(let i=1;i<track.points.length;i++){const hit=intersection(a,b,track.points[i-1],track.points[i]);if(hit&&!track.shared?.some(p=>distance(p,hit)<(track.sharedRadius??40)))cost+=hit.overlap?hit.overlap/24+1:hit.weight;}return cost;
}
function crossingsBetween(points,track) {
  const hits=new Set();let overlap=0;for(let i=1;i<points.length;i++)for(let j=1;j<track.points.length;j++){const hit=intersection(points[i-1],points[i],track.points[j-1],track.points[j]);if(!hit||track.shared?.some(p=>distance(p,hit)<(track.sharedRadius??40)))continue;if(hit.overlap)overlap+=hit.overlap;else hits.add(`${Math.round(hit.x*100)}:${Math.round(hit.y*100)}`);}
  return hits.size+overlap/24;
}
function peers(wire,routes,nets,mode,sharedRadius=40) {
  const net=nets.find(wire.a),own=[wire.a,wire.b];
  return routes.filter(r=>r.wire.id!==wire.id&&(mode==='physical'||nets.find(r.wire.a)!==net)).map(r=>({points:r.points,sharedRadius,shared:own.filter(k=>r.wire.a===k||r.wire.b===k).map(k=>r.points[r.wire.a===k?0:r.points.length-1])}));
}
export function countWireCrossings(state,mode=state.viewMode,{sharedRadius=40}={}) {
  const nets=circuitNets(state),routes=state.wires.map(wire=>({wire,points:wirePoints(wire,k=>pointIn(state,k,mode),mode)}));let total=0;
  for(let i=0;i<routes.length;i++)for(const track of peers(routes[i].wire,routes.slice(i+1),nets,mode,sharedRadius))total+=crossingsBetween(routes[i].points,track);
  return total;
}
class Heap {
  values=[];
  push(value){const a=this.values;a.push(value);let i=a.length-1;while(i){const p=(i-1)>>1;if(compare(a[p].rank,value.rank)<=0)break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&compare(a[child+1].rank,a[child].rank)<0)child++;if(compare(a[child].rank,last.rank)>=0)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
function sparse(points,max=12) {if(points.length<=max)return points;const out=[];for(let i=0;i<max;i++)out.push(points[Math.round(i*(points.length-1)/(max-1))]);return out;}

/** Lexicographic A*: crossings, then component penetration, then shape and length. */
export function routeOrthogonal(start,end,boxes=[],tracks=[],{startDirection=null,endDirection=null,hint=[],allowBodyCrossings=false,ports=[],bendCost=24,localMargin=null}={}) {
  tracks=trackList(tracks);const xs=[start.x,end.x],ys=[start.y,end.y],margin=localMargin??180;
  const region={x:Math.min(start.x,end.x,...hint.map(p=>p.x))-margin,y:Math.min(start.y,end.y,...hint.map(p=>p.y))-margin};region.width=Math.max(start.x,end.x,...hint.map(p=>p.x))-region.x+margin;region.height=Math.max(start.y,end.y,...hint.map(p=>p.y))-region.y+margin;
  // A long existing lead must be bypassable at its ends, even beyond the local window.
  if(localMargin===null)for(const track of tracks){const tx=Math.min(...track.points.map(p=>p.x)),ty=Math.min(...track.points.map(p=>p.y)),right=Math.max(...track.points.map(p=>p.x)),bottom=Math.max(...track.points.map(p=>p.y));if(!overlap(inflate({x:tx,y:ty,width:right-tx,height:bottom-ty},1),region))continue;const x=Math.min(region.x,tx-28),y=Math.min(region.y,ty-28);region.width=Math.max(region.x+region.width,right+28)-x;region.height=Math.max(region.y+region.height,bottom+28)-y;region.x=x;region.y=y;}
  else tracks=tracks.flatMap(track=>{const chunks=[];let chunk=null;for(let i=1;i<track.points.length;i++){if(!clipSegment(track.points[i-1],track.points[i],inflate(region,1))){chunk=null;continue;}if(!chunk){chunk={points:[track.points[i-1]],shared:track.shared};chunks.push(chunk);}chunk.points.push(track.points[i]);}return chunks;});
  const nearby=boxes.filter(b=>overlap(b,region));for(const b of nearby){xs.push(b.x-2,b.x+b.width+2);ys.push(b.y-2,b.y+b.height+2);}
  for(const p of sparse(hint,16)){xs.push(p.x);ys.push(p.y);}
  for(const track of tracks)for(const p of sparse(simplifyTrace(track.points,3),8))if(p.x>=region.x&&p.x<=region.x+region.width&&p.y>=region.y&&p.y<=region.y+region.height){xs.push(p.x-14,p.x+14);ys.push(p.y-14,p.y+14);}
  xs.push(region.x,region.x+region.width);ys.push(region.y,region.y+region.height);
  if(localMargin!==null){for(let i=xs.length-1;i>=0;i--)if(xs[i]<region.x||xs[i]>region.x+region.width)xs.splice(i,1);for(let i=ys.length-1;i>=0;i--)if(ys[i]<region.y||ys[i]>region.y+region.height)ys.splice(i,1);}
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

const schematicPlans=new WeakMap();
const uniqueCoordinates=values=>[...new Set(values.map(v=>Math.round(v*1000)/1000))].slice(0,40);
function teachingLabels(state){return state.components.map(c=>{const label=physicalLabelOffset(c);return {x:c.x+label.x-48,y:c.y+label.y-19,width:96,height:27,id:`label-${c.id}`};});}

/** All leads belonging to a node share one straight bus. The bus is chosen
 * once for the entire node, independently of the order in which pairs of
 * terminals were clicked. A terminal only gets a local hook when it faces
 * away from its bus or a component blocks its exit. */
function netRailPlans(state,mode,selected=null){
  const nets=circuitNets(state),boxes=[...boxesFor(state,mode),...(mode==='physical'?teachingLabels(state):[])],groups=new Map();
  const bendCost=mode==='schematic'?220:36;
  const fixed=[];
  for(const wire of [...state.wires].sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}))){const net=nets.find(wire.a);if(selected&&!selected.has(net)){fixed.push({wire,points:wirePoints(wire,k=>pointIn(state,k,mode),mode)});continue;}if(!groups.has(net))groups.set(net,[]);groups.get(net).push(wire);}
  const plans=[];
  for(const [net,wires] of [...groups].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}))){
    const ports=[...new Set(wires.flatMap(w=>[w.a,w.b]))].sort().map(key=>{
      const p=pointIn(state,key,mode),d=direction(state,key,mode),c=state.components.find(c=>c.id===key.split(':')[0]);
      const departures=[{d,stub:d?{x:p.x+d.x*24,y:p.y+d.y*24}:copy(p)}];
      if(mode==='physical'&&['ammeter','voltmeter'].includes(c?.type)&&!key.endsWith(':2')){const side=key.endsWith(':1')?-1:1,r=c.angle*Math.PI/180,normal={x:side*Math.cos(r),y:side*Math.sin(r)};departures.push({d:normal,stub:{x:p.x+normal.x*24,y:p.y+normal.y*24}});}
      return {key,p,d,departures,box:c?(mode==='physical'?physicalBounds(c):componentHitBounds(c)):null,stub:departures[0].stub};
    });
    const mean=axis=>Math.round(ports.reduce((sum,port)=>sum+port.p[axis],0)/ports.length/10)*10;
    const xs=ports.map(port=>port.p.x),ys=ports.map(port=>port.p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const nearby=boxes.filter(b=>overlap(b,{x:left-60,y:top-60,width:right-left+120,height:bottom-top+120}));
    const coordinates={x:uniqueCoordinates([mean('x'),...xs,...ports.map(p=>p.stub.x),left-24,right+24,...nearby.flatMap(b=>[b.x-16,b.x+b.width+16])]),y:uniqueCoordinates([mean('y'),...ys,...ports.map(p=>p.stub.y),top-24,bottom+24,...nearby.flatMap(b=>[b.y-16,b.y+b.height+16])])};
    const candidates=[];
    for(const axis of ['x','y'])for(const value of coordinates[axis]){
      const other=axis==='x'?'y':'x',connectors=new Map();
      for(const port of ports){
        const {p,box,key}=port,paths=[];
        for(const {stub,d} of port.departures){
          const add=via=>{const path=simplifyTrace([p,stub,...via],.001);if(d&&path.length>1&&(path[1].x-p.x)*d.x+(path[1].y-p.y)*d.y< -eps)return;const cost=bodyCost(path,boxes,{a:key,b:'bus:0'});paths.push({points:path,anchor:path.at(-1),rank:[cost,lengthOf(path)+Math.max(0,path.length-2)*bendCost]});};
          if(!d||Math.abs(d[axis])<eps||(value-stub[axis])*d[axis]>=-eps)add([{...stub,[axis]:value}]);
          if(box){
            const low=other==='y'?box.y-24:box.x-24,high=other==='y'?box.y+box.height+24:box.x+box.width+24;
            for(const lane of [low,high])add([{...stub,[other]:lane},{[axis]:value,[other]:lane}]);
          }
        }
        paths.sort((a,b)=>compare(a.rank,b.rank));if(paths[0])connectors.set(key,paths[0]);
      }
      if(connectors.size!==ports.length)continue;
      const routes=wires.map(wire=>{
        const a=connectors.get(wire.a),b=connectors.get(wire.b),points=simplifyTrace([...a.points,b.anchor,...b.points.slice(0,-1).reverse()],.001);
        return {wire,points};
      });
      const anchors=[...connectors.values()].map(c=>c.anchor[other]),span=Math.max(...anchors)-Math.min(...anchors);
      const bodies=routes.reduce((sum,r)=>sum+bodyCost(r.points,boxes,r.wire),0),style=span+[...connectors.values()].reduce((sum,c)=>sum+lengthOf(c.points)+Math.max(0,c.points.length-2)*bendCost,0);
      candidates.push({net,routes,rank:[bodies,style],axis,value,connectors});
    }
    candidates.sort((a,b)=>compare(a.rank,b.rank));if(candidates.length)plans.push({net,candidates,selected:candidates[0]});
  }
  // Choose buses as whole nodes. Do not repair individual leads by sending them
  // onto unrelated private lanes after a good common bus has been found.
  for(let pass=0;pass<2;pass++)for(const plan of plans){
    const others=[...fixed,...plans.filter(p=>p!==plan).flatMap(p=>p.selected.routes)];let best=null,rank=null;
    for(const candidate of plan.candidates){
      let crossings=0;for(const route of candidate.routes)for(const other of others)crossings+=crossingsBetween(route.points,{points:other.points,shared:[]});
      const next=[candidate.rank[0],candidate.rank[1]+crossings*(mode==='physical'?500:180)];if(!rank||compare(next,rank)<0){best=candidate;rank=next;}
    }
    plan.selected=best;
  }
  return plans.flatMap(plan=>plan.selected.routes.map((route,index)=>({...route,axis:plan.selected.axis,rail:plan.selected.value,connectors:plan.selected.connectors,lane:(index-(plan.selected.routes.length-1)/2)*10})));
}

function schematicLabels(state){return state.components.map(c=>{const label=labelOffset(c);return {x:c.x+label.x-44,y:c.y+label.y-17,width:88,height:40,id:`label-${c.id}`};});}

// Count shared ink once, even when several wires use the same bus. New leads
// can tap an existing line without moving that line or creating helper nodes.
function sharedLength(points,tracks){
  let total=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],horizontal=Math.abs(a.y-b.y)<eps,axis=horizontal?'x':'y',other=horizontal?'y':'x',low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]),ranges=[];
    for(const track of tracks)for(let j=1;j<track.points.length;j++){const c=track.points[j-1],d=track.points[j];if(Math.abs(c[other]-a[other])>eps||Math.abs(d[other]-a[other])>eps)continue;const start=Math.max(low,Math.min(c[axis],d[axis])),end=Math.min(high,Math.max(c[axis],d[axis]));if(end>start+eps)ranges.push([start,end]);}
    ranges.sort((a,b)=>a[0]-b[0]);let end=-Infinity;for(const range of ranges){total+=Math.max(0,range[1]-Math.max(end,range[0]));end=Math.max(end,range[1]);}
  }
  return total;
}

function routeSchematicLead(state,wire){
  const a=pointIn(state,wire.a,'schematic'),b=pointIn(state,wire.b,'schematic'),nets=circuitNets(state),net=nets.find(wire.a),boxes=[...boxesFor(state,'schematic',32),...schematicLabels(state)];
  const others=state.wires.filter(w=>w.id!==wire.id&&w.via!==undefined).map(w=>({wire:w,points:wirePoints(w,k=>pointIn(state,k,'schematic'))})),tracks=peers(wire,others,nets,'schematic'),shared=others.filter(r=>nets.find(r.wire.a)===net);
  const da=direction(state,wire.a,'schematic'),db=direction(state,wire.b,'schematic'),start=da?{x:a.x+da.x*24,y:a.y+da.y*24}:a,end=db?{x:b.x+db.x*24,y:b.y+db.y*24}:b;
  let best=null,quality=null;
  const accept=path=>{
    const points=simplifyTrace(path,.001);if(points.length<2||!routeIsClear(points,state,wire,'schematic'))return;
    const score=[bodyCost(points,boxes,wire),tracks.reduce((sum,t)=>sum+crossingsBetween(points,t),0),lengthOf(points)-sharedLength(points,shared)*.85+Math.max(0,points.length-2)*60];
    if(!quality||compare(score,quality)<0){best=points;quality=score;}
  };
  const low={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y)},high={x:Math.max(a.x,b.x),y:Math.max(a.y,b.y)},nearby=boxes.filter(box=>overlap(box,inflate({x:low.x,y:low.y,width:high.x-low.x,height:high.y-low.y},80)));
  const xs=uniqueCoordinates([a.x,b.x,start.x,end.x,low.x-80,high.x+80,...nearby.flatMap(box=>[box.x-2,box.x+box.width+2])]),ys=uniqueCoordinates([a.y,b.y,start.y,end.y,low.y-80,high.y+80,...nearby.flatMap(box=>[box.y-2,box.y+box.height+2])]);
  accept([a,b]);accept([a,{x:a.x,y:b.y},b]);accept([a,{x:b.x,y:a.y},b]);
  for(const y of ys){accept([a,{x:a.x,y},{x:b.x,y},b]);accept([a,start,{x:start.x,y},{x:end.x,y},end,b]);}
  for(const x of xs){accept([a,{x,y:a.y},{x,y:b.y},b]);accept([a,start,{x,y:start.y},{x,y:end.y},end,b]);}
  if(!quality||quality[0]>eps||quality[1]>eps){
    const ports=[{owner:wire.a.split(':')[0],origin:a,d:da},{owner:wire.b.split(':')[0],origin:b,d:db}],path=routeOrthogonal(a,b,boxes,tracks,{ports,bendCost:60});if(path)accept(path);
  }
  if(best)wire.via=best.slice(1,-1);
}

function rememberSchematic(state,signature,automatic){
  const ids=new Set(state.wires.map(w=>w.id));
  schematicPlans.set(state,{signature,automatic:new Set([...automatic].filter(id=>ids.has(id))),state:{viewMode:'schematic',components:state.components.map(c=>({...c})),junctions:state.junctions.map(n=>({...n})),wires:state.wires.map(w=>({id:w.id,a:w.a,b:w.b,...(w.via!==undefined?{via:w.via.map(copy)}:{})}))}});
  state.schematicRoutingVersion=3;
}

function editSchematic(state,options,memo,signature){
  const previous=memo?.state,automatic=new Set(memo?.automatic??[]),old=new Map(previous?.wires.map(w=>[w.id,w])??[]);
  const dirty=state.wires.filter(w=>options.ids?options.ids.has(w.id):w.via===undefined||!memo&&!routeIsClear(wirePoints(w,k=>pointIn(state,k,'schematic')),state,w,'schematic'));
  const selected=new Set(),locked=new Set();
  if(previous){
    const before=circuitNets(previous),after=circuitNets(state),wired=new Set(previous.wires.flatMap(w=>[before.find(w.a),before.find(w.b)])),parts=new Map(state.components.map(c=>[c.id,c]));
    for(const wire of dirty){
      const a=before.find(wire.a),b=before.find(wire.b),prior=previous.wires.filter(w=>[a,b].includes(before.find(w.a))),endpoints=[wire.a,wire.b].map(key=>parts.get(key.split(':')[0]));
      const anchored=old.has(wire.id)||endpoints.some(c=>!c),measurement=endpoints.some(c=>['ammeter','voltmeter'].includes(c?.type))&&(wired.has(a)||wired.has(b));
      if(anchored||measurement||wired.has(a)&&wired.has(b)){prior.forEach(w=>locked.add(w.id));locked.add(wire.id);continue;}
      if(!prior.length||prior.some(w=>!automatic.has(w.id)||[w.a,w.b].some(key=>!parts.has(key.split(':')[0]))))continue;
      selected.add(after.find(wire.a));
    }
    for(const wire of state.wires)if(locked.has(wire.id))selected.delete(after.find(wire.a));
  }
  // Only extend an unfinished automatically drawn bus. A new bridge between
  // established nodes, a measurement probe or a manual node keeps all old paths.
  const replanned=new Set();
  if(selected.size)for(const {wire,points} of netRailPlans(state,'schematic',selected)){if(routeIsClear(points,state,wire,'schematic')){wire.via=points.slice(1,-1);automatic.add(wire.id);replanned.add(wire.id);}}
  for(const wire of dirty){if(replanned.has(wire.id)&&!options.ids)continue;routeSchematicLead(state,wire);automatic.add(wire.id);}
  for(const id of locked)automatic.delete(id);
  rememberSchematic(state,signature,automatic);
}

export function routeCircuit(state,mode=state.viewMode,options={}){
  if(mode!=='schematic')return routeIndividualCircuit(state,mode,options);
  const signature=JSON.stringify([state.components.map(c=>[c.id,c.type,c.x,c.y,c.angle,c.closed,c.position]),state.junctions.map(n=>[n.id,n.x,n.y]),state.wires.map(w=>[w.id,w.a,w.b])]);
  const memo=schematicPlans.get(state);
  if(!options.force&&!options.optimize&&memo?.signature===signature&&!options.ids&&state.wires.every(w=>w.via!==undefined))return;
  if(!options.force&&!options.optimize&&(memo||options.preserveSchematic||options.ids))return editSchematic(state,options,memo,signature);
  for(const {wire,points} of netRailPlans(state,mode))wire.via=points.slice(1,-1);
  const blocked=new Set(state.wires.filter(w=>!routeIsClear(wirePoints(w,k=>pointIn(state,k),mode),state,w,mode)).map(w=>w.id));
  if(blocked.size)routeIndividualCircuit(state,mode,{ids:blocked});
  if(countWireCrossings(state,mode)>eps)routeIndividualCircuit(state,mode,{optimize:true});
  rememberSchematic(state,signature,new Set(state.wires.map(w=>w.id)));
}

/** Every route sees every peer, followed by bounded rip-up / reroute passes. */
function routeIndividualCircuit(state,mode=state.viewMode,{force=false,ids=null,preservePhysical=false,optimize=false}={}) {
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
  for(const route of routes)if(active.has(route.wire.id)){
    if(!routeIsClear(route.points,state,route.wire,mode)){const clear=plannedRoute(state,route.wire,mode,boxes,[]);if(clear&&routeIsClear(clear,state,route.wire,mode))route.points=clear;}
    route.wire[key]=route.points.slice(1,-1);
  }
}
function saveLayout(state,view,automatic=state.layouts?.[state.viewMode]?.automatic??false){const poses={};for(const item of [...state.components,...state.junctions])poses[item.id]={x:item.x,y:item.y,...('angle' in item?{angle:item.angle}:{}),...(item.physicalFlip!==undefined?{physicalFlip:item.physicalFlip}:{})};return {version:5,automatic,signature:electricalSignature(state),poses,wires:structuredClone(state.wires),junctions:structuredClone(state.junctions),...(view?{view:{...view}}:{})};}

// A small set of cable lanes gives predictable work per connection. Crossing
// penalties are finite: avoiding a crossing must not produce a canvas-size loop.
export function routePhysicalConnections(state,{ids=null,labels=false}={}) {
  const boxes=[...boxesFor(state,'physical',5),...(labels?teachingLabels(state):[])],routes=ids?state.wires.filter(w=>!ids.has(w.id)).map(wire=>({wire,points:wirePoints(wire,k=>pointIn(state,k,'physical'),'physical')})):[];
  for(const wire of [...state.wires].filter(w=>!ids||ids.has(w.id)).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}))){
    const a=pointIn(state,wire.a,'physical'),b=pointIn(state,wire.b,'physical'),da=direction(state,wire.a,'physical')??{x:0,y:0},db=direction(state,wire.b,'physical')??{x:0,y:0};
    const start={x:a.x+da.x*24,y:a.y+da.y*24},end={x:b.x+db.x*24,y:b.y+db.y*24},candidates=[];
    const add=via=>candidates.push(simplifyTrace([a,start,...via,end,b],.01));
    add([]);add([{x:start.x,y:end.y}]);add([{x:end.x,y:start.y}]);
    const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
    const nearby=boxes.filter(box=>overlap(inflate({x:left,y:top,width:right-left,height:bottom-top},80),box));
    const xs=[(start.x+end.x)/2,left-32,right+32,...nearby.flatMap(box=>[box.x-10,box.x+box.width+10])];
    const ys=[(start.y+end.y)/2,top-38,bottom+38,...nearby.flatMap(box=>[box.y-10,box.y+box.height+10])];
    for(const x of new Set(xs))add([{x,y:start.y},{x,y:end.y}]);
    for(const y of new Set(ys))add([{x:start.x,y},{x:end.x,y}]);
    const tracks=routes.map(r=>({points:r.points,shared:[wire.a,wire.b].filter(k=>r.wire.a===k||r.wire.b===k).map(k=>pointIn(state,k,'physical'))}));
    let best=null,rank=null;
    for(const path of candidates){const cost=bodyCost(path,boxes,wire),crossings=tracks.reduce((n,t)=>n+crossingsBetween(path,t),0),score=[cost,lengthOf(path)+crossings*100+Math.max(0,path.length-2)*20];if(!rank||compare(score,rank)<0){best=path;rank=score;}}
    if(rank[0]>eps){const fallback=routeOrthogonal(a,b,boxes,[],{startDirection:da,endDirection:db,localMargin:100,ports:[{owner:wire.a.split(':')[0],origin:a,d:da},{owner:wire.b.split(':')[0],origin:b,d:db}]});if(fallback&&bodyCost(fallback,boxes,wire)<rank[0])best=fallback;}
    const curve=rounded(best,16);if(bodyCost(curve,boxes,wire)<=bodyCost(best,boxes,wire)+eps)best=curve;
    wire.physicalVia=best.slice(1,-1);routes.push({wire,points:best});
  }
}
function cableVisibility(state){
  const boxes=[...boxesFor(state,'physical',3),...teachingLabels(state).map(b=>inflate(b,3))],points=[],seen=new Set();
  for(const box of boxes)for(const x of [box.x-3,box.x+box.width+3])for(const y of [box.y-3,box.y+box.height+3]){
    const p={x,y},key=`${Math.round(x*100)}:${Math.round(y*100)}`;if(seen.has(key)||boxes.some(b=>inside(p,b)))continue;seen.add(key);points.push(p);
  }
  const vertices=sparse(points,150),edges=vertices.map(()=>[]);
  const clear=(a,b)=>!boxes.some(box=>clippedLength(a,b,box)>eps);
  for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++)if(clear(vertices[i],vertices[j])){const length=distance(vertices[i],vertices[j]);edges[i].push({to:j,length});edges[j].push({to:i,length});}
  return {boxes,vertices,edges,clear};
}
function cubicCable(a,b,u,v,reach,bow=0){
  const length=distance(a,b)||1,n={x:-(b.y-a.y)/length,y:(b.x-a.x)/length};
  const one={x:a.x+u.x*reach+n.x*bow,y:a.y+u.y*reach+n.y*bow},two={x:b.x+v.x*reach+n.x*bow,y:b.y+v.y*reach+n.y*bow};
  return Array.from({length:25},(_,i)=>{const t=i/24,s=1-t;return {x:s*s*s*a.x+3*s*s*t*one.x+3*s*t*t*two.x+t*t*t*b.x,y:s*s*s*a.y+3*s*s*t*one.y+3*s*t*t*two.y+t*t*t*b.y};});
}
function cableDirections(state,key,boxes){
  const p=pointIn(state,key,'physical'),d=direction(state,key,'physical'),c=state.components.find(c=>c.id===key.split(':')[0]);
  if(!d)return [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
  const vectors=[0,Math.PI/6,-Math.PI/6,Math.PI/3,-Math.PI/3].map(angle=>({x:d.x*Math.cos(angle)-d.y*Math.sin(angle),y:d.x*Math.sin(angle)+d.y*Math.cos(angle)}));
  if(['ammeter','voltmeter'].includes(c?.type)&&!key.endsWith(':2')){const r=c.angle*Math.PI/180,side=key.endsWith(':1')?-1:1;vectors.unshift({x:side*Math.cos(r),y:side*Math.sin(r)});}
  return vectors.filter(v=>bodyCost([p,{x:p.x+v.x*36,y:p.y+v.y*36}],boxes,{a:key,b:'escape:0'})<eps);
}
function shortestCable(state,wire,graph,tracks){
  const a=pointIn(state,wire.a,'physical'),b=pointIn(state,wire.b,'physical'),vertices=[...graph.vertices,a,b],start=vertices.length-2,end=vertices.length-1,edges=[...graph.edges.map(e=>[...e]),[],[]];
  for(const [index,key,reverse] of [[start,wire.a,false],[end,wire.b,true]])for(let j=0;j<start;j++){
    const path=reverse?[vertices[j],vertices[index]]:[vertices[index],vertices[j]];
    if(bodyCost(path,graph.boxes,wire)>eps)continue;const length=distance(vertices[index],vertices[j]);edges[index].push({to:j,length});edges[j].push({to:index,length});
  }
  if(bodyCost([a,b],graph.boxes,wire)<eps){const length=distance(a,b);edges[start].push({to:end,length});edges[end].push({to:start,length});}
  const costs=new Map(),best=Array.from({length:2},()=>new Float64Array(vertices.length).fill(Infinity)),previous=new Int32Array(vertices.length).fill(-1),heap=new Heap();best[0][start]=best[1][start]=0;heap.push({id:start,rank:[0,distance(a,b)]});
  while(heap.values.length){const {id}=heap.pop();if(id===end)break;
    for(const edge of edges[id]){const key=id<edge.to?`${id}:${edge.to}`:`${edge.to}:${id}`;if(!costs.has(key))costs.set(key,[tracks.reduce((sum,t)=>sum+crosses(vertices[id],vertices[edge.to],t),0),edge.length]);
      const cost=costs.get(key),score=[best[0][id]+cost[0],best[1][id]+cost[1]];if(compare(score,best.map(layer=>layer[edge.to]))>=0)continue;score.forEach((value,i)=>best[i][edge.to]=value);previous[edge.to]=id;heap.push({id:edge.to,rank:[score[0],score[1]+distance(vertices[edge.to],b)]});
    }
  }
  if(!Number.isFinite(best[0][end]))return null;
  const points=[];for(let id=end;id>=0;id=previous[id])points.push(vertices[id]);return simplifyTrace(points.reverse(),.01);
}
function naturalCable(state,wire,routes,nets,graph,solids){
  const a=pointIn(state,wire.a,'physical'),b=pointIn(state,wire.b,'physical'),chord=distance(a,b),tracks=peers(wire,routes,nets,'physical',8).map(t=>({...t,points:simplifyTrace(t.points,1.5)}));
  const clear=points=>bodyCost(points,solids,wire)<eps,rank=points=>[tracks.reduce((sum,t)=>sum+crossingsBetween(points,t),0),lengthOf(points)];
  let best=null,quality=null;
  const accept=points=>{if(!points||!clear(points))return;const score=rank(points);if(!quality||compare(score,quality)<0){best=points;quality=score;}};
  const starts=cableDirections(state,wire.a,solids),ends=cableDirections(state,wire.b,solids);
  for(const u of starts)for(const v of ends)for(const ratio of [.24,.4,.65])for(const bow of [1,-1,0])accept(cubicCable(a,b,u,v,Math.min(210,Math.max(24,chord*ratio)),Math.min(70,chord*.16)*bow));
  if(best&&quality[0]<eps&&quality[1]<chord*1.3+40)return best;
  const path=shortestCable(state,wire,graph,tracks);
  if(path){
    if(path.length===2){const u=starts[0]??{x:(b.x-a.x)/(chord||1),y:(b.y-a.y)/(chord||1)},v=ends[0]??{x:-u.x,y:-u.y};accept(cubicCable(a,b,u,v,Math.min(70,chord*.25),12));}
    for(const radius of [64,44,28,16,8])accept(rounded(path,radius));
    accept(path);
  }
  return best;
}
function routeTeachingPhysical(state){
  const graph=cableVisibility(state),solids=[...boxesFor(state,'physical',2),...teachingLabels(state).map(b=>inflate(b,2))],nets=circuitNets(state),routes=[],blocked=new Set();
  const priority=w=>Number([w.a,w.b].some(k=>state.components.find(c=>c.id===k.split(':')[0])?.type==='battery'));
  const ordered=[...state.wires].sort((a,b)=>priority(b)-priority(a)||distance(pointIn(state,a.a,'physical'),pointIn(state,a.b,'physical'))-distance(pointIn(state,b.a,'physical'),pointIn(state,b.b,'physical'))||a.id.localeCompare(b.id,undefined,{numeric:true}));
  for(const wire of ordered){const points=naturalCable(state,wire,routes,nets,graph,solids);if(points){wire.physicalVia=points.slice(1,-1);routes.push({wire,points});}else blocked.add(wire.id);}
  // A later lead may block an earlier one. Revisit only crossings, with the
  // other complete cables as evidence, never reroute the whole bench globally.
  for(let pass=0;pass<2;pass++)for(const route of [...routes].reverse()){
    const tracks=peers(route.wire,routes,nets,'physical',8),before=tracks.reduce((sum,t)=>sum+crossingsBetween(route.points,t),0);if(before<eps)continue;
    const candidate=naturalCable(state,route.wire,routes,nets,graph,solids);if(candidate&&tracks.reduce((sum,t)=>sum+crossingsBetween(candidate,t),0)<before-eps){route.points=candidate;route.wire.physicalVia=candidate.slice(1,-1);}
  }
  // Add cable slack only after every electrical connection has a route. Doing
  // this greedily while adding branches can trap the next lead in a long loop.
  for(const route of [...routes].sort((a,b)=>lengthOf(b.points)-lengthOf(a.points))){
    const {wire}=route,a=pointIn(state,wire.a,'physical'),b=pointIn(state,wire.b,'physical'),starts=cableDirections(state,wire.a,solids),ends=cableDirections(state,wire.b,solids),tracks=peers(wire,routes,nets,'physical',8);
    if(!starts.length||!ends.length)continue;
    const curve=cubicCable(a,b,starts[0],ends[0],Math.min(200,Math.max(40,distance(a,b)*.45))),before=tracks.reduce((sum,t)=>sum+crossingsBetween(route.points,t),0);
    if(bodyCost(curve,solids,wire)<eps&&tracks.reduce((sum,t)=>sum+crossingsBetween(curve,t),0)<=before+eps&&lengthOf(curve)<distance(a,b)*1.45+60){route.points=curve;wire.physicalVia=curve.slice(1,-1);}
  }
  if(blocked.size)routePhysicalConnections(state,{ids:blocked,labels:true});
}
function connectBench(state){
  const original={wires:structuredClone(state.wires),junctions:structuredClone(state.junctions),nextId:state.nextId};
  let best=null,quality=null;
  // The same split/join can use any post on its electrical node. Try at most
  // three equivalent hubs and a short post chain; never change a component's
  // terminals or meter range. Crossings are a separate, higher priority cost.
  for(const preference of [{},{preferLoad:true},{preferSupply:true},{preferChain:true}]){
    Object.assign(state,structuredClone(original));directPhysicalConnections(state,preference);routeTeachingPhysical(state);
    let detour=0,blocked=0,length=0;
    for(const wire of state.wires){const points=wirePoints(wire,key=>pointIn(state,key,'physical'),'physical'),total=lengthOf(points);length+=total;detour+=Math.max(0,total-distance(points[0],points.at(-1))*1.6-80);blocked+=Number(!routeIsClear(points,state,wire,'physical'));}
    const score=[blocked,countWireCrossings(state,'physical',{sharedRadius:8}),detour,length];
    if(!quality||compare(score,quality)<0){quality=score;best={wires:state.wires,junctions:state.junctions,nextId:state.nextId};}
    if(score[0]===0&&score[1]<eps&&score[2]<eps)break;
  }
  Object.assign(state,best);
  return quality[0]===0&&quality[1]<eps;
}
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
  const recovery=mode==='physical'?structuredClone(state):null;
  pruneLayoutCaches(state);
  const rejectCrossings=()=>{for(const key of Object.keys(state))if(!Object.hasOwn(recovery,key))delete state[key];Object.assign(state,recovery);throw Object.assign(new Error('暂时无法生成无交叉的实物布局，原电路已保留。'),{name:'CircuitLayoutError'});};
  // v3 schematic poses remain useful: replace their private wire lanes with
  // shared buses. v3 physical caches came from grid placement and must be
  // regenerated from the circuit structure rather than certified as current.
  state.layouts??={};const activeMode=state.viewMode??'schematic',oldVersion=state.layouts[activeMode]?.version,legacy=state.layouts[activeMode]&&![3,4,5].includes(oldVersion);
  if(activeMode==='schematic'&&oldVersion===3)routeCircuit(state,'schematic',{force:true});
  state.layouts[activeMode]=saveLayout(state,view);if(legacy)state.layouts[activeMode].version=1;else if(activeMode==='physical'&&[3,4].includes(oldVersion))state.layouts[activeMode].version=oldVersion;const cached=state.layouts[mode],newIds=new Set(),signature=electricalSignature(state);
  const sameConnections=cached?.signature===signature&&(!cached.wires||!cached.junctions||electricalSignature({...state,wires:cached.wires,junctions:cached.junctions})===signature);
  const rebuild=mode==='schematic'&&(!cached||![3,4,5].includes(cached.version)||!sameConnections);
  const cachedPhysical=mode==='physical'&&sameConnections&&cached?.automatic!==false&&cached?.wires&&cached?.junctions?{...state,viewMode:'physical',wires:cached.wires,junctions:cached.junctions,components:state.components.map(c=>{const p=cached.poses[c.id],copy={...c,...p};if(p&&p.physicalFlip===undefined)delete copy.physicalFlip;return copy;})}:null;
  const physicalRebuild=mode==='physical'&&(!cached||cached.version!==5||(cachedPhysical&&countWireCrossings(cachedPhysical,'physical')>eps));
  const restore=(cached?.version===5||(mode==='schematic'&&[3,4].includes(cached?.version)))&&sameConnections&&!rebuild&&!physicalRebuild;
  if(restore&&cached.wires&&cached.junctions){state.wires=structuredClone(cached.wires);state.junctions=structuredClone(cached.junctions);}
  for(const item of [...state.components,...state.junctions]){const pose=cached?.poses?.[item.id];if(pose&&!rebuild){Object.assign(item,pose);if(pose.physicalFlip===undefined)delete item.physicalFlip;}else newIds.add(item.id);}
  state.viewMode=mode;
  if(rebuild){layoutSchematic(state);for(const wire of state.wires)delete wire.via;}
  else if(mode==='physical'&&!restore){
    if(physicalRebuild){
      const connections={wires:structuredClone(state.wires),junctions:structuredClone(state.junctions),nextId:state.nextId};let planned=false;
      for(const variant of [{},{reverseBranches:true},{spacing:1.35}]){Object.assign(state,structuredClone(connections));arrangeBench(state,variant);if(connectBench(state)){planned=true;break;}}
      if(!planned)rejectCrossings();
    }
    else{arrangePhysical(state,newIds);directPhysicalConnections(state);}
  }
  if(!restore&&!physicalRebuild)routeCircuit(state,mode,{force:rebuild,preservePhysical:mode==='physical'&&Boolean(cached)});
  if(mode==='physical'&&!restore&&!physicalRebuild&&countWireCrossings(state,'physical',{sharedRadius:8})>eps&&!connectBench(state))rejectCrossings();
  if(restore&&mode==='schematic'&&cached.version===3)routeCircuit(state,mode,{force:true});
  state.layouts[mode]=saveLayout(state,cached?.view,mode==='physical'&&physicalRebuild?true:cached?.automatic??false);
  return {newLayout:!cached||rebuild||physicalRebuild,view:rebuild||physicalRebuild?null:cached?.view??null};
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
function repairPhysicalSpan(state,route,routes,nets,boxes,solids,{crossings=false}={}) {
  const {wire}=route,tracks=peers(wire,routes,nets,'physical');let points=route.points;
  // Keep the unaffected curve on both sides of an obstruction. A dense mouse
  // trace is a shape reference, never a sequence of mandatory routing corners.
  for(let pass=0;pass<4;pass++){
    const blocked=new Set();bodyCost(points,solids,wire,blocked);if(crossings)for(let i=1;i<points.length;i++)if(tracks.some(t=>crosses(points[i-1],points[i],t)>eps))blocked.add(i);if(!blocked.size)break;
    const segments=[...blocked].sort((a,b)=>a-b);let last=segments[0];for(const i of segments.slice(1)){if(i>last+2)break;last=i;}
    let start=Math.max(0,segments[0]-2),end=Math.min(points.length-1,last+1);
    while(start>0&&boxes.some(b=>inside(points[start],inflate(b,8))))start--;
    while(end<points.length-1&&boxes.some(b=>inside(points[end],inflate(b,8))))end++;
    const a=points[start],b=points[end],hint=points.slice(start,end+1),ports=[];
    if(start===0)ports.push({owner:wire.a.split(':')[0],origin:a,d:direction(state,wire.a,'physical')});
    if(end===points.length-1)ports.push({owner:wire.b.split(':')[0],origin:b,d:direction(state,wire.b,'physical')});
    const self=[{points:points.slice(0,start+1),shared:[a]},{points:points.slice(end),shared:[b]}].filter(t=>t.points.length>1);
    const patch=routeOrthogonal(a,b,boxes,[...tracks,...self],{hint:sparse(simplifyTrace(hint,6),6),bendCost:90,localMargin:96,ports,startDirection:start===0?direction(state,wire.a,'physical'):null,endDirection:end===points.length-1?direction(state,wire.b,'physical'):null});
    if(!patch||patch.length>8||lengthOf(patch)>lengthOf(hint)*1.5+144||patch.some(p=>traceDistance(p,hint)>128))break;
    const before=scoreRoute(points,tracks,solids,wire),part=[rounded(patch,18),patch].find(part=>{const candidate=[...points.slice(0,start),...part,...points.slice(end+1)],score=scoreRoute(candidate,tracks,solids,wire),improves=crossings?score[0]<before[0]-eps&&score[1]<=before[1]+eps:score[0]<=before[0]+eps&&score[1]<before[1]-eps;return improves&&self.every(t=>crossingsBetween(part,t)<eps);});
    if(!part)break;points=[...points.slice(0,start),...part,...points.slice(end+1)];
  }
  return points;
}
function repairPhysicalCrossings(state,routes,nets,boxes,solids) {
  let quality=circuitScore(routes,nets,'physical',solids),attempts=0;
  for(let pass=0;pass<3&&quality[0]>eps;pass++){
    let best=null;
    for(const route of routes){if(attempts>=6)break;const tracks=peers(route.wire,routes,nets,'physical');if(tracks.every(t=>crossingsBetween(route.points,t)<eps))continue;attempts++;
      const old=route.points,candidate=repairPhysicalSpan(state,route,routes,nets,boxes,solids,{crossings:true});if(candidate===old)continue;
      route.points=candidate;const score=circuitScore(routes,nets,'physical',solids);route.points=old;
      const change=scoreRoute(candidate,[],solids,route.wire,old)[2]-lengthOf(old);if(score[0]<quality[0]-eps&&score[1]<=quality[1]+eps&&(!best||compare([...score,change],best.score)<0))best={route,points:candidate,score:[...score,change]};
    }
    if(!best)break;best.route.points=best.points;quality=best.score.slice(0,2);
  }
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
  // Pointer release commits the last rendered preview, including its exact trace.
  if(finalize)return;
  const item=state.components.find(c=>c.id===id)??state.junctions.find(n=>n.id===id);if(!item)return;
  Object.assign(item,pose);state=movementCircuit(state,id,before,session);if(!state)return;
  const attached=new Set(),physical=state.viewMode==='physical',boxes=boxesFor(state,state.viewMode),originalItem=before.components.find(c=>c.id===id)??before.junctions.find(n=>n.id===id),strength=originalItem?Math.min(1,(distance(item,originalItem)+(item.angle!==originalItem.angle?80:0))/24):1;session.faces??=new Map();
  for(const wire of state.wires){const incident=wire.a.split(':')[0]===id||wire.b.split(':')[0]===id,old=before.wires.find(w=>w.id===wire.id);if(!old)continue;
    if(!physical){if(incident){attached.add(wire.id);delete wire.via;}continue;}
    let points=wirePoints(wire,k=>pointIn(state,k,'physical'),'physical');
    const original=wirePoints(old,k=>pointIn(before,k,'physical'),'physical');points=incident?deformCable(original,pointIn(state,wire.a,'physical'),pointIn(state,wire.b,'physical')):original;
    if(incident){attached.add(wire.id);if(!routeIsClear(points,state,wire,'physical'))points=terminalTangents(points,state,wire,strength);}
    wire.physicalVia=points.slice(1,-1);
  }
  if(physical){
    const solids=boxesFor(state,'physical',2),nets=circuitNets(state),routes=state.wires.map(wire=>({wire,points:wirePoints(wire,k=>pointIn(state,k,'physical'),'physical')}));
    for(const route of routes)if(bodyCost(route.points,solids,route.wire)>eps){route.points=repairPhysicalSpan(state,route,routes,nets,boxes,solids);if(bodyCost(route.points,solids,route.wire)>eps)route.points=projectCable(route.points,boxes,route.wire,session.faces);route.wire.physicalVia=route.points.slice(1,-1);}
    repairPhysicalCrossings(state,routes,nets,boxes,solids);for(const route of routes)route.wire.physicalVia=route.points.slice(1,-1);
    return;
  }
  if(preview)return;
  routeCircuit(state,state.viewMode,{ids:attached});
}
