import {definitions} from './models.js?v=2.6';
import {upgradeStoredState} from './visuals.js?v=2.6';
import {terminalIndices} from './terminals.js?v=2.6';
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
    if(c.type==='spdt'&&![1,2].includes(c.position))return null;
    ids.add(c.id);for(const index of terminalIndices(c.type))terminals.add(`${c.id}:${index}`);
  }
  for(const n of d.junctions){if(!n||!/^n\d+$/.test(n.id)||!Number.isSafeInteger(Number(n.id.slice(1)))||Number(n.id.slice(1))>=Number.MAX_SAFE_INTEGER||ids.has(n.id)||!Number.isFinite(n.x)||!Number.isFinite(n.y))return null;ids.add(n.id);terminals.add(`${n.id}:0`);}
  const validRoute=(route,limit)=>Array.isArray(route)&&route.length<=limit&&route.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
  for(const w of d.wires){if(!w||!/^w\d+$/.test(w.id)||wireIds.has(w.id)||!terminals.has(w.a)||!terminals.has(w.b)||w.a===w.b||(w.via!=null&&!validRoute(w.via,100))||(w.physicalVia!==undefined&&!validRoute(w.physicalVia,2048)))return null;wireIds.add(w.id);}
  for(const r of d.records){if(!r||typeof r.experiment!=='string'||r.experiment.length>100||!Number.isFinite(r.voltage)||!Number.isFinite(r.current)||(r.resistance!=null&&!Number.isFinite(r.resistance))||typeof r.time!=='string'||r.time.length>32||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt)))return null;}
  if(!Number.isSafeInteger(d.nextId)||d.nextId<1)return null;
  d.nextId=Math.max(d.nextId,...d.junctions.map(n=>Number(n.id.slice(1))+1));
  d.preset=['series','parallel','ohm','free'].includes(d.preset)?d.preset:'free';d.running=true;d.showCurrent=d.showCurrent!==false;
  d.viewMode=d.viewMode==='physical'?'physical':'schematic';
  if(d.layouts!==undefined){
    if(!d.layouts||typeof d.layouts!=='object'||Array.isArray(d.layouts))return null;
    const layouts={};for(const mode of ['schematic','physical']){const layout=d.layouts[mode];if(!layout)continue;if(!layout.poses||typeof layout.poses!=='object'||Array.isArray(layout.poses)||Object.keys(layout.poses).length>700)return null;
      const poses={};for(const [id,p] of Object.entries(layout.poses)){if(!ids.has(id))continue;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||(p.angle!==undefined&&![0,90,180,270].includes(p.angle)))return null;poses[id]={x:p.x,y:p.y,...(p.angle!==undefined?{angle:p.angle}:{})};}
      if(layout.version!==undefined&&(!Number.isSafeInteger(layout.version)||layout.version<1||layout.version>2))return null;
      if(layout.signature!==undefined&&(typeof layout.signature!=='string'||layout.signature.length>200000))return null;
      const view=layout.view;if(view&&(!Number.isFinite(view.x)||!Number.isFinite(view.y)||!Number.isFinite(view.zoom)||view.zoom<=0||view.zoom>5))return null;layouts[mode]={poses,...(layout.version!==undefined?{version:layout.version}:{}),...(layout.signature!==undefined?{signature:layout.signature}:{}),...(view?{view:{x:view.x,y:view.y,zoom:view.zoom}}:{})};
    }d.layouts=layouts;
  }
  const view=d.view;
  d.view=view&&Number.isFinite(view.x)&&Number.isFinite(view.y)&&Number.isFinite(view.zoom)&&view.zoom>0?{x:view.x,y:view.y,zoom:Math.min(5,view.zoom)}:{x:420,y:255,zoom:1};
  return d;
}
