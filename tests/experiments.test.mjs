import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPreset,component} from '../dist/models.js';
import {solveCircuit} from '../dist/solver.js';
import {normalizeState,pruneLayoutCaches} from '../dist/data.js';
import {ExperimentStore,EXPERIMENTS_KEY,normalizeCollection,saveErrorMessage} from '../dist/experiments.js';
import {convertView} from '../dist/layout.js';
import {panCamera,viewportGeometry,heaterAppearance,feedbackLevel} from '../dist/visuals.js';
import {bellLevel} from '../dist/audio.js';
class MemoryStorage{constructor(){this.values=new Map();this.fail=false;}getItem(k){return this.values.get(k)??null;}setItem(k,v){if(this.fail)throw new Error('QuotaExceeded');this.values.set(k,v);}}

test('appearance defaults to the system and explicit choices survive reload and backup normalization',()=>{
  const storage=new MemoryStorage(),store=new ExperimentStore(storage);
  assert.equal(store.data.settings.theme,'system');
  for(const theme of ['light','dark','system']){store.settings({theme});assert.equal(new ExperimentStore(storage).data.settings.theme,theme);assert.equal(normalizeCollection(JSON.parse(storage.getItem(EXPERIMENTS_KEY))).settings.theme,theme);}
  const old=JSON.parse(storage.getItem(EXPERIMENTS_KEY));delete old.settings.theme;assert.equal(normalizeCollection(old).settings.theme,'system');
  old.settings.theme='invalid';assert.equal(normalizeCollection(old).settings.theme,'system');
});
test('a saved experiment with two series cells reloads and reports the pack voltage and loop current',()=>{
  const state=createPreset('free');state.components=[component('e1','battery',100,100,1.5),component('e2','battery',250,100,1.5),component('r1','resistor',400,100,10)];state.wires=[{id:'w1',a:'e1:1',b:'e2:0'},{id:'w2',a:'e2:1',b:'r1:1'},{id:'w3',a:'r1:0',b:'e1:0'}];
  const storage=new MemoryStorage(),store=new ExperimentStore(storage);store.save(state,'两节电池串联');
  const saved=new ExperimentStore(storage).data.experiments[0].state,result=solveCircuit(saved.components,saved.wires);
  assert.equal(saved.components.filter(c=>c.type==='battery').length,2);assert.ok(Math.abs(result.sourceVoltage-3)<1e-9);assert.ok(Math.abs(result.current-.3)<1e-9);assert.ok(Math.abs(result.resistance-10)<1e-9);
});
test('experiment save, rename, archive, restore and reload retain circuit and measurements',()=>{
  const storage=new MemoryStorage(),store=new ExperimentStore(storage),state=createPreset('parallel');
  const id=store.save(state,'并联比较');store.rename(id,'我的并联实验');store.archive(id);
  assert.equal(store.data.experiments[0].archived,true);assert.equal(store.data.activeId,null);
  store.restore(id);store.activate(id);const reloaded=new ExperimentStore(storage);
  assert.equal(reloaded.data.experiments[0].name,'我的并联实验');assert.equal(reloaded.data.experiments[0].state.junctions.length,6);assert.equal(reloaded.data.activeId,id);
  reloaded.remove(id);assert.equal(new ExperimentStore(storage).data.experiments.length,0);
});
test('draft recovery does not add an unsolicited experiment to the saved list',()=>{
  const storage=new MemoryStorage(),store=new ExperimentStore(storage),state=createPreset('series');store.recover(state,'未保存的实验');
  const recovered=new ExperimentStore(storage);assert.equal(recovered.data.experiments.length,0);assert.equal(recovered.data.draft.components.length,6);
});
test('creating another experiment does not destroy an existing unsaved draft',()=>{
  const storage=new MemoryStorage(),store=new ExperimentStore(storage);store.recover(createPreset('series'),'保留的草稿');const id=store.save(createPreset('free'),'新实验',null,{preserveDraft:true});store.save(createPreset('parallel'),'新实验',id);
  const restored=new ExperimentStore(storage);assert.equal(restored.data.draft.components.length,6);assert.equal(restored.data.draftName,'保留的草稿');assert.equal(restored.data.experiments.length,1);
});
test('a failed write is transactional and does not report an experiment as saved',()=>{
  const storage=new MemoryStorage(),store=new ExperimentStore(storage);store.save(createPreset('free'),'已有实验');const old=JSON.stringify(store.data);
  storage.fail=true;assert.throws(()=>store.save(createPreset('series'),'失败实验'),/Quota/);assert.equal(JSON.stringify(store.data),old);
});

test('deleting a converted component discards stale cache wiring and still saves both views',()=>{
  for(const mode of ['physical','schematic']){
    const state=createPreset('series');convertView(state,'physical');if(mode==='schematic')convertView(state,mode);
    state.components=state.components.filter(c=>c.id!=='l1');state.wires=state.wires.filter(w=>!w.a.startsWith('l1:')&&!w.b.startsWith('l1:'));
    assert.equal(normalizeState(state),null,'the old cache referenced the deleted lamp');
    const poses=structuredClone(state.layouts[mode==='physical'?'schematic':'physical'].poses);delete poses.l1;pruneLayoutCaches(state);assert.ok(normalizeState(state));
    assert.deepEqual(state.layouts[mode==='physical'?'schematic':'physical'].poses,poses,'surviving hand placement stays available');
    const storage=new MemoryStorage(),store=new ExperimentStore(storage);store.save(state,'删元件后继续实验');
    const restored=new ExperimentStore(storage).data.experiments[0].state;assert.ok(restored.components.every(c=>c.id!=='l1'));assert.equal(restored.viewMode,mode);
    convertView(restored,mode==='physical'?'schematic':'physical');assert.ok(normalizeState(restored));
  }
});

test('invalid circuit data is distinguished from quota and permission failures before writing',()=>{
  const storage=new MemoryStorage(),store=new ExperimentStore(storage);store.save(createPreset('series'),'原有实验');const before=storage.getItem(EXPERIMENTS_KEY),invalid=createPreset('free');invalid.wires=[{id:'w1',a:'missing:0',b:'missing:1'}];
  pruneLayoutCaches(invalid);assert.equal(normalizeState(invalid),null,'cache repair must never hide a broken active circuit');
  assert.throws(()=>store.recover(invalid),error=>error.name==='ExperimentDataError'&&saveErrorMessage(error).includes('校验未通过')&&!saveErrorMessage(error).includes('空间不足'));
  assert.equal(storage.getItem(EXPERIMENTS_KEY),before);
  for(const name of ['QuotaExceededError','SecurityError']){
    const error=Object.assign(new Error('storage failure'),{name});storage.setItem=()=>{throw error;};
    assert.throws(()=>store.recover(createPreset('free')),caught=>caught===error);assert.equal(storage.getItem(EXPERIMENTS_KEY),before);assert.equal(store.data.experiments[0].state.components.length,6);
    assert.match(saveErrorMessage(error),name==='QuotaExceededError'?/为此应用分配的存储空间不足/:/阻止.*本地存储/);
  }
});
test('separate editor instances do not overwrite each others experiment lists',()=>{
  const storage=new MemoryStorage(),a=new ExperimentStore(storage),b=new ExperimentStore(storage);a.save(createPreset('series'),'A');b.save(createPreset('parallel'),'B');
  const current=new ExperimentStore(storage);assert.equal(current.data.experiments.length,2);assert.deepEqual(new Set(current.data.experiments.map(e=>e.name)),new Set(['A','B']));
});
test('coordinates and bent wires remain valid far beyond the initial canvas in all directions',()=>{
  const state=createPreset('series');state.components[0].x=-24000;state.components[0].y=19000;state.wires[0].via=[{x:-32000,y:-25000}];state.junctions.push({id:'n999',x:38000,y:-39000});state.view={x:-20000,y:20000,zoom:.2};
  assert.ok(normalizeState(state));const storage=new MemoryStorage(),store=new ExperimentStore(storage);store.save(state,'远处的实验');const restored=new ExperimentStore(storage).data.experiments[0].state;
  assert.equal(restored.components[0].x,-24000);assert.equal(restored.junctions[0].y,-39000);assert.equal(restored.view.x,-20000);
});
test('importing a backup merges documents without deleting the existing collection',()=>{
  const storage=new MemoryStorage(),store=new ExperimentStore(storage);const id=store.save(createPreset('series'),'原有实验');const backup=JSON.parse(storage.getItem(EXPERIMENTS_KEY));
  store.import(backup);assert.equal(store.data.experiments.length,2);assert.equal(store.data.experiments[0].id,id);assert.notEqual(store.data.experiments[1].id,id);
});
test('blank canvas panning is unbounded and scales pointer movement correctly',()=>{
  assert.deepEqual(panCamera({x:420,y:255},2000,-1800,.5),{x:-3580,y:3855});const v=viewportGeometry({x:-3580,y:3855},1,{width:840,height:510});
  assert.equal(v.x,-4000);assert.equal(v.y,3600);assert.equal(v.scale,1);
});
test('bell volume, fan speed input and heater intensity increase with power and stay bounded',()=>{
  for(const level of [bellLevel,feedbackLevel]){assert.equal(level(0),0);assert.ok(level(.1)<level(3));assert.ok(level(3)<level(30));assert.ok(level(1e6)<=1);}
  const dim=heaterAppearance(.1),bright=heaterAppearance(30);assert.notEqual(dim.color,bright.color);assert.ok(dim.opacity<bright.opacity);assert.ok(bright.opacity<=.45);assert.ok(bright.width<=4);
});
