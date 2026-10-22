import {normalizeState} from './data.js?v=2.4';
export const EXPERIMENT_FILE_FORMAT='circuit-lab-experiment';
export function serializeExperiment(state,name){
  const normalized=normalizeState(state);if(!normalized)throw new Error('实验内容不完整，暂时无法导出。');
  const title=String(name??'').trim().slice(0,60)||'我的电路实验';
  return JSON.stringify({format:EXPERIMENT_FILE_FORMAT,version:1,name:title,exportedAt:new Date().toISOString(),state:normalized},null,2);
}
export function parseExperiment(text){
  let data;try{data=JSON.parse(String(text).replace(/^\uFEFF/,''));}catch{throw new Error('文件无法读取，请选择有效的实验 JSON 文件。');}
  if(data?.format!==EXPERIMENT_FILE_FORMAT)throw new Error('请选择「导出实验」生成的文件；整体备份请在设置中导入。');
  if(data.version!==1)throw new Error('实验文件版本暂不支持。');
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>60)throw new Error('实验文件中的名称不正确。');
  let state=null;try{state=normalizeState(data.state);}catch{}if(!state)throw new Error('实验文件中的电路或测量数据不完整。');
  return {name:data.name.trim(),state};
}
export function experimentFilename(name){
  const safe=String(name??'').trim().replace(/[<>:"\/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,60)||'我的电路实验';
  return '电路实验-'+safe+'.json';
}
export function importedExperimentName(name,experiments){
  const base=String(name).trim().slice(0,60),used=new Set(experiments.map(e=>e.name));let candidate=base,index=1;
  while(used.has(candidate)){const suffix='（导入'+(index===1?'':index)+'）';candidate=base.slice(0,60-suffix.length)+suffix;index++;}
  return candidate;
}
