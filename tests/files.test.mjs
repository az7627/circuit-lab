import assert from 'node:assert/strict';
import {test} from 'node:test';
import {serializeExperiment,parseExperiment,experimentFilename,importedExperimentName,EXPERIMENT_FILE_FORMAT} from '../dist/files.js';
import {component,createPreset} from '../dist/models.js';
import {ExperimentStore} from '../dist/experiments.js';

test('a single experiment file retains components, three-terminal wiring, camera, switch state and records',()=>{
  const state=createPreset('free');state.components=[component('e1','battery',100,100,6),{...component('d1','spdt',300,200),position:2,angle:180},component('l1','lamp',500,200,10)];state.wires=[{id:'w1',a:'e1:0',b:'d1:0'},{id:'w2',a:'d1:2',b:'l1:0',via:[{x:400,y:240}]},{id:'w3',a:'l1:1',b:'e1:1'}];state.view={x:-4000,y:5000,zoom:.8};state.records=[{experiment:'我的实验',voltage:6,current:.6,resistance:10,time:'12:34:56',createdAt:new Date().toISOString(),circuit:{components:state.components,wires:state.wires,junctions:[]}}];
  const before=JSON.stringify(state),text=serializeExperiment(state,'我的实验'),loaded=parseExperiment('\uFEFF'+text),file=JSON.parse(text);
  assert.equal(file.format,EXPERIMENT_FILE_FORMAT);assert.equal(file.version,1);assert.equal(loaded.name,'我的实验');assert.deepEqual(loaded.state.components,state.components);assert.deepEqual(loaded.state.wires,state.wires);assert.deepEqual(loaded.state.view,state.view);assert.deepEqual(loaded.state.records,state.records);assert.equal(JSON.stringify(state),before);assert.equal(file.experiments,undefined);assert.equal(file.settings,undefined);
});
test('invalid JSON, foreign files, unsupported versions and malformed circuits have clear load errors',()=>{
  assert.throws(()=>parseExperiment('not json'),/有效的实验 JSON/);assert.throws(()=>parseExperiment('{}'),/导出实验/);
  const file=JSON.parse(serializeExperiment(createPreset('series'),'测试'));file.version=99;assert.throws(()=>parseExperiment(JSON.stringify(file)),/版本/);file.version=1;file.state.wires[0].via=[null];assert.throws(()=>parseExperiment(JSON.stringify(file)),/电路或测量数据/);
  file.state=createPreset('free');file.name='';assert.throws(()=>parseExperiment(JSON.stringify(file)),/名称/);
});
test('loading a file as a new experiment preserves existing saved experiments, archives and the draft',()=>{
  let content=null;const storage={getItem:()=>content,setItem:(key,value)=>content=value},store=new ExperimentStore(storage),old=store.save(createPreset('series'),'同名实验');store.archive(old);store.recover(createPreset('ohm'),'现有草稿');
  const loaded=parseExperiment(serializeExperiment(createPreset('parallel'),'同名实验')),name=importedExperimentName(loaded.name,store.data.experiments),id=store.save(loaded.state,name,null,{preserveDraft:true});
  assert.notEqual(id,old);assert.equal(name,'同名实验（导入）');assert.equal(store.data.experiments.length,2);assert.equal(store.data.experiments.find(e=>e.id===old).archived,true);assert.equal(store.data.experiments.find(e=>e.id===old).state.preset,'series');assert.equal(store.data.draft.preset,'ohm');assert.equal(store.data.activeId,id);
  const reloaded=new ExperimentStore(storage);assert.equal(reloaded.data.experiments.find(e=>e.id===id).state.preset,'parallel');
});
test('filenames are portable and repeated imports receive distinct names within the name limit',()=>{
  const filename=experimentFilename('CON: /实验?<>');assert.ok(filename.endsWith('.json'));assert.ok(filename.startsWith('电路实验-'));assert.ok(!/[<>:"\/\\|?*\u0000-\u001f]/.test(filename));
  const base='名'.repeat(60),first=importedExperimentName(base,[{name:base}]),second=importedExperimentName(base,[{name:base},{name:first}]);assert.ok(first.length<=60&&second.length<=60);assert.notEqual(first,second);assert.ok(second.endsWith('（导入2）'));
});
test('export rejects incomplete state without changing the current document',()=>{
  const state={components:[]};assert.throws(()=>serializeExperiment(state,'测试'),/无法导出/);assert.deepEqual(state,{components:[]});
});
