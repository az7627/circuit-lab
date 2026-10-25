import {circuitNets} from './topology.js?v=2.6';
import {componentTerminal,terminalOffset} from './visuals.js?v=2.6';
import {wirePoints} from './wiring.js?v=2.6';
import {terminalIndices} from './terminals.js?v=2.6';

const ordered=(a,b)=>a.localeCompare(b,undefined,{numeric:true});
const degreeOf=state=>{const degree=new Map();for(const w of state.wires)for(const key of [w.a,w.b])degree.set(key,(degree.get(key)??0)+1);return degree;};

// A bend or a branch on a cable is not a new electrical connection. This
// signature survives replacing drawing nodes with real binding posts.
export function electricalSignature(state) {
  const nets=circuitNets(state),parts=new Set(state.components.map(c=>c.id)),degree=degreeOf(state);
  const groups=[...nets.groups.values()].map(keys=>{const floating=!keys.some(k=>parts.has(k.split(':')[0]));return keys.filter(key=>floating||parts.has(key.split(':')[0])||(degree.get(key)??0)<2).sort(ordered);}).filter(keys=>keys.length).sort((a,b)=>ordered(a.join(','),b.join(',')));
  // Positive range posts are electrically aliased, but they are distinct
  // physical connections. A range change must invalidate the other view too.
  const components=state.components.map(c=>[c.id,c.type,...(['ammeter','voltmeter'].includes(c.type)?[[0,2].filter(i=>degree.has(`${c.id}:${i}`))]:[])]).sort((a,b)=>ordered(a[0],b[0]));
  return JSON.stringify([components,groups]);
}

/** Replace schematic helper nodes with short, direct post-to-post connections. */
export function directPhysicalConnections(state,{preferSupply=false,preferLoad=false,preferChain=false}={}) {
  const nets=circuitNets(state),degree=degreeOf(state),parts=new Map(state.components.map(c=>[c.id,c]));
  const retained=new Set(state.junctions.filter(n=>(degree.get(`${n.id}:0`)??0)<2).map(n=>n.id));
  for(const keys of nets.groups.values())if(!keys.some(key=>parts.has(key.split(':')[0])))for(const key of keys)retained.add(key.split(':')[0]);
  const point=key=>{const [id,index]=key.split(':');return parts.has(id)?componentTerminal(parts.get(id),Number(index),'physical'):state.junctions.find(n=>n.id===id);};
  const wires=[],usedIds=new Set(state.wires.map(w=>w.id));
  const next=()=>{let id;do{id=`w${state.nextId++}`;}while(usedIds.has(id));usedIds.add(id);return id;};
  for(const keys of nets.groups.values()){
    // Unused range posts must never become a second positive meter connection.
    const allPorts=keys.filter(key=>degree.has(key)&&(parts.has(key.split(':')[0])||retained.has(key.split(':')[0]))).sort(ordered);
    const probes=allPorts.filter(key=>parts.get(key.split(':')[0])?.type==='voltmeter');
    const ports=allPorts.filter(key=>!probes.includes(key));
    if(!ports.length)ports.push(...probes.splice(0));
    if(!ports.length)continue;
    // The split/join belongs to an electrical node. Use a real binding post
    // there: supply posts split outgoing branches, and a shared feeder meter
    // or branch return post collects its loads. Their screen order is irrelevant.
    const supplies=ports.filter(key=>parts.get(key.split(':')[0])?.type==='battery'),meters=ports.filter(key=>parts.get(key.split(':')[0])?.type==='ammeter');
    const loads=ports.filter(key=>!['battery','ammeter','voltmeter'].includes(parts.get(key.split(':')[0])?.type));
    const preferred=preferSupply&&supplies.length?supplies:!meters.length&&loads.length?loads:preferLoad&&supplies.length&&ports.length>3&&loads.length?loads:supplies.length&&ports.length<=3?supplies:meters.length?meters:supplies.length?supplies:ports;
    const cost=key=>ports.reduce((sum,other)=>sum+Math.hypot(point(key).x-point(other).x,point(key).y-point(other).y),0);
    const hub=[...preferred].sort((a,b)=>cost(a)-cost(b)||ordered(a,b))[0];
    const links=[];
    if(preferChain){
      const connected=new Set([hub]),pending=new Set(ports.filter(key=>key!==hub));
      while(pending.size){
        let nearest=null;
        for(const a of connected)for(const b of pending){const distance=Math.hypot(point(a).x-point(b).x,point(a).y-point(b).y);if(!nearest||distance<nearest.distance)nearest={a,b,distance};}
        links.push([nearest.a,nearest.b]);connected.add(nearest.b);pending.delete(nearest.b);
      }
    }else for(const b of ports.filter(key=>key!==hub))links.push([hub,b]);
    for(const [a,b] of links){
      const old=state.wires.find(w=>(w.a===a&&w.b===b)||(w.b===a&&w.a===b));
      wires.push(old?{...old}:{id:next(),a,b});
    }
    // A voltmeter is a measurement branch. Its probes attach to the measured
    // circuit's posts; the load's main path must not run through its posts.
    for(const a of probes){
      const p=point(a),b=[...ports].sort((one,two)=>Math.hypot(point(one).x-p.x,point(one).y-p.y)-Math.hypot(point(two).x-p.x,point(two).y-p.y)||ordered(one,two))[0];
      const old=state.wires.find(w=>(w.a===a&&w.b===b)||(w.b===a&&w.a===b));wires.push(old?{...old}:{id:next(),a,b});
    }
  }
  state.wires=wires;state.junctions=state.junctions.filter(n=>retained.has(n.id));
}

/** Filled dots denote actual three-way connections; elbows stay unmarked. */
export function schematicJunctionDots(state,point) {
  const nets=circuitNets(state),segments=[],candidates=new Map(),epsilon=.01;
  const add=(p,net)=>candidates.set(`${net}:${Math.round(p.x*100)}:${Math.round(p.y*100)}`,{x:p.x,y:p.y,net});
  for(const wire of state.wires){const points=wirePoints(wire,point,'schematic'),net=nets.find(wire.a);for(const p of points)add(p,net);for(let i=1;i<points.length;i++)segments.push({a:points[i-1],b:points[i],net});}
  for(let i=0;i<segments.length;i++)for(const t of segments.slice(i+1)){
    const s=segments[i];if(s.net!==t.net)continue;
    const horizontal=Math.abs(s.a.y-s.b.y)<epsilon,otherHorizontal=Math.abs(t.a.y-t.b.y)<epsilon;
    if(horizontal===otherHorizontal)continue;
    const h=horizontal?s:t,v=horizontal?t:s,p={x:v.a.x,y:h.a.y};
    if(p.x>=Math.min(h.a.x,h.b.x)-epsilon&&p.x<=Math.max(h.a.x,h.b.x)+epsilon&&p.y>=Math.min(v.a.y,v.b.y)-epsilon&&p.y<=Math.max(v.a.y,v.b.y)+epsilon)add(p,s.net);
  }
  return [...candidates.values()].filter(p=>{
    const rays=new Set();
    for(const {a,b,net} of segments){if(net!==p.net)continue;const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<epsilon||Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)>epsilon*length||(p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y)>epsilon)continue;
      for(const q of [a,b])if(Math.hypot(q.x-p.x,q.y-p.y)>epsilon)rays.add(`${Math.sign(Math.round((q.x-p.x)*100))}:${Math.sign(Math.round((q.y-p.y)*100))}`);
    }
    // The symbol's own lead is the third ray when two external wires branch
    // directly at a binding point. A plain terminal bend still has two rays.
    if(rays.size>=2)for(const c of state.components)for(const index of terminalIndices(c.type)){
      if(nets.find(`${c.id}:${index}`)!==p.net)continue;const terminal=point(`${c.id}:${index}`);if(Math.hypot(terminal.x-p.x,terminal.y-p.y)>epsilon)continue;
      const offset=terminalOffset(c.type,index),horizontal=Math.abs(offset.x)>=Math.abs(offset.y),x=horizontal?-Math.sign(offset.x):0,y=horizontal?0:-Math.sign(offset.y),r=c.angle*Math.PI/180;
      rays.add(`${Math.round(x*Math.cos(r)-y*Math.sin(r))}:${Math.round(x*Math.sin(r)+y*Math.cos(r))}`);
    }
    return rays.size>=3;
  }).map(({x,y})=>({x,y}));
}
