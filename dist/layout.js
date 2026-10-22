import {componentTerminal,componentBounds,componentHitBounds} from './visuals.js?v=2.5';
import {physicalBounds,physicalHitBounds} from './physical.js?v=2.5';
import {wirePoints,simplifyTrace} from './wiring.js?v=2.5';

const eps=1e-6,copy=p=>({x:p.x,y:p.y}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const inflate=(b,p)=>({x:b.x-p,y:b.y-p,width:b.width+p*2,height:b.height+p*2});
const inside=(p,b)=>p.x>b.x+eps&&p.x<b.x+b.width-eps&&p.y>b.y+eps&&p.y<b.y+b.height-eps;
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export function pointIn(state,key,mode=state.viewMode) {
  const [id,index]=key.split(':'),c=state.components.find(c=>c.id===id);
  return c?componentTerminal(c,Number(index),mode):state.junctions.find(n=>n.id===id)??{x:0,y:0};
}
function direction(state,key,mode) {
  const [id,indexText]=key.split(':'),c=state.components.find(c=>c.id===id),index=Number(indexText);if(!c)return null;
  let d={x:index===0?-1:1,y:0};
  if(c.type==='battery'||['ammeter','voltmeter'].includes(c.type))d={x:index===1?-1:1,y:0};
  if(['ammeter','voltmeter'].includes(c.type)&&mode==='physical')d={x:0,y:1};
  if(c.type==='bell')d={x:0,y:1};
  if(c.type==='rheostat')d=index===0?{x:-1,y:0}:{x:0,y:-1};
  const r=c.angle*Math.PI/180;return {x:Math.round(d.x*Math.cos(r)-d.y*Math.sin(r)),y:Math.round(d.x*Math.sin(r)+d.y*Math.cos(r))};
}
function boxesFor(state,mode){return state.components.map(c=>({...inflate(mode==='physical'?physicalBounds(c):componentBounds(c),8),id:c.id}));}
function segmentBlocked(a,b,box) {
  if(Math.abs(a.y-b.y)<eps)return a.y>box.y+eps&&a.y<box.y+box.height-eps&&Math.max(a.x,b.x)>box.x+eps&&Math.min(a.x,b.x)<box.x+box.width-eps;
  if(Math.abs(a.x-b.x)<eps)return a.x>box.x+eps&&a.x<box.x+box.width-eps&&Math.max(a.y,b.y)>box.y+eps&&Math.min(a.y,b.y)<box.y+box.height-eps;
  // Liang–Barsky clipping also covers freely drawn and deformed segments.
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-box.x],[dx,box.x+box.width-a.x],[-dy,a.y-box.y],[dy,box.y+box.height-a.y]]){if(Math.abs(p)<eps){if(q<=eps)return false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>=hi-eps)return false;}}
  return hi>eps&&lo<1-eps;
}
export function routeIsClear(points,state,wire,mode=state.viewMode) {
  const boxes=boxesFor(state,mode),owners=[wire.a.split(':')[0],wire.b.split(':')[0]];
  if(points.length<2)return true;
  if(mode==='schematic'&&points.some((p,i)=>i&&Math.abs(p.x-points[i-1].x)>eps&&Math.abs(p.y-points[i-1].y)>eps))return false;
  const startBox=boxes.find(b=>b.id===owners[0]),endBox=boxes.find(b=>b.id===owners[1]);
  const startExit=startBox?points.findIndex(p=>!inside(p,startBox)):0;
  let endExit=points.length-1;if(endBox)for(let i=points.length-1;i>=0;i--)if(!inside(points[i],endBox)){endExit=i;break;}
  for(const [index,next] of [[0,1],[points.length-1,points.length-2]]){const d=direction(state,index===0?wire.a:wire.b,mode);if(d){const a=points[index],b=points[next];if((b.x-a.x)*d.x+(b.y-a.y)*d.y< -eps)return false;}}
  for(let i=1;i<points.length;i++)for(const b of boxes){
    // The terminal's escape segment is allowed through its own selection bounds.
    if((b.id===owners[0]&&i<=startExit)||(b.id===owners[1]&&i>endExit))continue;
    if(segmentBlocked(points[i-1],points[i],b))return false;
  }
  return true;
}
function escape(state,key,mode,boxes) {
  const p=pointIn(state,key,mode),d=direction(state,key,mode);if(!d)return copy(p);
  const b=boxes.find(b=>b.id===key.split(':')[0]);let length=22;
  if(b)length=Math.max(length,d.x>0?b.x+b.width-p.x+10:d.x<0?p.x-b.x+10:d.y>0?b.y+b.height-p.y+10:p.y-b.y+10);
  let q={x:p.x+d.x*length,y:p.y+d.y*length};
  for(let i=0;i<30&&boxes.some(b=>inside(q,b));i++){length+=16;q={x:p.x+d.x*length,y:p.y+d.y*length};}
  return q;
}
class Heap {
  values=[];
  push(value){const a=this.values;a.push(value);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=value.f)break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].f<a[child].f)child++;if(a[child].f>=last.f)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
function crossingCost(a,b,tracks){let cost=0;for(const track of tracks)for(let i=1;i<track.length;i++){const c=track[i-1],d=track[i];if(Math.abs(a.y-b.y)<eps&&Math.abs(c.y-d.y)<eps&&Math.abs(a.y-c.y)<eps){const shared=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x));if(shared>eps)cost+=shared*.6+28;}else if(Math.abs(a.x-b.x)<eps&&Math.abs(c.x-d.x)<eps&&Math.abs(a.x-c.x)<eps){const shared=Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y));if(shared>eps)cost+=shared*.6+28;}else if(Math.max(a.x,b.x)>Math.min(c.x,d.x)+eps&&Math.min(a.x,b.x)<Math.max(c.x,d.x)-eps&&Math.max(c.y,d.y)>Math.min(a.y,b.y)+eps&&Math.min(c.y,d.y)<Math.max(a.y,b.y)-eps)cost+=34;}return cost;}

/** A* on an orthogonal visibility grid, with bend and shared-track penalties. */
export function routeOrthogonal(start,end,boxes=[],tracks=[],{startDirection=null,endDirection=null}={}) {
  const xs=[start.x,end.x],ys=[start.y,end.y];for(const b of boxes){xs.push(b.x-2,b.x+b.width+2);ys.push(b.y-2,b.y+b.height+2);}
  const minX=Math.min(...xs)-40,maxX=Math.max(...xs)+40,minY=Math.min(...ys)-40,maxY=Math.max(...ys)+40;xs.push(minX,maxX);ys.push(minY,maxY);
  const unique=values=>[...new Set(values.map(v=>Math.round(v*1e6)/1e6))].sort((a,b)=>a-b),x=unique(xs),y=unique(ys),nx=x.length,ny=y.length;
  const near=(values,n)=>values.findIndex(v=>Math.abs(v-n)<eps*2),sx=near(x,start.x),sy=near(y,start.y),ex=near(x,end.x),ey=near(y,end.y),encode=(xi,yi,dir)=>(yi*nx+xi)*3+dir;
  const size=nx*ny*3,g=new Float64Array(size).fill(Infinity),previous=new Int32Array(size).fill(-1),visited=new Uint8Array(size),blocked=new Map(),heap=new Heap(),first=encode(sx,sy,0);
  g[first]=0;heap.push({id:first,f:Math.abs(start.x-end.x)+Math.abs(start.y-end.y)});let final=-1;
  while(heap.values.length){const {id}=heap.pop();if(visited[id])continue;visited[id]=1;const dir=id%3,cell=(id-dir)/3,xi=cell%nx,yi=Math.floor(cell/nx);if(xi===ex&&yi===ey){final=id;break;}
    const a={x:x[xi],y:y[yi]};
    for(const [xx,yy,nextDir] of [[xi-1,yi,1],[xi+1,yi,1],[xi,yi-1,2],[xi,yi+1,2]]){if(xx<0||xx>=nx||yy<0||yy>=ny)continue;const next=encode(xx,yy,nextDir);if(visited[next])continue;const b={x:x[xx],y:y[yy]},key=cell<yy*nx+xx?`${cell}:${yy*nx+xx}`:`${yy*nx+xx}:${cell}`;
      if(id===first&&startDirection&&(b.x-a.x)*startDirection.x+(b.y-a.y)*startDirection.y< -eps)continue;
      if(xx===ex&&yy===ey&&endDirection&&(b.x-a.x)*endDirection.x+(b.y-a.y)*endDirection.y>eps)continue;
      if(!blocked.has(key))blocked.set(key,boxes.some(box=>segmentBlocked(a,b,box)));if(blocked.get(key))continue;
      const score=g[id]+distance(a,b)+(dir&&dir!==nextDir?24:0)+crossingCost(a,b,tracks);if(score>=g[next]-eps)continue;g[next]=score;previous[next]=id;heap.push({id:next,f:score+Math.abs(b.x-end.x)+Math.abs(b.y-end.y)});
    }
  }
  if(final<0)return null;
  const result=[];for(let id=final;id>=0;id=previous[id]){const cell=Math.floor(id/3);result.push({x:x[cell%nx],y:y[Math.floor(cell/nx)]});}return simplifyTrace(result.reverse(),.01);
}
function rounded(points,radius=14){const out=[copy(points[0])];for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],l=distance(a,b),r=distance(b,c),amount=Math.min(radius,l/3,r/3);if(amount<eps)continue;const p={x:b.x+(a.x-b.x)*amount/l,y:b.y+(a.y-b.y)*amount/l},q={x:b.x+(c.x-b.x)*amount/r,y:b.y+(c.y-b.y)*amount/r};out.push(p);for(const t of [.25,.5,.75,1])out.push({x:(1-t)**2*p.x+2*(1-t)*t*b.x+t*t*q.x,y:(1-t)**2*p.y+2*(1-t)*t*b.y+t*t*q.y});}out.push(copy(points.at(-1)));return out;}
export function routeCircuit(state,mode=state.viewMode,{force=false,ids=null,preservePhysical=false}={}) {
  const boxes=boxesFor(state,mode),tracks=[],key=mode==='physical'?'physicalVia':'via';
  for(const wire of state.wires){const original=wirePoints(wire,k=>pointIn(state,k,mode),mode);if(ids&&!ids.has(wire.id)){tracks.push(original);continue;}
    if(!force&&wire[key]!==undefined&&((mode==='physical'&&preservePhysical)||routeIsClear(original,state,wire,mode))){tracks.push(original);continue;}
    const a=pointIn(state,wire.a,mode),b=pointIn(state,wire.b,mode),start=escape(state,wire.a,mode,boxes),end=escape(state,wire.b,mode,boxes);
    const path=routeOrthogonal(start,end,boxes,tracks,{startDirection:direction(state,wire.a,mode),endDirection:direction(state,wire.b,mode)});
    if(path){const points=simplifyTrace([a,...path,b],.01),route=mode==='physical'?rounded(points):points;wire[key]=route.slice(1,-1);tracks.push(route);}
    else tracks.push(original);
  }
}
function saveLayout(state,view){const poses={};for(const item of [...state.components,...state.junctions])poses[item.id]={x:item.x,y:item.y,...('angle' in item?{angle:item.angle}:{})};return {poses,...(view?{view:{...view}}:{})};}
function arrange(state,mode,newIds) {
  const accepted=[];
  for(const c of [...state.components].sort((a,b)=>Number(newIds.has(a.id))-Number(newIds.has(b.id)))){if(mode==='schematic'&&newIds.has(c.id)){c.x=Math.round(c.x/20)*20;c.y=Math.round(c.y/20)*20;}if(mode==='physical'&&newIds.has(c.id)&&['ammeter','voltmeter'].includes(c.type))c.angle=0;
    const bound=()=>inflate(mode==='physical'?physicalBounds(c):componentBounds(c),14);let box=bound();
    if(newIds.has(c.id)&&accepted.some(b=>overlap(b,box))){const original=copy(c),candidates=[];for(let ring=1;ring<12;ring++)for(let dx=-ring;dx<=ring;dx++)for(let dy=-ring;dy<=ring;dy++)if(Math.max(Math.abs(dx),Math.abs(dy))===ring)candidates.push({x:original.x+dx*160,y:original.y+dy*140});candidates.sort((a,b)=>distance(a,original)-distance(b,original));for(const p of candidates){c.x=p.x;c.y=p.y;box=bound();if(!accepted.some(b=>overlap(b,box)))break;}}
    accepted.push(box);
  }
  for(const n of state.junctions){if(!newIds.has(n.id))continue;if(mode==='schematic'){n.x=Math.round(n.x/20)*20;n.y=Math.round(n.y/20)*20;}for(let attempt=0;attempt<30;attempt++){const box=accepted.find(b=>inside(n,b));if(!box)break;const candidates=[{x:box.x-16,y:n.y},{x:box.x+box.width+16,y:n.y},{x:n.x,y:box.y-16},{x:n.x,y:box.y+box.height+16}];candidates.sort((a,b)=>distance(a,n)-distance(b,n));Object.assign(n,candidates.find(p=>!accepted.some(b=>inside(p,b)))??candidates[0]);}}
}
/** Store each view's positions independently; only a new view is laid out. */
export function convertView(state,mode,view=null) {
  state.layouts??={};state.layouts[state.viewMode??'schematic']=saveLayout(state,view);const cached=state.layouts[mode],newIds=new Set();
  for(const item of [...state.components,...state.junctions]){const pose=cached?.poses?.[item.id];if(pose)Object.assign(item,pose);else newIds.add(item.id);}
  state.viewMode=mode;arrange(state,mode,newIds);routeCircuit(state,mode,{preservePhysical:mode==='physical'&&Boolean(cached)});state.layouts[mode]=saveLayout(state,cached?.view);return {newLayout:!cached,view:cached?.view??null};
}
function samplePath(points){const out=[copy(points[0])];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(distance(a,b)/18));for(let j=1;j<=steps;j++)out.push({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps});}return out;}
/** Distribute endpoint displacement over the whole cable using arc length. */
export function deformCable(points,newStart,newEnd) {
  const delta={x:newStart.x-points[0].x,y:newStart.y-points[0].y},last=points.at(-1);
  if(Math.abs(delta.x-(newEnd.x-last.x))<eps&&Math.abs(delta.y-(newEnd.y-last.y))<eps)return points.map(p=>({x:p.x+delta.x,y:p.y+delta.y}));
  const sampled=samplePath(points),lengths=[0];for(let i=1;i<sampled.length;i++)lengths.push(lengths.at(-1)+distance(sampled[i-1],sampled[i]));const total=lengths.at(-1)||1,a=points[0],b=points.at(-1);
  const result=sampled.map((p,i)=>{const t=lengths[i]/total,s=t*t*(3-2*t);return {x:p.x+(newStart.x-a.x)*(1-s)+(newEnd.x-b.x)*s,y:p.y+(newStart.y-a.y)*(1-s)+(newEnd.y-b.y)*s};});result[0]=copy(newStart);result[result.length-1]=copy(newEnd);return simplifyTrace(result,.45);
}
export function moveItem(state,id,pose,before) {
  const item=state.components.find(c=>c.id===id)??state.junctions.find(n=>n.id===id);if(!item)return;
  Object.assign(item,pose);const attached=new Set();
  for(const wire of state.wires){if(wire.a.split(':')[0]!==id&&wire.b.split(':')[0]!==id)continue;attached.add(wire.id);if(state.viewMode==='physical'){const old=before.wires.find(w=>w.id===wire.id);if(old){const points=wirePoints(old,k=>pointIn(before,k,'physical'),'physical');wire.physicalVia=deformCable(points,pointIn(state,wire.a,'physical'),pointIn(state,wire.b,'physical')).slice(1,-1);}}else delete wire.via;}
  routeCircuit(state,state.viewMode,{ids:attached});
}
