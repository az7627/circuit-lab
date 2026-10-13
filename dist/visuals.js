/** Symbol geometry and bounded display helpers, independent of selection state. */
export function terminalOffset(type,index) {
  if(type==='rheostat') return index===0?{x:-54,y:18}:{x:0,y:-54};
  if(type==='bell') return {x:index===0?-14:14,y:54};
  return {x:index===0?-54:54,y:0};
}
export function componentTerminal(c,index) {
  const p=terminalOffset(c.type,index),r=c.angle*Math.PI/180;
  return {x:c.x+p.x*Math.cos(r)-p.y*Math.sin(r),y:c.y+p.x*Math.sin(r)+p.y*Math.cos(r)};
}
export function labelOffset(c) {
  if(c.type==='bell') return c.angle%180===0?{x:65,y:4}:{x:0,y:48};
  return c.angle%180===90?{x:-64,y:4}:{x:0,y:47};
}
export function componentBounds(c) {
  const corners=c.type==='bell'?[[-28,-28],[28,0]]:[[-55,-31],[55,31]];
  const r=c.angle*Math.PI/180,points=[];
  for(const x of [corners[0][0],corners[1][0]]) for(const y of [corners[0][1],corners[1][1]])points.push({x:c.x+x*Math.cos(r)-y*Math.sin(r),y:c.y+x*Math.sin(r)+y*Math.cos(r)});
  points.push(componentTerminal(c,0),componentTerminal(c,1));
  const l=labelOffset(c);
  points.push({x:c.x+l.x-42,y:c.y+l.y-16},{x:c.x+l.x+42,y:c.y+l.y+23});
  const left=Math.min(...points.map(p=>p.x))-10,top=Math.min(...points.map(p=>p.y))-10;
  return {x:left,y:top,width:Math.max(...points.map(p=>p.x))+10-left,height:Math.max(...points.map(p=>p.y))+10-top};
}
const mix=(a,b,t)=>'#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');
export function lampAppearance(power) {
  const p=Math.max(0,Number.isFinite(power)?power:0),level=1-Math.exp(-p/1.8);
  return {level,radius:31+15*level,opacity:.70*level,
    fill:mix([253,252,255],[255,224,157],level),
    ring:mix([140,120,172],[183,139,65],level),
    filament:mix([140,120,172],[165,114,49],level)};
}
export function feedbackLevel(power,scale=3){return 1-Math.exp(-Math.max(0,Number.isFinite(power)?power:0)/scale);}
export function heaterAppearance(power){const level=feedbackLevel(power,5);return {level,color:mix([140,120,172],[239,67,38],level),opacity:.45*level,width:2.5+1.5*level};}
export function viewportGeometry(camera,zoom,viewport){const scale=Math.max(.00001,Math.min(viewport.width/840,viewport.height/510)*zoom);return {scale,x:camera.x-viewport.width/(2*scale),y:camera.y-viewport.height/(2*scale),width:viewport.width/scale,height:viewport.height/scale};}
export function panCamera(start,dx,dy,scale){return {x:start.x-dx/scale,y:start.y-dy/scale};}
export function fitCamera(bounds,viewport,padding=36) {
  if(!bounds||!(viewport.width>0)||!(viewport.height>0))return {x:420,y:255,zoom:1};
  const base=Math.min(viewport.width/840,viewport.height/510);
  const scale=Math.min(viewport.width/(bounds.width+padding*2),viewport.height/(bounds.height+padding*2));
  return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,zoom:Math.min(2.5,scale/base)};
}
/** Preserve old terminals and records while upgrading buzzer and symbol geometry. */
export function upgradeStoredState(saved) {
  if(!saved||!Array.isArray(saved.components))return saved;
  function upgradeCircuit(circuit) {
    if(!circuit||!Array.isArray(circuit.components))return;
    const changed=new Set();
    for(const c of circuit.components) {
      if(c?.type==='buzzer'){c.type='bell';changed.add(c.id);}
      if(c?.type==='rheostat'&&saved.viewModelVersion!==2)changed.add(c.id);
    }
    for(const w of Array.isArray(circuit.wires)?circuit.wires:[])if(changed.has(w?.a?.split(':')[0])||changed.has(w?.b?.split(':')[0]))delete w.via;
  }
  upgradeCircuit(saved);
  for(const r of Array.isArray(saved.records)?saved.records:[])upgradeCircuit(r?.circuit);
  saved.viewModelVersion=2;
  return saved;
}
