import {terminalIndices} from './terminals.js?v=2.6';
import {componentTerminal,componentHitBounds} from './visuals.js?v=2.6';

const meter=c=>c.type==='ammeter'||c.type==='voltmeter';
const ordered=(a,b)=>a.localeCompare(b,undefined,{numeric:true});
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:0;};

/** Wires, including chains of loose junctions, form one electrical node. */
export function circuitNets(state) {
  const parent=new Map(),find=key=>{if(!parent.has(key))parent.set(key,key);if(parent.get(key)!==key)parent.set(key,find(parent.get(key)));return parent.get(key);};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(ordered(a,b)<0?b:a,ordered(a,b)<0?a:b);};
  for(const c of state.components){for(const i of terminalIndices(c.type))find(`${c.id}:${i}`);if(meter(c))join(`${c.id}:0`,`${c.id}:2`);}
  for(const n of state.junctions)find(`${n.id}:0`);
  for(const w of state.wires)join(w.a,w.b);
  const groups=new Map();for(const key of parent.keys()){const net=find(key);if(!groups.has(net))groups.set(net,[]);groups.get(net).push(key);}
  return {find,groups};
}

export function topologySignature(state) {
  return JSON.stringify([state.components.map(c=>[c.id,c.type]).sort((a,b)=>ordered(a[0],b[0])),state.junctions.map(n=>n.id).sort(ordered),state.wires.map(w=>[w.id,...[w.a,w.b].sort(ordered)]).sort((a,b)=>ordered(a[0],b[0]))]);
}

function reverse(tree) {
  if(tree.kind==='leaf')return {...tree,a:tree.b,b:tree.a,ports:[...tree.ports].reverse()};
  return {...tree,a:tree.b,b:tree.a,children:(tree.kind==='series'?[...tree.children].reverse():tree.children).map(reverse)};
}
const orient=(tree,a)=>tree.a===a?tree:reverse(tree);
function combine(kind,a,b,children) {
  return {kind,a,b,children:children.flatMap(c=>c.kind===kind?c.children:[c]),key:children.map(c=>c.key).sort(ordered).join(',')};
}

/** Series / parallel reduction is structural: an open switch is still a branch. */
function reduceBranches(leaves,start,end) {
  let edges=[...leaves];
  for(let pass=0;pass<leaves.length*2+2;pass++){
    let changed=false;const parallel=new Map();
    for(const edge of edges){const key=[edge.a,edge.b].sort(ordered).join('|');if(!parallel.has(key))parallel.set(key,[]);parallel.get(key).push(edge);}
    edges=[];
    for(const group of parallel.values()){
      if(group.length===1){edges.push(group[0]);continue;}
      const [a,b]=[group[0].a,group[0].b].sort(ordered);edges.push(combine('parallel',a,b,group.map(e=>orient(e,a))));changed=true;
    }
    const incident=new Map();for(const edge of edges)for(const node of [edge.a,edge.b]){if(!incident.has(node))incident.set(node,[]);incident.get(node).push(edge);}
    const node=[...incident.keys()].sort(ordered).find(n=>n!==start&&n!==end&&incident.get(n).length===2&&incident.get(n)[0]!==incident.get(n)[1]);
    if(node){
      const [one,two]=incident.get(node),a=one.a===node?one.b:one.a,b=two.a===node?two.b:two.a;
      if(a!==b){edges=edges.filter(e=>e!==one&&e!==two);edges.push(combine('series',a,b,[orient(one,a),orient(two,node)]));changed=true;}
    }
    if(edges.length===1&&edges[0].a!==edges[0].b&&[edges[0].a,edges[0].b].includes(start)&&[edges[0].a,edges[0].b].includes(end))return orient(edges[0],start);
    if(!changed)break;
  }
  return null;
}

const isMeasurement=tree=>tree.kind==='leaf'?tree.component.type==='voltmeter':tree.children.every(isMeasurement);
function measure(tree) {
  if(tree.kind==='leaf')return Object.assign(tree,{width:220,above:48,below:82});
  tree.children.forEach(measure);
  if(tree.kind==='series')return Object.assign(tree,{width:tree.children.reduce((n,c)=>n+c.width,0),above:Math.max(...tree.children.map(c=>c.above)),below:Math.max(...tree.children.map(c=>c.below))});
  const main=tree.children.filter(c=>!isMeasurement(c)).sort((a,b)=>ordered(a.key,b.key)),meters=tree.children.filter(isMeasurement).sort((a,b)=>ordered(a.key,b.key));
  tree.children=[...main,...meters];tree.offsets=new Map();let above=main[0]?.above??48,below=main[0]?.below??82;
  if(main[0])tree.offsets.set(main[0],0);
  for(const child of main.slice(1)){const y=below+child.above+40;tree.offsets.set(child,y);below=y+child.below;}
  for(const child of meters){const y=-above-child.below-40;tree.offsets.set(child,y);above=-y+child.above;}
  return Object.assign(tree,{width:Math.max(...tree.children.map(c=>c.width))+40,above,below});
}

function angleFor(c,port) {
  // Every leaf is drawn from its first node on the left to its second on the right.
  if(c.type==='battery'||meter(c))return port===1?0:180;
  return port===0?0:180;
}
function place(tree,x,y,width,anchors) {
  for(const [net,p] of [[tree.a,{x,y}],[tree.b,{x:x+width,y}]]){if(!anchors.has(net))anchors.set(net,[]);anchors.get(net).push(p);}
  if(tree.kind==='leaf'){Object.assign(tree.component,{x:x+width/2,y,angle:angleFor(tree.component,tree.ports[0])});return;}
  if(tree.kind==='series'){
    let cursor=x;for(const child of tree.children){const span=child.width*width/tree.width;place(child,cursor,y,span,anchors);cursor+=span;}
  }else for(const child of tree.children)place(child,x,y+tree.offsets.get(child),width,anchors);
}

function bridgeTree(branches,start,end) {
  const degree=new Map();for(const e of branches)for(const n of [e.a,e.b])degree.set(n,(degree.get(n)??0)+1);
  for(const edge of [...branches].filter(e=>e.a!==start&&e.a!==end&&e.b!==start&&e.b!==end&&(degree.get(e.a)??0)>2&&(degree.get(e.b)??0)>2).sort((a,b)=>ordered(a.key,b.key))){
    const tree=reduceBranches(branches.filter(e=>e!==edge),start,end);if(tree)return {tree,edge};
  }
  return null;
}
function placeBridge(edge,anchors) {
  const pairs=[];for(const a of anchors.get(edge.a)??[])for(const b of anchors.get(edge.b)??[])pairs.push({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)});pairs.sort((a,b)=>a.d-b.d);
  const pair=pairs[0];if(!pair)return;const c=edge.component;c.x=(pair.a.x+pair.b.x)/2;c.y=(pair.a.y+pair.b.y)/2;
  const scores=[0,90,180,270].map(angle=>{c.angle=angle;const a=componentTerminal(c,edge.ports[0]),b=componentTerminal(c,edge.ports[1]);return {angle,d:Math.hypot(a.x-pair.a.x,a.y-pair.a.y)+Math.hypot(b.x-pair.b.x,b.y-pair.b.y)};});c.angle=scores.sort((a,b)=>a.d-b.d)[0].angle;
}

function distances(edges,start){const found=new Map([[start,0]]),queue=[start];for(const n of queue)for(const e of edges){const next=e.a===n?e.b:e.b===n?e.a:null;if(next!==null&&!found.has(next)){found.set(next,found.get(n)+1);queue.push(next);}}return found;}

/** Layered fallback for bridge circuits, multiple supplies and three-terminal parts. */
function placeGeneral(edges,start,x,y,anchors,nets) {
  const d=distances(edges,start),columns=new Map();
  for(const e of edges){const rank=Math.min(d.get(e.a)??0,d.get(e.b)??0);if(!columns.has(rank))columns.set(rank,[]);columns.get(rank).push(e);}
  let bottom=y,width=220;const rows=new Map();
  for(const [rank,group] of [...columns].sort((a,b)=>a[0]-b[0])){
    group.sort((a,b)=>Number(isMeasurement(a))-Number(isMeasurement(b))||ordered(a.key,b.key));
    group.forEach((e,i)=>{rows.set(e.key,i);e.column=rank;});width=Math.max(width,(rank+1)*220);
  }
  // Barycentric sweeps keep related branches near each other before routing.
  for(let pass=0;pass<6;pass++)for(const group of [...columns.values()].slice().sort((a,b)=>(pass%2?-1:1)*(a[0].column-b[0].column))){
    const center=e=>{const neighbors=edges.filter(other=>other!==e&&(other.a===e.a||other.a===e.b||other.b===e.a||other.b===e.b));return neighbors.length?neighbors.reduce((sum,n)=>sum+rows.get(n.key),0)/neighbors.length:rows.get(e.key);};
    group.sort((a,b)=>center(a)-center(b)||ordered(a.key,b.key));group.forEach((e,i)=>rows.set(e.key,i));
  }
  for(const e of edges){const forward=(d.get(e.a)??0)<=(d.get(e.b)??0),row=rows.get(e.key);Object.assign(e.component,{x:x+110+e.column*220,y:y+row*180,angle:angleFor(e.component,e.ports[forward?0:1])});bottom=Math.max(bottom,e.component.y+82);}
  for(const edge of edges.filter(e=>e.component.type==='spdt')){
    const c=edge.component,neighbors=[1,2].map(index=>edges.filter(e=>e!==edge&&(e.a===nets.find(`${c.id}:${index}`)||e.b===nets.find(`${c.id}:${index}`))).sort((a,b)=>Math.abs(a.component.x-c.x)-Math.abs(b.component.x-c.x))[0]?.component);
    const [one,two]=neighbors;if(!one||!two||one===two||Math.abs(one.x-two.x)>1)continue;
    const p=componentTerminal(c,1),q=componentTerminal(c,2);if((one.y-two.y)*(p.y-q.y)<0)[one.y,two.y]=[two.y,one.y];c.y=(one.y+two.y)/2;
  }
  for(const e of edges)for(const [net,index] of [[e.a,e.ports[0]],[e.b,e.ports[1]],...(e.component.type==='spdt'?[[nets.find(`${e.key}:2`),2]]:[])]){if(!anchors.has(net))anchors.set(net,[]);anchors.get(net).push(componentTerminal(e.component,index));}
  return {width,bottom};
}

/** Trace nodes first, then place series chains and parallel branches independently of cable shape. */
export function layoutSchematic(state) {
  const nets=circuitNets(state),anchors=new Map(),edges=state.components.map(c=>{
    const positive=meter(c)&&state.wires.some(w=>w.a===`${c.id}:2`||w.b===`${c.id}:2`)?2:0;
    return {kind:'leaf',component:c,key:c.id,a:nets.find(`${c.id}:${positive}`),b:nets.find(`${c.id}:1`),ports:[positive,1]};
  }).sort((a,b)=>ordered(a.key,b.key));
  // A second SPDT throw participates in connectivity, but the switch is placed once.
  const connectivity=[...edges,...state.components.filter(c=>c.type==='spdt').map(c=>({a:nets.find(`${c.id}:0`),b:nets.find(`${c.id}:2`)}))];
  const pending=new Set(edges);let top=80;
  while(pending.size){
    const first=[...pending].find(e=>e.component.type==='battery')??[...pending][0],connected=distances(connectivity,first.a),cluster=[...pending].filter(e=>connected.has(e.a)||connected.has(e.b));cluster.forEach(e=>pending.delete(e));
    const source=cluster.find(e=>e.component.type==='battery'&&e.a!==e.b),branches=cluster.filter(e=>e!==source),start=source?.b??first.a,end=source?.a??[...distances(branches,start)].sort((a,b)=>b[1]-a[1]||ordered(a[0],b[0]))[0]?.[0]??first.b;
    const reducible=branches.length&&cluster.every(e=>e.component.type!=='spdt')&&branches.every(e=>e.a!==e.b),simple=reducible?reduceBranches(branches,start,end):null,bridge=reducible&&!simple?bridgeTree(branches,start,end):null,tree=simple??bridge?.tree;
    let width,bottom;
    if(tree){measure(tree);const y=top+tree.above;place(tree,100,y,tree.width,anchors);if(bridge)placeBridge(bridge.edge,anchors);width=tree.width;bottom=y+tree.below;}
    else {const result=placeGeneral(branches.length?branches:source?[]:cluster,start,100,top+48,anchors,nets);width=result.width;bottom=result.bottom;}
    if(source){const c=source.component;Object.assign(c,{x:100+width/2,y:bottom+100,angle:0});for(const [net,x] of [[start,100],[end,100+width]]){if(!anchors.has(net))anchors.set(net,[]);anchors.get(net).push({x,y:c.y});}bottom=c.y+82;}
    top=bottom+140;
  }
  const adjacent=new Map();for(const w of state.wires)for(const [a,b] of [[w.a,w.b],[w.b,w.a]]){if(!adjacent.has(a))adjacent.set(a,[]);adjacent.get(a).push(b);}
  const byId=new Map(state.components.map(c=>[c.id,c])),used=new Map();
  for(const n of [...state.junctions].sort((a,b)=>ordered(a.id,b.id))){
    const net=nets.find(`${n.id}:0`),ports=[],queue=[[`${n.id}:0`,0]],seen=new Set();let nearest=Infinity;
    for(const [key,depth] of queue){if(seen.has(key)||depth>nearest)continue;seen.add(key);const [id,index]=key.split(':'),c=byId.get(id);if(c){nearest=depth;ports.push(componentTerminal(c,Number(index)));continue;}for(const key2 of adjacent.get(key)??[])queue.push([key2,depth+1]);}
    const locations=anchors.get(net)??ports,x=median(locations.map(p=>p.x)),y=median(ports.length?ports.map(p=>p.y):locations.map(p=>p.y));
    Object.assign(n,{x:Math.round(x/10)*10,y:Math.round(y/10)*10});
    const key=`${n.x}:${n.y}`,count=used.get(key)??0;used.set(key,count+1);if(count)n.y+=count*24;
    for(let attempt=0;attempt<20;attempt++){const box=state.components.map(componentHitBounds).find(b=>n.x>b.x-10&&n.x<b.x+b.width+10&&n.y>b.y-10&&n.y<b.y+b.height+10);if(!box)break;const candidates=[{x:box.x-20,y:n.y},{x:box.x+box.width+20,y:n.y},{x:n.x,y:box.y-20},{x:n.x,y:box.y+box.height+20}];candidates.sort((a,b)=>Math.hypot(a.x-n.x,a.y-n.y)-Math.hypot(b.x-n.x,b.y-n.y));Object.assign(n,candidates[0]);}
  }
  return nets;
}
