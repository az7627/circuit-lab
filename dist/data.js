import {definitions} from './models.js?v=2.1';
import {upgradeStoredState} from './visuals.js?v=2.1';
export const clone=value=>JSON.parse(JSON.stringify(value));
export function normalizeState(input){
  if(!input||typeof input!=='object')return null;
  const d=upgradeStoredState(clone(input));
  if(!Array.isArray(d.components)||d.components.length>200||!Array.isArray(d.wires)||d.wires.length>1000||!Array.isArray(d.records)||d.records.length>500)return null;
  d.junctions??=[];if(!Array.isArray(d.junctions)||d.junctions.length>500)return null;
  const ids=new Set(),terminals=new Set(),wireIds=new Set();
  for(const c of d.components){
    const type=c&&Object.hasOwn(definitions,c.type)&&definitions[c.type];
    if(!type||!/^[a-z]\d+$/.test(c.id)||!Number.isSafeInteger(Number(c.id.slice(1)))||ids.has(c.id)||!Number.isFinite(c.x)||!Number.isFinite(c.y)||!Number.isFinite(c.value)||(type.unit&&(c.value<type.min||c.value>type.max))||![0,90,180,270].includes(c.angle)||typeof c.closed!=='boolean'||(c.type==='fuse'&&typeof c.blown!=='boolean'))return null;
    ids.add(c.id);terminals.add(`${c.id}:0`);terminals.add(`${c.id}:1`);
  }
  for(const n of d.junctions){if(!n||!/^n\d+$/.test(n.id)||!Number.isSafeInteger(Number(n.id.slice(1)))||Number(n.id.slice(1))>=Number.MAX_SAFE_INTEGER||ids.has(n.id)||!Number.isFinite(n.x)||!Number.isFinite(n.y))return null;ids.add(n.id);terminals.add(`${n.id}:0`);}
  for(const w of d.wires){if(!w||!/^w\d+$/.test(w.id)||wireIds.has(w.id)||!terminals.has(w.a)||!terminals.has(w.b)||w.a===w.b||(w.via&&(!Array.isArray(w.via)||w.via.length>100||!w.via.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))))return null;wireIds.add(w.id);}
  for(const r of d.records){if(!r||typeof r.experiment!=='string'||r.experiment.length>100||!Number.isFinite(r.voltage)||!Number.isFinite(r.current)||(r.resistance!=null&&!Number.isFinite(r.resistance))||typeof r.time!=='string'||r.time.length>32||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt)))return null;}
  if(!Number.isSafeInteger(d.nextId)||d.nextId<1)return null;
  d.nextId=Math.max(d.nextId,...d.junctions.map(n=>Number(n.id.slice(1))+1));
  d.preset=['series','parallel','ohm','free'].includes(d.preset)?d.preset:'free';d.running=true;d.showCurrent=d.showCurrent!==false;
  const view=d.view;
  d.view=view&&Number.isFinite(view.x)&&Number.isFinite(view.y)&&Number.isFinite(view.zoom)&&view.zoom>0?{x:view.x,y:view.y,zoom:Math.min(5,view.zoom)}:{x:420,y:255,zoom:1};
  return d;
}
