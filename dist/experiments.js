import {clone,normalizeState} from './data.js?v=2.2';
export const EXPERIMENTS_KEY='circuit-lab-experiments-v2';
const defaultSettings={sound:true,volume:.35,motion:true};
export function emptyCollection(){return {version:2,experiments:[],activeId:null,draft:null,draftName:'未保存的实验',settings:{...defaultSettings}};}
export function normalizeCollection(input){
  if(!input||input.version!==2||!Array.isArray(input.experiments)||input.experiments.length>500)return null;
  const output=emptyCollection(),ids=new Set();
  for(const e of input.experiments){const state=normalizeState(e?.state);if(!e||typeof e.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(e.id)||ids.has(e.id)||typeof e.name!=='string'||!e.name.trim()||e.name.length>60||!state||typeof e.archived!=='boolean')return null;ids.add(e.id);output.experiments.push({...e,state});}
  output.activeId=output.experiments.some(e=>e.id===input.activeId&&!e.archived)?input.activeId:null;
  output.draft=normalizeState(input.draft);output.draftName=typeof input.draftName==='string'&&input.draftName.length<=60?input.draftName:'未保存的实验';
  output.settings={sound:input.settings?.sound!==false,volume:Number.isFinite(input.settings?.volume)?Math.max(0,Math.min(1,input.settings.volume)):.35,motion:input.settings?.motion!==false};
  return output;
}
/** All writes are transactional: a quota failure does not claim a successful save. */
export class ExperimentStore{
  constructor(storage){this.storage=storage;this.data=emptyCollection();try{this.data=normalizeCollection(JSON.parse(storage.getItem(EXPERIMENTS_KEY)))??this.data;}catch{}}
  transact(action){let latest=null;try{latest=normalizeCollection(JSON.parse(this.storage.getItem(EXPERIMENTS_KEY)));}catch{}const next=clone(latest??this.data);next.activeId=this.data.activeId&&next.experiments.some(e=>e.id===this.data.activeId&&!e.archived)?this.data.activeId:null;action(next);const valid=normalizeCollection(next);if(!valid)throw new Error('实验数据过多或格式不正确，请先导出备份');this.storage.setItem(EXPERIMENTS_KEY,JSON.stringify(valid));this.data=valid;return valid;}
  recover(state,name='未保存的实验'){this.transact(d=>{if(d.activeId){const e=d.experiments.find(e=>e.id===d.activeId);if(e){e.state=clone(state);e.updatedAt=new Date().toISOString();}}else{d.draft=clone(state);d.draftName=name;}});}
  save(state,name,id=null,{preserveDraft=false}={}){name=String(name).trim().slice(0,60);if(!name)throw new Error('请输入实验名称');const create=id===null;id??=`exp_${globalThis.crypto?.randomUUID?.()??Date.now()+'_'+Math.random().toString(36).slice(2)}`;this.transact(d=>{let e=d.experiments.find(e=>e.id===id);if(!e){if(!create)throw new Error('实验已删除，请另存为新实验');e={id,name,archived:false,createdAt:new Date().toISOString()};d.experiments.unshift(e);}e.name=name;e.state=clone(state);e.updatedAt=new Date().toISOString();d.activeId=id;if(create&&!preserveDraft)d.draft=null;});return id;}
  activate(id){this.transact(d=>{if(!d.experiments.some(e=>e.id===id&&!e.archived))throw new Error('实验不存在');d.activeId=id;});}
  rename(id,name){name=String(name).trim().slice(0,60);if(!name)throw new Error('请输入实验名称');this.transact(d=>{const e=d.experiments.find(e=>e.id===id);if(e)e.name=name;});}
  archive(id){this.transact(d=>{const e=d.experiments.find(e=>e.id===id);if(e)e.archived=true;if(d.activeId===id)d.activeId=d.experiments.find(e=>!e.archived)?.id??null;});}
  restore(id){this.transact(d=>{const e=d.experiments.find(e=>e.id===id);if(e)e.archived=false;});}
  remove(id){this.transact(d=>{d.experiments=d.experiments.filter(e=>e.id!==id);if(d.activeId===id)d.activeId=d.experiments.find(e=>!e.archived)?.id??null;});}
  settings(values){this.transact(d=>Object.assign(d.settings,values));}
  import(input){const valid=normalizeCollection(input);if(!valid)throw new Error('备份文件格式不正确');this.transact(d=>{const ids=new Set(d.experiments.map(e=>e.id));let first=null;for(const e of valid.experiments){if(ids.has(e.id))e.id=`exp_${globalThis.crypto?.randomUUID?.()??Date.now()+'_'+Math.random().toString(36).slice(2)}`;ids.add(e.id);d.experiments.push(e);if(!first&&!e.archived)first=e.id;}if(first)d.activeId=first;else if(valid.draft&&!d.activeId){d.draft=valid.draft;d.draftName=valid.draftName;}});}
}
