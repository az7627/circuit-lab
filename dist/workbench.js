import {convertView,routeCircuit,moveItem} from './layout.js?v=2.7';
import {isMeter,meterConnection,meterScale,visibleTerminals,terminalLabel} from './meters.js?v=2.6';
import {definitions,component,createPreset} from './models.js?v=2.6';
import {symbol,thumbnail} from './symbols.js?v=2.9.1';
import {physicalSymbol,physicalThumbnail,physicalHitBounds,physicalLabelOffset,physicalBounds} from './physical.js?v=2.9.1';
import {icons,icon} from './icons.js?v=2.9.0';
import {componentTerminal,componentBounds,componentHitBounds,labelOffset,fitCamera,viewportGeometry,panCamera} from './visuals.js?v=2.6';
import {wirePoints,projectOnWire,splitWire,simplifyTrace,tracedRoute,nearestConnection} from './wiring.js?v=2.6';
import {clone,normalizeState,pruneLayoutCaches} from './data.js?v=2.6';
import {ExperimentStore,normalizeCollection,saveErrorMessage} from './experiments.js?v=2.9.0';
import {BellAudio} from './audio.js?v=2.6';
import {RotorMotion} from './motion.js?v=2.6';
import {serializeExperiment,parseExperiment,experimentFilename,importedExperimentName} from './files.js?v=2.6';
import {saveFile,androidSystemBars,systemDesktop} from './platform.js?v=2.9.1';
import {zoomView,startPinch,movePinch} from './camera.js';
import {schematicJunctionDots} from './connections.js';
import {CircuitSimulation} from './simulation.js';
import {bindLibraryDrag} from './library-drag.js';

if(location.protocol==='circuit:'||globalThis.Capacitor?.getPlatform?.()==='android'){
  document.querySelector('.settings-backup p').textContent='实验保存在当前设备。导出备份可保留全部实验与归档内容。';
}

Object.assign(icons,{redo:'<path d="M21 7H10a7 7 0 0 0 0 14h3m8-14-5-5m5 5-5 5"/>',settings:'<path d="m9 5-1 3-3 1 1 3-1 3 3 1 1 3h6l1-3 3-1-1-3 1-3-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/>',pencil:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',save:'<path d="M4 3h13l4 4v14H3V3h1Zm3 0v6h9V3M7 21v-8h10v8"/>',archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8m-10 4h6"/>',restore:'<path d="M3 9a9 9 0 1 1 2 9M3 3v6h6M12 8v8m-3-3 3 3 3-3"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>'});
const $=id=>document.getElementById(id),svgNS='http://www.w3.org/2000/svg';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fixed=(n,d=2)=>Number.isFinite(n)?(n!==0&&Math.abs(n)<.01?n.toPrecision(2):n.toFixed(d)):'—';
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let storage;try{storage=localStorage;}catch(error){storage={getItem:()=>null,setItem:()=>{throw error;}};}
const store=new ExperimentStore(storage);
const simulation=new CircuitSimulation();
let legacy=null;try{legacy=normalizeState(JSON.parse(storage.getItem('circuit-lab-v1')));}catch{}
let activeId=store.data.activeId,draftName=store.data.draftName;
let state=clone(store.data.experiments.find(e=>e.id===activeId)?.state??store.data.draft??legacy??createPreset('free'));
state=normalizeState(state);prepareRoutes();let camera={x:state.view.x,y:state.view.y},zoom=state.view.zoom;
let selected=null,tool='select',pendingTerminal=null,pendingTrace=[],lastPointer=null,solution,history=[],redo=[],gesture=null;
let saveTimer,toastTimer,confirmCallback,nameCallback,menuId=null,fullscreenFocus=null,activeGuide='help';
let lastSaveError=null,audioStatus='closed';
let cameraAnimation=null,pinch=null,pendingTouch=null;
let nativeFullscreen=false,fullscreenBusy=false;
let nativeSystemDark=globalThis.circuitLabNativeDark??null;
const touchPoints=new Map(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)'),systemTheme=matchMedia('(prefers-color-scheme: dark)'),compactProperties=matchMedia('(max-width:1180px), (max-height:650px)');
const rotors=new Map();let fanFrame=null;
let lastSwitchClick=null;
function renderAudioState(){const el=$('audioState');el.dataset.audioState=audioStatus;el.textContent=!store.data.settings.sound?'电铃声音已关闭。':{running:'声音已就绪；响度与敲击频率随供电变化。',suspended:'点击工作台即可启用电铃声音。',closed:'点击工作台即可启用电铃声音。',unavailable:'此浏览器暂不支持声音反馈。',blocked:'点击工作台后重新启用声音。'}[audioStatus]??'点击工作台后，通电的电铃会响。';}
const audio=new BellAudio(status=>{audioStatus=status;renderAudioState();});
function unlockAudio(event){if(event.target.closest('#soundSetting')&&store.data.settings.sound)return;audio.unlock();}
document.addEventListener('pointerdown',unlockAudio,{capture:true});document.addEventListener('keydown',unlockAudio,{capture:true});
function getComponent(id){return state.components.find(c=>c.id===id);}function getJunction(id){return state.junctions.find(n=>n.id===id);}function getItem(id){return getComponent(id)??getJunction(id);}function getWire(id){return state.wires.find(w=>w.id===id);}
function label(c){return definitions[c.type].prefix+(c.id.match(/\d+/)?.[0]??'');}
function title(){return store.data.experiments.find(e=>e.id===activeId)?.name??draftName;}
function snapshot(){return {...pruneLayoutCaches(clone(state)),view:{...camera,zoom}};}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function animateSurface(el){if(!reducedMotion.matches)el.animate([{opacity:.55},{opacity:1}],{duration:180,easing:'ease-out'});}
function persist(){clearTimeout(saveTimer);if(!activeId)return true;try{store.data.activeId=activeId;store.recover(snapshot(),draftName);lastSaveError=null;return true;}catch(error){const message=saveErrorMessage(error);if(message!==lastSaveError){toast(message);lastSaveError=message;}return false;}}
function saveSoon(){clearTimeout(saveTimer);if(activeId)saveTimer=setTimeout(persist,180);}
function openDialog(id){const el=$(id),parent=document.fullscreenElement??document.body;if(el.parentElement!==parent)parent.append(el);if(!el.open)el.showModal();}
function confirmAction(name,description,callback,button='确认删除'){ $('confirmTitle').textContent=name;$('confirmDescription').textContent=description;$('confirmAction').textContent=button;confirmCallback=callback;openDialog('confirmDialog');}
function askName(name,value,callback,button='确定'){ $('nameTitle').textContent=name;$('experimentNameInput').value=value;$('nameSubmit').textContent=button;nameCallback=callback;openDialog('nameDialog');$('experimentNameInput').focus();$('experimentNameInput').select();}
function tryStore(action){try{if(!persist())return false;action();renderSidebar();renderTitle();renderArchives();return true;}catch(error){toast(saveErrorMessage(error));return false;}}
function renderTitle(){$('activeExperimentName').textContent=activeId?title():'未选择实验';renderAvailability();}
function renderAvailability(){const active=!!activeId;$('workspace').hidden=!active;$('emptyWorkspace').hidden=active;document.body.classList.toggle('no-experiment',!active);if(!active){audio.silence();stopFanFrames();setHeaderExpanded(true,{persist:false});}syncLayoutControls();requestAnimationFrame(()=>{updateDock();fitHeader();});}
function renderSidebar(){
  const items=store.data.experiments.filter(e=>!e.archived);
  $('experimentList').innerHTML=items.length?items.map(e=>`<div class="saved-experiment ${e.id===activeId?'active':''}"><button class="open-experiment" data-open-experiment="${e.id}" title="${esc(e.name)}">${icon('flask')}<span>${esc(e.name)}</span></button><button class="experiment-more" data-doc-menu="${e.id}" aria-label="管理实验 ${esc(e.name)}">${icon('more')}</button></div>`).join(''):`<div class="experiment-empty">${icon('notebook')}<strong>你的实验，从这里开始</strong><p>点击上方 + 创建新实验，<br>或导入已有实验。</p></div>`;
}
function newExperiment(){askName('新增实验',`新实验 ${store.data.experiments.length+1}`,name=>{if(!tryStore(()=>{activeId=store.save({...createPreset('free'),view:{x:420,y:255,zoom:1}},name,null,{preserveDraft:true});}))return;restoreState(store.data.experiments.find(e=>e.id===activeId).state);closeSidebarOnNarrowScreens();toast('新的实验空间已准备好');},'创建');}
function renameExperiment(id=activeId){const name=id?store.data.experiments.find(e=>e.id===id)?.name:draftName;askName('重命名实验',name,newName=>{if(id)tryStore(()=>store.rename(id,newName));else{draftName=newName;renderTitle();saveSoon();}toast('实验已重命名');},'确定');}
function openExperiment(id){if(!tryStore(()=>{store.activate(id);activeId=id;}))return;restoreState(store.data.experiments.find(e=>e.id===id).state);closeSidebarOnNarrowScreens();}
function archiveExperiment(id){const wasActive=activeId===id;if(!tryStore(()=>store.archive(id)))return;if(wasActive){activeId=store.data.activeId;if(!activeId)draftName=store.data.draft?store.data.draftName:'未保存的实验';restoreState(store.data.experiments.find(e=>e.id===activeId)?.state??store.data.draft??createPreset('free'));}toast('实验已归档，可在设置中恢复');}
function deleteExperiment(id){const e=store.data.experiments.find(e=>e.id===id);if(!e)return;confirmAction(`删除「${e.name}」？`,'这将删除该实验的电路、测量记录与归档内容。请确认已保留需要的备份。',()=>{const wasActive=activeId===id;if(!tryStore(()=>store.remove(id)))return;if(wasActive){activeId=store.data.activeId;if(!activeId)draftName=store.data.draft?store.data.draftName:'未保存的实验';restoreState(store.data.experiments.find(e=>e.id===activeId)?.state??store.data.draft??createPreset('free'));}toast('实验已删除');});}
function resetGestures(){libraryDrag.cancel();gesture=null;pinch=null;pendingTouch=null;touchPoints.clear();$('boardWrap').classList.remove('is-panning');}
function restoreState(value){simulation.reset();stopCameraAnimation();resetGestures();state=normalizeState(value)??normalizeState(createPreset('free'));prepareRoutes();camera={x:state.view.x,y:state.view.y};zoom=state.view.zoom;history=[];redo=[];selected=null;pendingTerminal=null;setTool('select');update();renderSidebar();renderTitle();animateSurface($('workspace'));saveSoon();}
function renderArchives(){const items=store.data.experiments.filter(e=>e.archived);$('archiveCount').textContent=items.length;$('archivedList').innerHTML=items.length?items.map(e=>`<div class="archived-experiment"><div>${icon('archive')}<strong>${esc(e.name)}</strong></div><button class="button secondary" data-restore-experiment="${e.id}">${icon('restore')}恢复</button><button class="tool-button danger-action" data-delete-experiment="${e.id}" aria-label="删除归档实验 ${esc(e.name)}">${icon('trash')}</button></div>`).join(''):'<div class="archive-empty">还没有归档实验。归档后的实验会保留电路和数据，随时可以恢复。</div>';}
function setSettingsTab(tab){document.querySelectorAll('[data-settings-tab]').forEach(el=>el.classList.toggle('active',el.dataset.settingsTab===tab));$('preferencesPanel').hidden=tab!=='preferences';$('archivedPanel').hidden=tab!=='archived';renderArchives();animateSurface($(tab==='preferences'?'preferencesPanel':'archivedPanel'));}
function pushHistory(before=state){history.push(clone(before));if(history.length>80)history.shift();redo=[];updateHistoryButtons();}
function updateHistoryButtons(){$('undoButton').disabled=!history.length;$('redoButton').disabled=!redo.length;}
function restoreHistory(next){simulation.reset();const records=state.records,showCurrent=state.showCurrent,viewMode=state.viewMode;state=clone(next);state.records=records;state.showCurrent=showCurrent;if(state.viewMode!==viewMode)convertView(state,viewMode);cancelWire();gesture=null;if(!getItem(selected)&&!getWire(selected))selected=null;update({route:false});}
function undoAction(){if(!history.length)return;redo.push(clone(state));restoreHistory(history.pop());toast('已撤销');}
function redoAction(){if(!redo.length)return;history.push(clone(state));restoreHistory(redo.pop());toast('已重做');}
function terminalPoint(key){const [id,index]=key.split(':');const c=getComponent(id);return c?componentTerminal(c,Number(index),state.viewMode):getJunction(id)??{x:0,y:0};}
function pointFromEvent(event){const p=$('board').createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform($('board').getScreenCTM().inverse());}
function updateViewport(){
  const rect=$('boardWrap').getBoundingClientRect();if(!rect.width||!rect.height)return;const v=viewportGeometry(camera,zoom,rect);
  $('board').setAttribute('viewBox',`${v.x} ${v.y} ${v.width} ${v.height}`);$('board').dataset.cameraX=camera.x;$('board').dataset.cameraY=camera.y;$('board').dataset.zoom=zoom;$('zoomLabel').textContent=`${Math.round(zoom*100)}%`;
  let step=20*v.scale;while(step<10)step*=2;while(step>48)step/=2;
  $('boardWrap').style.backgroundSize=`${step}px ${step}px`;$('boardWrap').style.backgroundPosition=`${(rect.width/2-camera.x*v.scale)%step}px ${(rect.height/2-camera.y*v.scale)%step}px`;
}
function stopCameraAnimation(){if(cameraAnimation)cancelAnimationFrame(cameraAnimation.frame);cameraAnimation=null;}
function applyView(view){camera={x:view.x,y:view.y};zoom=view.zoom;updateViewport();}
function animateView(next,at=null){
  stopCameraAnimation();if(reducedMotion.matches){applyView(next);saveSoon();return;}
  const from={...camera,zoom},started=performance.now(),viewport=$('boardWrap').getBoundingClientRect();
  const animation={next,frame:null};cameraAnimation=animation;
  const frame=now=>{if(cameraAnimation!==animation)return;const progress=Math.min(1,(now-started)/210),t=1-(1-progress)**3,z=Math.exp(Math.log(from.zoom)+(Math.log(next.zoom)-Math.log(from.zoom))*t);applyView(at?zoomView(from,z,viewport,at):{x:from.x+(next.x-from.x)*t,y:from.y+(next.y-from.y)*t,zoom:z});if(progress<1)animation.frame=requestAnimationFrame(frame);else{cameraAnimation=null;applyView(next);saveSoon();}};
  animation.frame=requestAnimationFrame(frame);
}
function setZoom(value,at=null){if(!activeId||pinch)return;const point=at?{x:at.clientX,y:at.clientY}:null;animateView(zoomView({...camera,zoom},value,$('boardWrap').getBoundingClientRect(),point),point);}
function fitAll(){if(!activeId)return;const points=[];for(const c of state.components){const b=state.viewMode==='physical'?physicalBounds(c):componentBounds(c);points.push({x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height});}for(const n of state.junctions)points.push({x:n.x-12,y:n.y-12},{x:n.x+12,y:n.y+12});for(const w of state.wires)points.push(...wirePoints(w,terminalPoint,state.viewMode));let bounds=null;if(points.length){let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}bounds={x,y,width:right-x,height:bottom-y};}const rect=$('boardWrap').getBoundingClientRect(),next=fitCamera(bounds,rect);animateView(next);}
function recompute(elapsed=0){solution=elapsed?simulation.advance(state.components,state.wires,state.junctions,elapsed*(state.simulationRate??1)):simulation.read(state.components,state.wires,state.junctions);const blown=state.components.filter(c=>c.type==='fuse'&&!c.blown&&Math.abs(solution.components[c.id]?.current??0)>c.value+1e-9);if(blown.length){blown.forEach(c=>c.blown=true);solution=simulation.read(state.components,state.wires,state.junctions);toast(`${blown.map(label).join('、')} 已熔断，请检查电路后更换。`);}}
function fan(c,reading){const level=Math.min(1,Math.abs(reading?.backEmf??0)/6),active=level>1e-9&&store.data.settings.motion,duration=2.3-1.7*level,now=performance.now();let rotor=rotors.get(c.id);if(!rotor){rotor=new RotorMotion(now);rotors.set(c.id,rotor);}rotor.setSpeed(active?((reading?.backEmf??0)<0?-1:1)*360/duration:0,now);const blade='<path d="M0-2C-5-14 0-24 9-21C17-17 11-5 2-1Z"/>';return `<g class="fan-position" transform="translate(${c.x} ${c.y})"><g class="motor-fan ${active?'active':''}" data-motor-id="${c.id}" transform="rotate(${rotor.angle})" style="opacity:${.16+.43*level}">${blade}${blade.replace('<path ','<path transform="rotate(120)" ')}${blade.replace('<path ','<path transform="rotate(240)" ')}<circle r="3"/></g></g>`;}
function animateFans(time){fanFrame=null;let moving=false;for(const el of $('board').querySelectorAll('.motor-fan.active')){const rotor=rotors.get(el.dataset.motorId);if(rotor){el.setAttribute('transform',`rotate(${rotor.advance(time)})`);moving=true;}}if(moving&&!document.hidden)fanFrame=requestAnimationFrame(animateFans);}
function startFanFrames(){if(activeId&&fanFrame===null&&!document.hidden&&$('board').querySelector('.motor-fan.active'))fanFrame=requestAnimationFrame(animateFans);}
function stopFanFrames(){if(fanFrame!==null)cancelAnimationFrame(fanFrame);fanFrame=null;}
function renderBoard(){
  const physical=state.viewMode==='physical';
  const focused=document.activeElement,selector=focused?.dataset.terminal?`[data-terminal="${focused.dataset.terminal}"]`:focused?.dataset.component?`[data-component="${focused.dataset.component}"]`:focused?.dataset.wire?`[data-wire="${focused.dataset.wire}"]`:null;
  const defs='<defs><radialGradient id="lampGlow"><stop offset="0" stop-color="#ffd477" stop-opacity=".9"/><stop offset=".55" stop-color="#ffde9b" stop-opacity=".3"/><stop offset="1" stop-color="#ffe69b" stop-opacity="0"/></radialGradient></defs>';
  const components=state.components.map(c=>{const d=definitions[c.type],reading=solution.components[c.id],box=physical?physicalHitBounds(c):componentHitBounds(c),l=physical?physicalLabelOffset(c):labelOffset(c),detail=c.type==='fuse'&&c.blown?'已熔断':d.unit?`${c.value} ${d.unit}`:c.type==='switch'?(c.closed?'闭合':'断开'):c.type==='spdt'?`接通支路 ${c.position}`:`${fixed(reading?.[c.type==='ammeter'?'current':'voltage']??0)} ${c.type==='ammeter'?'A':'V'}`,appearance={power:Math.abs(reading?.power??0),current:reading?.current??0,voltage:reading?.voltage??0,motion:store.data.settings.motion,time:performance.now()/1000,range:isMeter(c.type)?meterConnection(c,state.wires).range:undefined};return `<g class="component-group ${selected===c.id?'selected':''}" data-component="${c.id}" role="button" tabindex="0" aria-label="${d.name} ${label(c)}，${detail}"><rect class="component-hit" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="transparent"/><rect class="component-outline" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8"/><g class="${physical?'physical-symbol':'component-symbol'}" transform="translate(${c.x} ${c.y}) rotate(${c.angle})${physical&&c.physicalFlip?' scale(-1 1)':''}">${physical?physicalSymbol(c,appearance):symbol(c,appearance)}</g>${c.type==='motor'?fan(c,reading)+(physical?'':`<text class="motor-letter" x="${c.x}" y="${c.y+8}">M</text>`):''}${!physical&&['ammeter','voltmeter'].includes(c.type)?`<text class="meter-letter" x="${c.x}" y="${c.y+8}">${c.type==='ammeter'?'A':'V'}</text>`:''}<text class="component-name" x="${c.x+l.x+(physical?-24:0)}" y="${c.y+l.y}">${label(c)}</text><text class="component-value" x="${c.x+l.x+(physical?15:0)}" y="${c.y+l.y+(physical?0:18)}">${detail}</text></g>`;}).join('');
  const wires=state.wires.map((w,index)=>{const points=wirePoints(w,terminalPoint,state.viewMode),path=points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '),current=solution.wires[w.id]??0,hits=points.slice(1).map((p,i)=>{const a=points[i];return `<rect class="wire-segment-hit" width="${Math.hypot(p.x-a.x,p.y-a.y)}" height="14" y="-7" transform="translate(${a.x} ${a.y}) rotate(${Math.atan2(p.y-a.y,p.x-a.x)*180/Math.PI})"/>`;}).join(''),color=['#ce6b59','#597da9','#659185','#b68b51'][index%4];return `<g data-wire="${w.id}" role="button" tabindex="0" aria-label="导线 ${w.id}" style="--wire-color:${color}">${hits}${physical?`<path class="physical-wire-shadow" d="${path}"/>`:''}<path class="wire-base ${selected===w.id?'selected':''}" d="${path}"/>${physical?`<path class="physical-wire-highlight" d="${path}"/>`:''}<path class="wire-hit" d="${path}"/>${state.showCurrent&&Math.abs(current)>1e-8?`<path class="wire-flow ${current<0?'reverse':''}" d="${path}"/>`:''}</g>`;}).join('');
  const connectedPorts=new Set(state.wires.flatMap(w=>[w.a,w.b]));
  const terminals=state.components.map(c=>visibleTerminals(c,state.wires,state.viewMode).map(i=>{const key=`${c.id}:${i}`,p=terminalPoint(key);return `<g class="terminal-group ${connectedPorts.has(key)?'connected':''} ${selected===c.id?'owner-selected':''}" data-terminal="${key}" data-owner-component="${c.id}" role="button" tabindex="0" aria-label="${label(c)} ${terminalLabel(c,i,state.wires,state.viewMode)}"><circle class="terminal-hit" cx="${p.x}" cy="${p.y}" r="12"/><circle class="terminal ${pendingTerminal===key?'pending':''}" cx="${p.x}" cy="${p.y}" r="4.5"/>${isMeter(c.type)&&!physical?`<text class="battery-polarity" x="${p.x+(c.angle%180===90?10:0)}" y="${p.y-10}" text-anchor="middle">${i===1?'−':'+'}</text>`:''}</g>`;}).join('')).join('');
  const dots=physical?'':schematicJunctionDots(state,terminalPoint).map(p=>`<circle class="connection-dot" cx="${p.x}" cy="${p.y}" r="3.5"/>`).join('');
  const nodes=state.junctions.map(n=>`<g class="junction-group ${selected===n.id?'selected':''}" data-junction="${n.id}" data-terminal="${n.id}:0" role="button" tabindex="0" aria-label="接线节点 ${n.id.toUpperCase()}"><circle class="junction-hit" cx="${n.x}" cy="${n.y}" r="14"/><circle class="junction-ring" cx="${n.x}" cy="${n.y}" r="11"/><circle class="${physical?'junction-dot':'junction-anchor'} ${pendingTerminal===`${n.id}:0`?'pending':''}" cx="${n.x}" cy="${n.y}" r="5"/></g>`).join('');
  const empty=!state.components.length&&!state.junctions.length?`<g class="empty-board"><text class="canvas-empty" x="${camera.x}" y="${camera.y-15}">一个想法，一次新的实验。</text><text class="canvas-empty" x="${camera.x}" y="${camera.y+15}" style="font-size:11px">添加元件开始搭建 · 拖动空白处自由探索</text></g>`:'';
  $('board').innerHTML=defs+`<g data-layer="components">${components}</g><g data-layer="wires">${wires}</g><g data-layer="terminals">${terminals}${nodes}${dots}</g><path id="wirePreview" class="wire-preview"/>`+empty;
  $('board').dataset.tool=tool;$('board').dataset.viewMode=state.viewMode;$('board').dataset.activeBells=state.components.filter(c=>c.type==='bell'&&Math.abs(solution.components[c.id]?.power??0)>1e-9).length;
  for(const id of rotors.keys())if(getComponent(id)?.type!=='motor')rotors.delete(id);startFanFrames();
  updateViewport();renderPreview();if(selector)$('board').querySelector(selector)?.focus({preventScroll:true});
}
function renderPreview(){const el=$('wirePreview');if(!el)return;if(pendingTerminal&&lastPointer){const p=terminalPoint(pendingTerminal);el.setAttribute('d',state.viewMode==='physical'?[p,...pendingTrace,lastPointer].map((v,i)=>`${i?'L':'M'}${v.x} ${v.y}`).join(' '):`M${p.x} ${p.y}H${lastPointer.x}V${lastPointer.y}`);}else el.setAttribute('d','');}
function renderReadings(){renderPhysics();const reading=solution.components[selected];if($('selectedVoltage'))$('selectedVoltage').textContent=fixed(getJunction(selected)?solution.nodes[`${selected}:0`]:reading?.voltage??0)+' V';if($('selectedCurrent'))$('selectedCurrent').textContent=fixed(reading?.current??0)+' A';if($('selectedPower'))$('selectedPower').textContent=fixed(Math.abs(reading?.power??0))+' W';}
function updatePropertiesTitle(){
  const c=getComponent(selected),n=getJunction(selected),w=getWire(selected);
  $('propertiesTitle').textContent=compactProperties.matches?(c?definitions[c.type].name+label(c):n?'接线节点 '+n.id.toUpperCase():w?'导线 '+w.id.toUpperCase():'元件属性'):(c?'元件属性':n?'节点属性':'导线属性');
}
compactProperties.addEventListener('change',updatePropertiesTitle);
function renderProperties(){
  const panel=$('componentProperties'),c=getComponent(selected),n=getJunction(selected),w=getWire(selected);
  const hasSelection=!!(c||n||w);$('propertiesSection').hidden=!hasSelection;$('inspector').hidden=!hasSelection;updatePropertiesTitle();
  if(panel.dataset.selection!==String(selected)){panel.dataset.selection=String(selected);if((c||n||w)&&!reducedMotion.matches)panel.animate([{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});}
  if(n){const count=state.wires.filter(w=>w.a===`${n.id}:0`||w.b===`${n.id}:0`).length;panel.innerHTML=`<div class="selected-info"><span class="selected-icon">${icon('junction')}</span><div><strong>接线节点 ${n.id.toUpperCase()}</strong></div></div><div class="junction-property">已连接 <b>${count}</b> 条导线<br>X ${fixed(n.x,0)} · Y ${fixed(n.y,0)}<br>对电源负极电位 <b id="selectedVoltage">—</b></div><p class="node-instructions">选择模式可拖动节点。导线工具下，点击或拖动此节点开始连接。</p><div class="property-actions"><button id="startNodeWire">${icon('junction')}从此节点连接</button><button id="deleteSelected">${icon('trash')}删除</button></div>`;$('startNodeWire').onclick=()=>{setTool('junction');beginWire(`${n.id}:0`);};$('deleteSelected').onclick=()=>deleteSelected();renderReadings();return;}
  if(w){panel.innerHTML=`<div class="selected-info"><span class="selected-icon">${icon('wire')}</span><div><strong>导线</strong></div></div><p class="node-instructions">使用接线节点工具点击导线，可以插入分支节点。普通导线交叉不会自动接通。</p><div class="property-actions"><button id="insertNodeTool">${icon('junction')}接线节点</button><button id="deleteSelected">${icon('trash')}删除导线</button></div>`;$('insertNodeTool').onclick=()=>setTool('junction');$('deleteSelected').onclick=()=>deleteSelected();return;}
  if(!c){panel.replaceChildren();return;}
  const d=definitions[c.type],parameter={battery:['电源电动势','E'],capacitor:['电容量','C'],inductor:['电感量','L'],fuse:['额定电流','I'],rheostat:['最大阻值','R'],motor:['线圈电阻','r'],led:['正向压降','U']}[c.type]??['电阻值','R'];
  panel.innerHTML=`<div class="selected-info"><span class="selected-icon">${partThumbnail(c.type,'inspector')}</span><div><strong>${d.name} ${label(c)}</strong></div></div>`+(d.unit?`<div class="property-label"><span>${parameter[0]}</span><b>${parameter[1]}</b></div><label class="value-input"><input id="propertyNumber" type="number" min="${d.min}" max="${d.max}" step="${d.step}" value="${c.value}" aria-label="${d.name} ${label(c)} ${parameter[0]}"><span>${d.unit}</span></label><input id="propertyRange" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${c.value}" aria-label="滑动调整${d.name}"><div class="range-labels"><span>${d.min} ${d.unit}</span><span>${d.max} ${d.unit}</span></div>`:c.type==='switch'?`<button id="switchToggle" class="switch-action">${c.closed?'断开开关':'闭合开关'}</button>`:c.type==='spdt'?`<div class="property-label"><span>接通支路</span><b>C → ${c.position}</b></div><div class="spdt-options" role="group" aria-label="双掷开关接通支路">${[1,2].map(position=>`<button class="switch-action ${c.position===position?'active':''}" data-spdt-position="${position}" aria-pressed="${c.position===position}">公共端 → ${position}</button>`).join('')}</div>`:'')+(c.type==='fuse'&&c.blown?'<button id="replaceFuse" class="switch-action">更换保险丝</button>':'')+`<div class="component-readings"><span>U<b id="selectedVoltage">—</b></span><span>I<b id="selectedCurrent">—</b></span></div><div class="component-power">电功率 <b id="selectedPower">—</b></div><div class="property-actions"><button id="rotateComponent">${icon('rotate')}旋转 90°</button><button id="deleteSelected">${icon('trash')}删除</button></div>`;
  $('rotateComponent').onclick=()=>{const before=clone(state);pushHistory();moveItem(state,c.id,{angle:(c.angle+90)%360},before);update({route:false});};$('deleteSelected').onclick=()=>deleteSelected();
  document.querySelectorAll('[data-spdt-position]').forEach(button=>button.onclick=()=>{if(c.position!==Number(button.dataset.spdtPosition))toggleSwitch(c.id);});
  if($('switchToggle'))$('switchToggle').onclick=()=>toggleSwitch(c.id);if($('replaceFuse'))$('replaceFuse').onclick=()=>{pushHistory();c.blown=false;update();};
  if(d.unit){let before=null;for(const id of ['propertyNumber','propertyRange']){const input=$(id);input.addEventListener('focus',()=>before=clone(state));input.addEventListener('pointerdown',()=>before=clone(state));input.addEventListener('input',()=>{const v=Number(input.value);if(input.value===''||!Number.isFinite(v)||v<d.min||v>d.max)return;if(!before)before=clone(state);c.value=Math.round(v*100)/100;$(id==='propertyNumber'?'propertyRange':'propertyNumber').value=c.value;recompute();renderBoard();renderReadings();audio.sync(activeId?state.components:[],solution.components,store.data.settings);saveSoon();});input.addEventListener('change',()=>{if(before&&JSON.stringify(before.components)!==JSON.stringify(state.components))pushHistory(before);before=null;if(input.value===''||Number(input.value)<d.min||Number(input.value)>d.max){input.value=c.value;toast(`请输入 ${d.min}–${d.max} ${d.unit}`);}if(c.type==='fuse'&&c.blown)renderProperties();});}}
  if(isMeter(c.type)){const connection=meterConnection(c,state.wires),reading=solution.components[c.id],value=reading?.[c.type==='ammeter'?'current':'voltage']??0,scale=meterScale(value,connection.range);panel.querySelector('.property-actions').insertAdjacentHTML('beforebegin',`<div class="meter-range-info"><strong>当前量程：0–${connection.range} ${c.type==='ammeter'?'A':'V'}</strong><p>左柱为公共负端，中柱为小量程正端，右柱为大量程正端。更换正接线柱即可更改量程。</p>${connection.conflict?'<b class="meter-warning">两个正接线柱同时接线，请保留一个。</b>':scale.overload?'<b class="meter-warning">已超量程，请改接大量程或减小被测值。</b>':scale.reversed?'<b class="meter-warning">电表反接，请检查正负接线柱。</b>':''}</div>`);}
  renderComponentControls(c);renderReadings();
}
function renderComponentControls(c){
  const actions=$('componentProperties').querySelector('.property-actions');
  if(isMeter(c.type)){const info=$('componentProperties').querySelector('.meter-range-info');info.querySelector('.meter-warning')?.remove();info.insertAdjacentHTML('beforeend','<b id="meterWarning" class="meter-warning" role="status" hidden></b>');}
  let html=`<p class="component-model-note">${definitions[c.type].note??''}</p>`;
  if(c.type==='battery')html+=`<label class="property-label" for="internalResistance">电池内阻 r<span>Ω</span></label><label class="value-input"><input id="internalResistance" type="number" min="0" max="100" step="0.1" value="${c.internalResistance??0}" aria-label="电池内阻"><span>Ω</span></label><div id="componentPhysics" class="component-physics"></div>`;
  if(c.type==='rheostat')html+=`<label class="property-label" for="sliderPosition">滑片位置 P<span id="sliderPercent">${Math.round((c.slider??1)*100)}%</span></label><input id="sliderPosition" type="range" min="0" max="100" step="1" value="${(c.slider??1)*100}" aria-label="滑片位置"><div class="range-labels"><span>A 左端</span><span>B 右端</span></div><div id="componentPhysics" class="component-physics"></div>`;
  if(c.type==='motor')html+=`<button id="motorStall" class="switch-action" aria-pressed="${c.stalled}">${c.stalled?'释放转子':'按住转子（堵转）'}</button><div id="componentPhysics" class="component-physics"></div>`;
  if(c.type==='capacitor')html+=`<label class="property-label" for="simulationRate">观察速度</label><select id="simulationRate" aria-label="充放电观察速度"><option value="1">正常速度</option><option value="0.1">慢放 10 倍</option><option value="0.01">慢放 100 倍</option></select><button id="dischargeCapacitor" class="switch-action">清空电荷，重新观察</button><div id="componentPhysics" class="component-physics"></div>`;
  if(c.type==='led')html+='<div id="componentPhysics" class="component-physics" role="status"></div>';
  actions.insertAdjacentHTML('beforebegin',`<div class="component-controls">${html}</div>`);
  const bind=(id,property,min,max,scale=1)=>{const input=$(id);if(!input)return;let before=null;input.onfocus=input.onpointerdown=()=>before=clone(state);input.oninput=()=>{const value=Number(input.value)*scale;if(input.value===''||!Number.isFinite(value)||value<min||value>max)return;before??=clone(state);c[property]=value;recompute();renderBoard();renderReadings();audio.sync(activeId?state.components:[],solution.components,store.data.settings);saveSoon();};input.onchange=()=>{if(before&&before.components.find(item=>item.id===c.id)?.[property]!==c[property])pushHistory(before);before=null;input.value=c[property]/scale;};};
  bind('internalResistance','internalResistance',0,100);bind('sliderPosition','slider',0,1,.01);
  if($('motorStall'))$('motorStall').onclick=()=>{pushHistory();c.stalled=!c.stalled;update({route:false});};
  if($('simulationRate')){$('simulationRate').value=String(state.simulationRate??1);$('simulationRate').onchange=()=>{state.simulationRate=Number($('simulationRate').value);saveSoon();};}
  if($('dischargeCapacitor'))$('dischargeCapacitor').onclick=()=>{pushHistory();simulation.discharge(c.id,state.components);update({route:false});};
}
function renderPhysics(){
  const meter=getComponent(selected),warning=$('meterWarning');if(isMeter(meter?.type)&&warning){const connection=meterConnection(meter,state.wires),scale=meterScale(solution.components[meter.id]?.[meter.type==='ammeter'?'current':'voltage']??0,connection.range);warning.textContent=connection.conflict?'两个正接线柱同时接线，请保留一个。':scale.overload?'已超量程，请改接大量程或减小被测值。':scale.reversed?'电表反接，请检查正负接线柱。':'';warning.hidden=!warning.textContent;}
  const target=$('componentPhysics'),c=getComponent(selected);if(!target||!c||$('componentProperties').dataset.selection!==String(selected))return;const r=solution.components[c.id];
  if(c.type==='battery')target.textContent=`路端电压 ${fixed(r.voltage)} V · 内阻发热 ${fixed(r.internalPower)} W`;
  if(c.type==='rheostat'){target.textContent=`A–P：${fixed(r.leftResistance)} Ω · P–B：${fixed(r.rightResistance)} Ω；A–B 始终为 ${c.value} Ω。`;$('sliderPercent').textContent=`${Math.round((c.slider??1)*100)}%`;}
  if(c.type==='motor')target.innerHTML=`反电动势 ${fixed(r.backEmf)} V<br>发热 ${fixed(r.heatPower)} W · 机械功率 ${fixed(r.mechanicalPower)} W<br>U = E反 + Ir`;
  if(c.type==='capacitor')target.textContent=`电荷 ${fixed(c.value*(c.chargeVoltage??0)*.001)} mC · 储能 ${fixed(c.value*(c.chargeVoltage??0)**2*.0005)} mJ`;
  if(c.type==='led'){target.classList.toggle('meter-warning',r.current>.02000001);target.textContent=r.voltage<-.01?'反向截止':r.current>.02000001?`电流 ${fixed(r.current*1000,1)} mA，超过 20 mA；请增大串联限流电阻。`:r.current>1e-8?`正向发光 · ${fixed(r.current*1000,1)} mA`:'未达到正向导通电压';}
}
function prepareRoutes(){routeCircuit(state,state.viewMode,{preservePhysical:state.routingVersion===1,preserveSchematic:true});state.routingVersion=1;}
function update({route=true}={}){pruneLayoutCaches(state);if(route)routeCircuit(state,state.viewMode,{preservePhysical:true,preserveSchematic:true});recompute();renderModeControls();$('currentToggle').checked=state.showCurrent;renderBoard();renderProperties();updateHistoryButtons();audio.sync(activeId?state.components:[],solution.components,store.data.settings);saveSoon();}
function partThumbnail(type,scope='library'){return state.viewMode==='physical'?physicalThumbnail(type,scope):thumbnail(type);}
function renderLibrary(){$('componentLibrary').dataset.viewMode=state.viewMode;$('componentLibrary').innerHTML=Object.entries(definitions).map(([type,d])=>`<button class="component-card" data-add="${type}" draggable="false" aria-label="添加${d.name}"><span class="component-thumb">${partThumbnail(type)}</span><span><strong>${d.name}</strong></span></button>`).join('');}
function renderModeControls(){const physical=state.viewMode==='physical';document.querySelectorAll('button[data-view-mode]').forEach(el=>{const active=el.dataset.viewMode===state.viewMode;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});$('boardWrap').classList.toggle('physical-board',physical);$('board').setAttribute('aria-label',physical?'交互实物连接图':'交互电路图');if($('componentLibrary').dataset.viewMode!==state.viewMode)renderLibrary();}
function cancelWire(){pendingTerminal=null;pendingTrace=[];renderPreview();}
function beginWire(key){pendingTerminal=key;pendingTrace=[];lastPointer=terminalPoint(key);renderBoard();}
let converting=false;
async function setViewMode(mode){if(converting||!activeId||!['schematic','physical'].includes(mode)||mode===state.viewMode)return;converting=true;stopCameraAnimation();resetGestures();cancelWire();const buttons=[...document.querySelectorAll('button[data-view-mode]')];buttons.forEach(el=>{el.disabled=true;el.classList.toggle('active',el.dataset.viewMode===mode);});$('board').setAttribute('aria-busy','true');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{const converted=convertView(state,mode,{...camera,zoom});if(converted.view){camera={x:converted.view.x,y:converted.view.y};zoom=converted.view.zoom;}if(!getItem(selected)&&!getWire(selected))selected=null;update({route:false});animateSurface($('board'));animateSurface($('componentLibrary'));if(converted.newLayout)fitAll();}
  catch(error){renderModeControls();toast(error.message||'视图转换失败，请重试。');}
  finally{converting=false;buttons.forEach(el=>el.disabled=false);$('board').removeAttribute('aria-busy');}
}
function setTool(next){tool=next;cancelWire();document.querySelectorAll('button[data-tool]').forEach(el=>{el.classList.toggle('active',el.dataset.tool===tool);el.setAttribute('aria-pressed',String(el.dataset.tool===tool));});$('board').dataset.tool=tool;if(solution)renderBoard();}
function select(id){selected=id;renderBoard();renderProperties();}
function toggleSwitch(id){const c=getComponent(id);if(!['switch','spdt'].includes(c?.type))return;lastSwitchClick=null;pushHistory();selected=c.id;pendingTerminal=null;if(c.type==='spdt')c.position=c.position===1?2:1;else c.closed=!c.closed;update();}
function addComponent(type,point){if(!activeId)return;if(!Object.hasOwn(definitions,type))return;if(state.components.length>=200){toast('元件较多，请先保存当前实验后继续其他实验。');return;}pushHistory();const num=state.components.filter(c=>c.type===type).reduce((m,c)=>Math.max(m,Number(c.id.slice(1))),0)+1,prefix=definitions[type].idPrefix??({battery:'e',lamp:'l',resistor:'r',switch:'s',ammeter:'a',voltmeter:'v'}[type]??type[0]);const p=point??{x:camera.x+((state.nextId%3)-1)*110,y:camera.y+((Math.floor(state.nextId/3)%2)?45:-45)};const c=component(`${prefix}${num}`,type,Math.round(p.x/10)*10,Math.round(p.y/10)*10,undefined,0);state.components.push(c);state.nextId++;state.preset='free';selected=c.id;cancelWire();update();}
function deleteSelected(id=selected){if(!id)return;pushHistory();if(getWire(id))state.wires=state.wires.filter(w=>w.id!==id);else{state.components=state.components.filter(c=>c.id!==id);state.junctions=state.junctions.filter(n=>n.id!==id);state.wires=state.wires.filter(w=>!w.a.startsWith(id+':')&&!w.b.startsWith(id+':'));}selected=null;pendingTerminal=null;state.preset='free';update();}
function nextWire(){return `w${Date.now()}${state.nextId++}`;}
function makeWire(source,target){const wire={id:nextWire(),a:source,b:target};if(state.viewMode==='physical'){const scale=viewportGeometry(camera,zoom,$('boardWrap').getBoundingClientRect()).scale;wire.physicalVia=tracedRoute(pendingTrace,terminalPoint(source),terminalPoint(target),.75/scale);}return wire;}
function connectTerminal(key){if(!pendingTerminal){beginWire(key);return;}if(pendingTerminal===key){cancelWire();renderBoard();return;}if(state.wires.some(w=>(w.a===pendingTerminal&&w.b===key)||(w.b===pendingTerminal&&w.a===key))){cancelWire();renderBoard();toast('这两个接线端已经连接');return;}if(state.wires.length>=1000){toast('导线较多，请保存并整理当前实验。');return;}pushHistory();state.wires.push(makeWire(pendingTerminal,key));cancelWire();state.preset='free';update();if(solution.status==='short')toast('检测到电源短路，请断开跨接导线或串入电阻。');}
function placeJunction(point,wireId=null){
  const scale=viewportGeometry(camera,zoom,$('boardWrap').getBoundingClientRect()).scale;
  if(!wireId){const keys=[...state.components.flatMap(c=>visibleTerminals(c,state.wires,state.viewMode).map(i=>`${c.id}:${i}`)),...state.junctions.map(n=>`${n.id}:0`)],snap=nearestConnection(state.wires,keys,point,terminalPoint,state.viewMode,9/scale);if(snap?.terminal){connectTerminal(snap.terminal);return;}if(snap?.wire)wireId=snap.wire;}
  const source=pendingTerminal,target=getWire(wireId),hit=target&&projectOnWire(target,point,terminalPoint,state.viewMode);if(target&&!hit)return;const p=hit?.point??(state.viewMode==='physical'?{x:point.x,y:point.y}:{x:Math.round(point.x/10)*10,y:Math.round(point.y/10)*10});
  if(target){const key=[target.a,target.b].find(k=>{const t=terminalPoint(k);return Math.hypot(t.x-p.x,t.y-p.y)<1;});if(key){connectTerminal(key);return;}}
  const existing=state.junctions.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<(target?.1:6)),crossing=target?state.wires.filter(w=>{const h=projectOnWire(w,p,terminalPoint,state.viewMode);return h&&h.distance<.1&&splitWire(w,p,terminalPoint,'candidate:0','candidate',state.viewMode);}):[];
  if((!existing&&state.junctions.length>=500)||state.wires.length+crossing.length+(source?1:0)>1000){toast('节点或导线较多，请先保存当前实验。');return;}
  if(existing&&!source&&!target){select(existing.id);return;}
  pushHistory();const n=existing??{id:`n${state.nextId++}`,x:p.x,y:p.y};if(!existing)state.junctions.push(n);const terminal=`${n.id}:0`,ids=new Set(crossing.map(w=>w.id));state.wires=state.wires.flatMap(w=>{if(!ids.has(w.id))return [w];const split=splitWire(w,p,terminalPoint,terminal,nextWire(),state.viewMode);if(!split)return [w];for(const part of split.wires)delete part[state.viewMode==='physical'?'via':'physicalVia'];return split.wires;});
  if(source&&source!==terminal&&!state.wires.some(w=>(w.a===source&&w.b===terminal)||(w.b===source&&w.a===terminal)))state.wires.push(makeWire(source,terminal));
  selected=n.id;cancelWire();state.preset='free';update();
}

function startBoardGesture(event){
  if(!activeId)return;stopCameraAnimation();
  if(event.button!==0&&event.button!==1)return;const terminal=event.target.closest('[data-terminal]'),node=event.target.closest('[data-junction]'),comp=event.target.closest('[data-component]'),wire=event.target.closest('[data-wire]');const id=node?.dataset.junction??comp?.dataset.component??wire?.dataset.wire??terminal?.dataset.ownerComponent;
  if(event.button!==0||!comp||!['switch','spdt'].includes(getComponent(id)?.type))lastSwitchClick=null;
  if(event.button===1){event.preventDefault();gesture={kind:'pan',startX:event.clientX,startY:event.clientY,camera:{...camera},scale:viewportGeometry(camera,zoom,$('boardWrap').getBoundingClientRect()).scale,moved:false};$('board').setPointerCapture(event.pointerId);return;}
  if(tool==='erase'&&id){deleteSelected(id);return;}
  if(tool==='junction'&&terminal){if(state.viewMode==='physical'&&!pendingTerminal){beginWire(terminal.dataset.terminal);gesture={kind:'wire',startX:event.clientX,startY:event.clientY,moved:false};$('board').setPointerCapture(event.pointerId);event.preventDefault();}else connectTerminal(terminal.dataset.terminal);return;}
  if(tool==='junction'&&wire){placeJunction(pointFromEvent(event),wire.dataset.wire);return;}
  if(id){cancelWire();selected=id;renderProperties();renderBoard();if(comp||node){const p=pointFromEvent(event),item=getItem(id);gesture={kind:'item',id,offsetX:p.x-item.x,offsetY:p.y-item.y,startX:event.clientX,startY:event.clientY,before:clone(state),routing:{},moved:false};$('board').setPointerCapture(event.pointerId);}return;}
  if(tool==='junction'&&pendingTerminal&&state.viewMode==='physical'){placeJunction(pointFromEvent(event));return;}
  gesture={kind:'blank',startX:event.clientX,startY:event.clientY,camera:{...camera},scale:viewportGeometry(camera,zoom,$('boardWrap').getBoundingClientRect()).scale,moved:false};$('board').setPointerCapture(event.pointerId);
}
function beginPinch(){
  pendingTouch=null;lastSwitchClick=null;stopCameraAnimation();
  if(gesture?.kind==='item'&&gesture.moved){pushHistory(gesture.before);update({route:false});}
  gesture=null;cancelWire();$('boardWrap').classList.remove('is-panning');
  pinch=startPinch({...camera,zoom},[...touchPoints.values()].slice(0,2),$('boardWrap').getBoundingClientRect());
}
$('board').addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'){if(!touchPoints.size)startBoardGesture(event);return;}
  event.preventDefault();stopCameraAnimation();touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});$('board').setPointerCapture(event.pointerId);
  if(touchPoints.size===1)pendingTouch=event;else if(touchPoints.size===2)beginPinch();
});
function sampleWire(event){if(!pendingTerminal||state.viewMode!=='physical')return;const scale=viewportGeometry(camera,zoom,$('boardWrap').getBoundingClientRect()).scale,samples=event.getCoalescedEvents?.()??[];for(const sample of samples.length?samples:[event]){const p=pointFromEvent(sample),previous=pendingTrace.at(-1)??terminalPoint(pendingTerminal);if(Math.hypot(p.x-previous.x,p.y-previous.y)*scale>=1.5)pendingTrace.push({x:p.x,y:p.y});}if(pendingTrace.length>4096)pendingTrace=simplifyTrace(pendingTrace,.75/scale);}
$('board').addEventListener('pointermove',event=>{
  if(event.pointerType==='touch'){
    if(!touchPoints.has(event.pointerId))return;
    touchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pinch){applyView(movePinch(pinch,[...touchPoints.values()].slice(0,2),$('boardWrap').getBoundingClientRect()));return;}
    if(pendingTouch){
      if(Math.hypot(event.clientX-pendingTouch.clientX,event.clientY-pendingTouch.clientY)<4)return;
      const down=pendingTouch;pendingTouch=null;
      const terminal=down.target.closest('[data-terminal]'),wire=down.target.closest('[data-wire]');
      // Touch erase and schematic connection taps commit on release. A second
      // finger can therefore take over without deleting a part or adding a wire.
      if(tool==='erase'||(tool==='junction'&&(wire||(terminal&&(state.viewMode!=='physical'||pendingTerminal))))){gesture={kind:'pan',startX:down.clientX,startY:down.clientY,camera:{...camera},scale:viewportGeometry(camera,zoom,$('boardWrap').getBoundingClientRect()).scale,moved:false};}
      else startBoardGesture(down);
    }
  }
  lastPointer=pointFromEvent(event);if(!gesture){sampleWire(event);renderPreview();return;}const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;if(!gesture.moved&&Math.hypot(dx,dy)<4)return;gesture.moved=true;if(gesture.kind==='wire'){sampleWire(event);renderPreview();}else if(gesture.kind==='item'){const item=getItem(gesture.id),step=state.viewMode==='physical'?.5:10;moveItem(state,item.id,{x:Math.round((lastPointer.x-gesture.offsetX)/step)*step,y:Math.round((lastPointer.y-gesture.offsetY)/step)*step},gesture.before,{preview:state.viewMode==='physical',session:gesture.routing});renderBoard();}else{camera=panCamera(gesture.camera,dx,dy,gesture.scale);$('boardWrap').classList.add('is-panning');updateViewport();}
});
function finishGesture(event,cancelled=false){
  if(!gesture)return;const current=gesture;gesture=null;if($('board').hasPointerCapture(event.pointerId))$('board').releasePointerCapture(event.pointerId);$('boardWrap').classList.remove('is-panning');if(cancelled||current.moved)lastSwitchClick=null;
  if(current.kind==='wire'){
    if(cancelled){cancelWire();renderBoard();return;}
    if(!current.moved)return;
    if(!pendingTerminal)return;
    lastPointer=pointFromEvent(event);sampleWire(event);const target=document.elementFromPoint(event.clientX,event.clientY),terminal=target?.closest('[data-terminal]'),wire=target?.closest('[data-wire]');
    if(terminal)connectTerminal(terminal.dataset.terminal);else if(wire)placeJunction(lastPointer,wire.dataset.wire);else if(target?.closest('#board')&&!target.closest('[data-component]'))placeJunction(lastPointer);else{cancelWire();renderBoard();}return;
  }
  if(current.kind==='item'&&current.moved){pushHistory(current.before);update({route:false});}else if(current.moved){saveSoon();}else if(!cancelled&&current.kind==='item'&&['switch','spdt'].includes(getComponent(current.id)?.type)){const now=event.timeStamp,previous=lastSwitchClick;if(previous?.id===current.id&&previous.tool===tool&&now-previous.time<=500&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<=6)toggleSwitch(current.id);else lastSwitchClick={id:current.id,time:now,x:event.clientX,y:event.clientY,tool};}else if(!cancelled&&current.kind==='blank'){if(tool==='junction')placeJunction(pointFromEvent(event));else if(tool==='select'){selected=null;renderBoard();renderProperties();}}
}
function endPointer(event,cancelled=false){
  requestAnimationFrame(updateDock);
  if(event.pointerType==='touch'){
    touchPoints.delete(event.pointerId);
    if(pinch){
      if($('board').hasPointerCapture(event.pointerId))$('board').releasePointerCapture(event.pointerId);
      if(touchPoints.size>=2){beginPinch();return;}
      pinch=null;pendingTouch=null;saveSoon();
      const remaining=[...touchPoints.values()][0];gesture=remaining?{kind:'pan',startX:remaining.x,startY:remaining.y,camera:{...camera},scale:viewportGeometry(camera,zoom,$('boardWrap').getBoundingClientRect()).scale,moved:true}:null;
      return;
    }
    if(pendingTouch){const down=pendingTouch;pendingTouch=null;if(!cancelled)startBoardGesture(down);}
  }
  finishGesture(event,cancelled);
  if($('board').hasPointerCapture(event.pointerId))$('board').releasePointerCapture(event.pointerId);
}
$('board').addEventListener('pointerup',e=>endPointer(e));$('board').addEventListener('pointercancel',e=>endPointer(e,true));
$('board').addEventListener('wheel',e=>{e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?$('boardWrap').clientHeight:1);setZoom((cameraAnimation?.next.zoom??zoom)*Math.exp(-delta*.0012),e);},{passive:false});
$('board').addEventListener('keydown',event=>{const terminal=event.target.closest('[data-terminal]'),node=event.target.closest('[data-junction]'),comp=event.target.closest('[data-component]'),wire=event.target.closest('[data-wire]'),id=node?.dataset.junction??comp?.dataset.component??wire?.dataset.wire??terminal?.dataset.ownerComponent;if(['Enter',' '].includes(event.key)){event.preventDefault();if(tool==='erase')deleteSelected(id);else if(tool==='junction'&&terminal)connectTerminal(terminal.dataset.terminal);else if(tool==='junction'&&wire){const p=wirePoints(getWire(wire.dataset.wire),terminalPoint,state.viewMode);if(p.length>1)placeJunction({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2},wire.dataset.wire);}else select(id);}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)&&id&&getItem(id)&&tool!=='erase'){event.preventDefault();pushHistory();const item=getItem(id),before=clone(state);moveItem(state,id,{x:item.x+(event.key==='ArrowRight'?10:event.key==='ArrowLeft'?-10:0),y:item.y+(event.key==='ArrowDown'?10:event.key==='ArrowUp'?-10:0)},before);selected=id;update({route:false});$('board').querySelector(`[${node?'data-junction':'data-component'}="${id}"]`)?.focus({preventScroll:true});}});

function isFullscreen(){return nativeFullscreen||!!document.fullscreenElement;}
function renderFullscreen(){const active=isFullscreen(),button=$('fullscreenButton'),label=active?'退出全屏':'全屏';button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',label);button.title=label+(active?' (Esc)':' (F)');button.innerHTML=icon(active?'collapse':'expand')+'<span>'+label+'</span>';requestAnimationFrame(fitHeader);}
async function toggleFullscreen(){
  if(fullscreenBusy)return;fullscreenBusy=true;
  try{
    const bars=androidSystemBars();
    const desktop=systemDesktop();
    if(desktop){const entering=!nativeFullscreen;await desktop.invoke('set_fullscreen',{fullscreen:entering});nativeFullscreen=entering;renderFullscreen();if(entering)fullscreenFocus=document.activeElement;else fullscreenFocus?.focus?.({preventScroll:true});return;}
    if(bars){const entering=!nativeFullscreen;await (entering?bars.hide():bars.show());nativeFullscreen=entering;renderFullscreen();if(!entering)fullscreenFocus?.focus?.({preventScroll:true});else fullscreenFocus=document.activeElement;return;}
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    fullscreenFocus=document.activeElement;
    if(!document.documentElement.requestFullscreen){toast(matchMedia('(pointer: coarse)').matches?'当前浏览器不支持隐藏系统栏，请使用 Android 版全屏。':'此浏览器请按 F11 进入全屏。');return;}
    await document.documentElement.requestFullscreen({navigationUI:'hide'});
  }catch(error){toast(globalThis.Capacitor?.getPlatform?.()==='android'?(error.message||'无法切换全屏，请重试。'):'浏览器未允许全屏，请重试。');}
  finally{fullscreenBusy=false;}
}
document.addEventListener('fullscreenchange',()=>{renderFullscreen();if(!document.fullscreenElement)fullscreenFocus?.focus?.({preventScroll:true});});
const sidebarBreakpoint=matchMedia('(max-width:900px)');
function syncLayoutControls(){
  const controls=$('layoutControls'),tools=$('componentPanel').querySelector('.tools-section');
  const inToolbar=!!activeId&&document.body.matches('.header-collapsed:not(.sidebar-open):not(.toolbar-collapsed)');
  const parent=inToolbar?tools:document.body,focused=controls.contains(document.activeElement)?document.activeElement:null;
  controls.classList.toggle('in-toolbar',inToolbar);tools.classList.toggle('with-layout-controls',inToolbar);
  if(controls.parentElement!==parent){parent.prepend(controls);focused?.focus({preventScroll:true});}
}
function setSidebarExpanded(expanded,{persist=true}={}){document.body.classList.toggle('sidebar-open',expanded);syncLayoutControls();$('experimentSidebar').inert=!expanded;$('sidebarScrim').hidden=!expanded;const button=$('sidebarToggle'),label=expanded?'收起实验侧边栏':'展开实验侧边栏';button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',label);button.title=label;if(persist)try{storage.setItem('circuit-lab-sidebar-expanded',String(expanded));}catch{}closeMenu();}
function closeSidebarOnNarrowScreens(){if(sidebarBreakpoint.matches)setSidebarExpanded(false,{persist:false});}
function restoreSidebar(){let saved;try{saved=storage.getItem('circuit-lab-sidebar-expanded');}catch{}setSidebarExpanded(saved===null||saved===undefined?!sidebarBreakpoint.matches:saved==='true',{persist:false});}
sidebarBreakpoint.addEventListener('change',restoreSidebar);
function setHeaderExpanded(expanded,{persist=true}={}){
  document.body.classList.toggle('header-collapsed',!expanded);$('headerPanel').inert=!expanded;
  if(!expanded)closeHeaderMenu();
  syncLayoutControls();
  const button=$('headerToggle'),label=expanded?'收起顶栏':'展开顶栏';button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',label);button.title=label;button.innerHTML=icon(expanded?'chevron-up':'chevron-down');
  if(persist)try{storage.setItem('circuit-lab-header-expanded',String(expanded));}catch{}
}
function setToolbarExpanded(expanded,{persist=true}={}){
  document.body.classList.toggle('toolbar-collapsed',!expanded);if(expanded)$('componentPanel').inert=false;syncLayoutControls();$('componentPanel').inert=!expanded;
  const button=$('toolbarToggle'),label=expanded?'收起工具栏':'展开工具栏';button.setAttribute('aria-expanded',String(expanded));button.setAttribute('aria-label',label);button.title=label;
  if(persist)try{storage.setItem('circuit-lab-toolbar-expanded',String(expanded));}catch{}
}
function restoreChrome(){let header=true,toolbar=true;try{header=storage.getItem('circuit-lab-header-expanded')!=='false';toolbar=storage.getItem('circuit-lab-toolbar-expanded')!=='false';}catch{}setHeaderExpanded(!activeId||header,{persist:false});setToolbarExpanded(toolbar,{persist:false});}
function fitHeader(){
  const header=document.querySelector('.site-header');
  if(!header.clientWidth)return;
  const secondary=$('headerSecondary'),more=$('headerMoreButton');
  const focused=$('headerActionsMenu').contains(document.activeElement)?document.activeElement:null;
  closeHeaderMenu();
  if(secondary.parentElement!==more.parentElement)more.before(secondary);
  secondary.querySelectorAll('button').forEach(button=>button.removeAttribute('role'));
  const stages=['header-compact-brand','header-icons-only','header-short-modes','header-no-logo','header-hide-experiment','header-mode-icons','header-overflow'];
  for(const name of stages)header.classList.remove(name);
  let level=0;
  while(header.scrollWidth>header.clientWidth+1&&level<stages.length){
    const name=stages[level++];header.classList.add(name);
    if(name==='header-overflow'){$('headerActionsMenu').prepend(secondary);secondary.querySelectorAll('button').forEach(button=>button.setAttribute('role','menuitem'));}
  }
  header.dataset.compact=level;
  if(header.scrollWidth<=header.clientWidth+1)header.scrollLeft=0;
  if(focused){const target=$('headerActionsMenu').contains(focused)?(level===stages.length?more:$('sidebarToggle')):focused;target.focus({preventScroll:true});}
}
function closeHeaderMenu({restoreFocus=false}={}){$('headerActionsMenu').hidden=true;$('headerMoreButton').setAttribute('aria-expanded','false');if(restoreFocus)$('headerMoreButton').focus({preventScroll:true});}
function headerMenuButtons(){return [...$('headerActionsMenu').querySelectorAll('button')].filter(button=>!button.disabled&&button.getClientRects().length);}
function openHeaderMenu({last=false}={}){
  if(!document.querySelector('.site-header').classList.contains('header-overflow'))return;
  closeMenu();const menu=$('headerActionsMenu'),top=$('headerMoreButton').getBoundingClientRect().bottom+8;
  menu.style.top=top+'px';menu.style.maxHeight=Math.max(48,innerHeight-top-8)+'px';menu.hidden=false;
  $('headerMoreButton').setAttribute('aria-expanded','true');const buttons=headerMenuButtons();(last?buttons.at(-1):buttons[0])?.focus({preventScroll:true});
}
function updateDock(){
  if(!activeId||gesture||pinch)return;const workspace=$('workspace'),rect=workspace.getBoundingClientRect(),toolWidth=parseFloat(getComputedStyle(workspace).getPropertyValue('--tool-width'))||166;
  const above=rect.width-toolWidth<rect.height;workspace.classList.toggle('tools-above',above);$('toolbarToggle').innerHTML=icon(above?'panel-top':'panel-left');
}
function applyTheme(){
  const preference=store.data.settings.theme,dark=preference==='dark'||preference==='system'&&(nativeSystemDark??systemTheme.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.dataset.themePreference=preference;
  $('themeSetting').value=preference;document.querySelector('meta[name="theme-color"]').content=dark?'#171b26':'#7357ec';
  try{const bars=androidSystemBars();if(bars?.setStyle)bars.setStyle({style:dark?'DARK':'LIGHT'}).catch(()=>{});}catch{}
}
systemTheme.addEventListener('change',()=>applyTheme());
const nativeAppearance=globalThis.Capacitor?.getPlatform?.()==='android'?globalThis.Capacitor.Plugins?.CircuitAppearance:null;
if(nativeAppearance){nativeAppearance.addListener('themeChanged',appearance=>{nativeSystemDark=!!appearance.dark;applyTheme();});nativeAppearance.getSystemTheme().then(appearance=>{nativeSystemDark=!!appearance.dark;applyTheme();}).catch(()=>{});}
new ResizeObserver(entries=>document.documentElement.style.setProperty('--header-height',entries[0].target.getBoundingClientRect().height+'px')).observe($('headerPanel'));
new ResizeObserver(updateDock).observe($('workspace'));
new ResizeObserver(fitHeader).observe(document.querySelector('.site-header'));
document.fonts?.ready.then(fitHeader);
new ResizeObserver(()=>updateViewport()).observe($('boardWrap'));
document.addEventListener('keydown',event=>{const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;if(event.key==='Escape'&&!$('headerActionsMenu').hidden){event.preventDefault();closeHeaderMenu({restoreFocus:true});return;}if(mod&&key==='s'){event.preventDefault();if(!document.querySelector('dialog[open]'))persist();return;}if(event.key==='Escape'&&!document.querySelector('dialog[open]')){if(pendingTerminal){cancelWire();gesture=null;renderBoard();return;}if(isFullscreen()){event.preventDefault();toggleFullscreen();return;}closeMenu();closeSidebarOnNarrowScreens();}const typing=['TEXTAREA','SELECT'].includes(event.target.tagName)||(event.target.tagName==='INPUT'&&!['range','checkbox'].includes(event.target.type));if(typing||document.querySelector('dialog[open]'))return;if(!activeId){if(key==='f'&&!mod&&!event.repeat){event.preventDefault();toggleFullscreen();}return;}if(mod&&key==='z'){event.preventDefault();event.shiftKey?redoAction():undoAction();return;}if(mod&&key==='y'){event.preventDefault();redoAction();return;}if(!mod){if(key==='v')setTool('select');if(key==='j'||key==='w')setTool('junction');if(key==='e')setTool('erase');if(key==='f'){event.preventDefault();if(!event.repeat)toggleFullscreen();}if(key==='0')fitAll();if(['Delete','Backspace'].includes(event.key)&&selected){event.preventDefault();deleteSelected();}}});

const guideText={help:{title:'你的电路实验工具箱',intro:'从一个元件开始，也可以载入指南中的示例。创建或导入实验后，修改会自动保存。',steps:['使用顶栏的「电路图 / 实物图」切换显示，同一电路的连接、参数和读数保持一致。实物图中，选择导线工具后，点击接线端、移动鼠标、再点击终点，导线会沿鼠标轨迹绘制；也可以按住接线端拖到终点，落在空白处会自动新建节点。按 Esc 取消接线。模式之间会分别保存元件布局，电路图自动避开元件布线，拖动实物时导线会平滑跟随。','在工具栏选择、接线或删除；下方可撤销和重做。工具栏与元件库会根据画布空间自动放在左侧或上方，并一起滚动。选择模式可选择和移动元件、节点与导线；删除模式只删除目标。拖动空白处平移画布，滚轮平滑缩放；触屏可用双指缩放和平移。左上角三个按钮可分别展开或收起实验侧边栏、工具栏与顶栏。窄屏顶栏会依次精简品牌文字、按钮文字、视图名称与标志，再隐藏实验名称和重命名按钮、改用视图图标；仍放不下时，放大、缩小、比例和适应画布保留在一起，其他操作收进三点菜单。','接线节点模式：点击空白处放节点，点击节点或元件接线端开始连线，再点击另一个接线端完成。连接途中点击空白处创建终点节点并完成本次连线，继续接线时重新点击起点。点击导线可插入分支节点。导线工具下拖动元件主体，与选择工具一样可以移动元件。','选中元件后，可在悬浮属性面板中调整参数；面板不会改变画布大小。电流表串联，电压表并联；双击开关快速通断，双击双掷开关切换支路 1 / 2，也可以在属性里切换。实物电表左侧接线柱为公共负端，中间和右侧为小、大量程正端；更换正接线柱即可切换 0.6 / 3 A 或 3 / 15 V 量程。电铃、风扇与电热丝会按通电功率反馈。可以添加多节电池，串联时电压相加，反接时相减；同电压电池可并联。','电流方向显示可在「设置」中切换。点击左上角菜单按钮展开或收起实验侧边栏。创建或导入实验后，每次修改都会自动保存；可以新建、重命名、归档与删除。「导出实验」保存当前实验文件，「加载实验」打开实验文件。归档内容在设置中恢复，删除需要再次确认。'],formula:''},series:{title:'探索串联电路',intro:'电流沿一条路径依次流过元件。',steps:['载入示例后，比较灯泡、电阻的电流与电压。','改变电阻值，观察灯泡亮度与总电流。','选中开关，在右侧断开，再观察读数。'],formula:'I = I₁ = I₂ · U = U₁ + U₂ · R = R₁ + R₂'},parallel:{title:'探索并联电路',intro:'电流在分支节点处分配。',steps:['比较两盏灯泡的端电压和支路电流。','将一个灯泡的电阻改为 50 Ω，比较明暗差异。','在节点处增加一条支路，观察干路电流变化。'],formula:'U = U₁ = U₂ · I = I₁ + I₂'},ohm:{title:'探究欧姆定律',intro:'保持电阻不变，电流随电压成比例变化。',steps:['保持电阻 20 Ω，依次调整电压到 2 V、4 V、6 V。','比较不同电压下的电流读数，观察两者的比例。','保持电压不变，改变电阻，观察电流变化。'],formula:'I = U / R'}};
function showGuide(name='help'){activeGuide=name;const g=guideText[name];document.querySelectorAll('[data-guide]').forEach(el=>el.classList.toggle('active',el.dataset.guide===name));$('guideContent').innerHTML=`<div class="guide-content"><h3>${g.title}</h3><p>${g.intro}</p><ol>${g.steps.map(s=>`<li>${s}</li>`).join('')}</ol>${g.formula?`<div class="guide-formula">${g.formula}</div>`:'<div class="guide-shortcuts"><span><kbd>V / J / W / E</kbd>选择、接线、删除</span><span><kbd>Ctrl+Z</kbd>撤销</span><span><kbd>Ctrl+Shift+Z</kbd>重做</span><span><kbd>双指 / 滚轮</kbd>缩放画布</span><span><kbd>F / Esc</kbd>全屏、退出全屏</span><span><kbd>0</kbd>适应画布</span></div>'}<div class="guide-model">电动机包含线圈电阻与反电动势，电功率分为发热和机械功率；可观察启动与堵转。电容模拟充放电、储能，可慢放观察。LED 正向导通、反向截止，需串联限流电阻。电铃敲击频率和响度随供电变化；理想线圈采用稳态模型。普通导线交叉不会接通，实心节点处的支路互相接通。</div></div>`;$('startGuideExperiment').innerHTML=(name==='help'?'回到实验室':'载入示例')+icon('arrow-right');openDialog('guideDialog');animateSurface($('guideContent'));}

function closeMenu(){$('experimentMenu').hidden=true;menuId=null;}
$('experimentList').addEventListener('click',event=>{const open=event.target.closest('[data-open-experiment]'),more=event.target.closest('[data-doc-menu]');if(open)openExperiment(open.dataset.openExperiment);if(more){menuId=more.dataset.docMenu;const r=more.getBoundingClientRect();$('experimentMenu').style.left=`${Math.min(window.innerWidth-180,r.left)}px`;$('experimentMenu').style.top=`${Math.min(window.innerHeight-130,r.bottom+5)}px`;$('experimentMenu').hidden=false;}});
$('experimentMenu').onclick=event=>{const button=event.target.closest('[data-doc-action]');if(!button)return;const id=menuId;closeMenu();if(button.dataset.docAction==='rename')renameExperiment(id);if(button.dataset.docAction==='archive')archiveExperiment(id);if(button.dataset.docAction==='delete')deleteExperiment(id);};
document.addEventListener('click',event=>{if(!event.target.closest('#experimentMenu,[data-doc-menu]'))closeMenu();if(!event.target.closest('#headerActionsMenu,#headerMoreButton'))closeHeaderMenu();});
$('headerMoreButton').onclick=()=>{$('headerActionsMenu').hidden?openHeaderMenu():closeHeaderMenu({restoreFocus:true});};
$('headerMoreButton').onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openHeaderMenu({last:event.key==='ArrowUp'});}};
$('headerActionsMenu').addEventListener('click',event=>{if(event.target.closest('button'))closeHeaderMenu({restoreFocus:true});},{capture:true});
$('headerActionsMenu').onkeydown=event=>{
  if(event.key==='Tab'){closeHeaderMenu({restoreFocus:true});return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=headerMenuButtons(),index=buttons.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();
};
$('newExperimentButton').onclick=newExperiment;$('emptyCreateButton').onclick=newExperiment;$('emptyImportButton').onclick=()=>$('experimentFile').click();$('renameActiveButton').onclick=()=>renameExperiment();
$('experimentExportButton').onclick=async()=>{try{const content=serializeExperiment(snapshot(),title());persist();if(await saveFile(content,experimentFilename(title())))toast('当前实验已导出为文件');}catch(error){toast(error.message||'实验导出失败');}};
$('experimentImportButton').onclick=()=>$('experimentFile').click();
$('experimentFile').onchange=async()=>{const file=$('experimentFile').files[0];if(!file)return;try{if(file.size>20*1024*1024)throw new Error('实验文件过大，请选择小于 20 MB 的文件。');const imported=parseExperiment(await file.text());let name;if(!tryStore(()=>{name=importedExperimentName(imported.name,store.data.experiments);activeId=store.save(imported.state,name,null,{preserveDraft:true});draftName=name;}))return;restoreState(imported.state);closeSidebarOnNarrowScreens();toast(`已加载「${name}」`);}catch(error){toast(error.message||'实验文件加载失败');}finally{$('experimentFile').value='';}};
$('nameForm').onsubmit=event=>{event.preventDefault();const name=$('experimentNameInput').value.trim();if(!name){$('experimentNameInput').focus();return;}$('nameDialog').close();nameCallback?.(name);};
$('confirmAction').onclick=()=>{$('confirmDialog').close();const action=confirmCallback;confirmCallback=null;action?.();};
document.querySelectorAll('[data-close]').forEach(el=>el.onclick=()=>$(el.dataset.close).close());
document.querySelectorAll('button[data-view-mode]').forEach(el=>el.onclick=()=>setViewMode(el.dataset.viewMode));
document.querySelectorAll('button[data-tool]').forEach(el=>el.onclick=()=>setTool(el.dataset.tool));$('undoButton').onclick=undoAction;$('redoButton').onclick=redoAction;
$('zoomIn').onclick=()=>setZoom((cameraAnimation?.next.zoom??zoom)*1.15);$('zoomOut').onclick=()=>setZoom((cameraAnimation?.next.zoom??zoom)/1.15);$('fitButton').onclick=fitAll;$('fullscreenButton').onclick=toggleFullscreen;
$('currentToggle').checked=state.showCurrent;$('currentToggle').onchange=()=>{state.showCurrent=$('currentToggle').checked;renderBoard();saveSoon();};
const libraryDrag=bindLibraryDrag({library:$('componentLibrary'),board:$('board'),previewContent:type=>`<span class="component-thumb">${partThumbnail(type,'drag')}</span><strong>${definitions[type].name}</strong>`,toWorld:pointFromEvent,add:addComponent,enabled:()=>!!activeId&&!converting&&!document.querySelector('dialog[open]')});
$('clearButton').onclick=()=>confirmAction('清空当前实验画布？','元件、节点与导线将被移除。可以通过撤销恢复。',()=>{pushHistory();state={...createPreset('free',state.records),viewMode:state.viewMode};selected=null;cancelWire();update();},'清空画布');
$('headerToggle').onclick=()=>setHeaderExpanded(document.body.classList.contains('header-collapsed'));$('toolbarToggle').onclick=()=>setToolbarExpanded(document.body.classList.contains('toolbar-collapsed'));
$('sidebarToggle').onclick=()=>setSidebarExpanded(!document.body.classList.contains('sidebar-open'));$('sidebarScrim').onclick=()=>setSidebarExpanded(false);
$('settingsButton').onclick=()=>{setSettingsTab('preferences');applyTheme();$('soundSetting').checked=store.data.settings.sound;$('motionSetting').checked=store.data.settings.motion;$('volumeSetting').value=Math.round(store.data.settings.volume*100);$('volumeValue').textContent=$('volumeSetting').value+'%';$('recoverDraftButton').hidden=!(store.data.draft??legacy);openDialog('settingsDialog');};
$('themeSetting').onchange=()=>{const theme=$('themeSetting').value;try{store.settings({theme});}catch{store.data.settings.theme=theme;toast('外观设置暂未保存');}applyTheme();};
document.querySelectorAll('[data-settings-tab]').forEach(el=>el.onclick=()=>setSettingsTab(el.dataset.settingsTab));
for(const id of ['soundSetting','motionSetting','volumeSetting'])$(id).oninput=()=>{const next={sound:$('soundSetting').checked,motion:$('motionSetting').checked,volume:Number($('volumeSetting').value)/100};try{store.settings(next);}catch{Object.assign(store.data.settings,next);toast('设置暂未保存');}$('volumeValue').textContent=$('volumeSetting').value+'%';renderAudioState();renderBoard();audio.sync(activeId?state.components:[],solution.components,store.data.settings);};
$('archivedList').onclick=event=>{const restore=event.target.closest('[data-restore-experiment]'),del=event.target.closest('[data-delete-experiment]');if(restore){if(tryStore(()=>store.restore(restore.dataset.restoreExperiment)))toast('实验已恢复到列表');}if(del)deleteExperiment(del.dataset.deleteExperiment);};
$('backupExportButton').onclick=async()=>{try{persist();const backup=clone(store.data);const current=backup.experiments.find(e=>e.id===activeId);if(current)current.state=snapshot();else if(!backup.draft&&legacy){backup.draft=legacy;backup.draftName=draftName;}if(await saveFile(JSON.stringify(backup,null,2),`电路实验备份-${new Date().toLocaleDateString('sv-SE')}.json`))toast('实验备份已导出');}catch(error){toast(error.message||'备份导出失败');}};
$('backupImportButton').onclick=()=>$('backupFile').click();$('backupFile').onchange=async()=>{const file=$('backupFile').files[0];if(!file)return;try{if(file.size>20*1024*1024)throw new Error('备份文件过大');const backup=JSON.parse(await file.text());if(!normalizeCollection(backup))throw new Error('备份格式不正确');if(tryStore(()=>store.import(backup))){activeId=store.data.activeId;restoreState(store.data.experiments.find(e=>e.id===activeId)?.state??store.data.draft??createPreset('free'));toast('实验备份已导入');}}catch(error){toast(error.message);}$('backupFile').value='';};
$('helpButton').onclick=()=>showGuide('help');document.querySelectorAll('[data-guide]').forEach(el=>el.onclick=()=>showGuide(el.dataset.guide));$('startGuideExperiment').onclick=()=>{$('guideDialog').close();if(activeGuide==='help')return;const preset=createPreset(activeGuide,state.records);if(!activeId){askName('从示例创建实验',guideText[activeGuide].title,name=>{if(!tryStore(()=>{activeId=store.save(preset,name,null,{preserveDraft:true});}))return;restoreState(preset);closeSidebarOnNarrowScreens();},'创建');return;}stopCameraAnimation();resetGestures();pushHistory();state={...preset,viewMode:state.viewMode};selected=null;cancelWire();camera={x:420,y:255};zoom=1;update();};
document.addEventListener('visibilitychange',()=>{if(document.hidden){persist();audio.silence();stopFanFrames();}else{audio.sync(activeId?state.components:[],solution.components,store.data.settings);startFanFrames();if(nativeFullscreen)androidSystemBars()?.hide().catch(()=>{});}});
window.addEventListener('circuitlab:back',event=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog){dialog.close();event.preventDefault();return;}if(pendingTerminal){cancelWire();gesture=null;renderBoard();event.preventDefault();return;}if(isFullscreen()){toggleFullscreen();event.preventDefault();return;}if(document.body.classList.contains('sidebar-open')){setSidebarExpanded(false);event.preventDefault();return;}persist();});
window.addEventListener('pagehide',()=>{persist();audio.dispose();stopFanFrames();});
window.addEventListener('pageshow',()=>{audio.sync(activeId?state.components:[],solution.components,store.data.settings);startFanFrames();});
window.addEventListener('storage',event=>{
  if(event.key!=='circuit-lab-experiments-v2')return;
  try{
    const next=normalizeCollection(JSON.parse(event.newValue));if(!next)return;
    const removed=activeId&&!next.experiments.some(e=>e.id===activeId&&!e.archived),draft=removed?snapshot():null,name=title();
    if(removed){next.draft=draft;next.draftName=name;activeId=null;stopCameraAnimation();resetGestures();}
    next.activeId=activeId;store.data=next;
    if(removed){try{store.recover(draft,name);toast('当前实验已在其他页面归档或删除，编辑内容可在设置中恢复。');}catch{toast('当前实验已在其他页面移除，请在设置中导出备份以保留编辑内容。');}}
    applyTheme();renderSidebar();renderTitle();renderArchives();
  }catch{}
});
let simulationTime=performance.now(),simulationSaved=simulationTime;
setInterval(()=>{
  const now=performance.now(),elapsed=Math.min(.1,(now-simulationTime)/1000);simulationTime=now;
  if(!activeId||document.hidden||converting||!state.components.some(c=>c.type==='capacitor'||c.type==='motor'))return;
  recompute(elapsed);
  if(!gesture&&!pendingTerminal){renderBoard();renderReadings();}
  audio.sync(state.components,solution.components,store.data.settings);
  if(now-simulationSaved>2000){simulationSaved=now;saveSoon();}
},50);
renderLibrary();renderSidebar();renderTitle();setTool('select');update();renderArchives();renderAudioState();restoreSidebar();restoreChrome();renderFullscreen();applyTheme();fitHeader();

$('recoverDraftButton').onclick=()=>{const draft=store.data.draft??legacy;if(!draft)return;askName('恢复为新实验',store.data.draftName==='未保存的实验'?'恢复的实验':store.data.draftName,name=>{if(!tryStore(()=>{activeId=store.save(draft,name);draftName=name;}))return;restoreState(draft);$('settingsDialog').close();closeSidebarOnNarrowScreens();toast('草稿已恢复为实验，后续修改自动保存');},'创建');};
