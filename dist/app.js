import { solveCircuit } from './solver.js?v=1.1';
import { wirePoints, projectOnWire, splitWire } from './wiring.js?v=1.1';

const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const icons = {
  circuit: '<path d="M4 7h7V3m0 4h9v10h-9v4m0-4H4V7m4-3v6m0 4v6"/><circle cx="16" cy="12" r="2"/>',
  flask: '<path d="M9 3h6m-5 0v6l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 14h8"/><path d="m10 17 1 1m3-2h.01"/>',
  book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15"/><path d="M6 8h3m6 0h3M6 12h3m6 0h3"/>',
  notebook: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4m-4 5h4m-4 5h4m4-10h5m-5 5h5m-5 5h3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1.2-1.5 2M12 17h.01"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3m7-1v4m-2-2h4"/>',
  'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>', 'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>', play: '<path d="m8 4 12 8-12 8V4Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  cursor: '<path d="m5 3 4 18 4-7 7-4L5 3Z"/>', wire: '<circle cx="4" cy="17" r="2"/><circle cx="20" cy="6" r="2"/><path d="M6 17h6V6h6"/>',
  eraser: '<path d="m16 3 5 5-12 12H5l-3-3L16 3Zm-7 7 5 5M9 20h12"/>', undo: '<path d="M3 7h11a7 7 0 0 1 0 14h-3M3 7l5-5M3 7l5 5"/>',
  minus: '<path d="M5 12h14"/>', plus: '<path d="M5 12h14M12 5v14"/>', expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>', current: '<path d="M3 12h18m-5-5 5 5-5 5"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>', resistance: '<path d="M3 12h3l2-5 3 10 3-10 2 5h5"/>',
  sliders: '<path d="M4 7h4m4 0h8M4 17h9m4 0h3"/><circle cx="10" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16m6-16v16"/>',
  chart: '<path d="M4 3v17h17M7 15l4-5 4 3 5-7"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  leaf: '<path d="M20 3c-7 0-15 3-15 9a6 6 0 0 0 6 6c6 0 9-8 9-15ZM3 21l11-11"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', rotate: '<path d="M20 9a8 8 0 1 0-2 9M20 3v6h-6"/>',
  junction: '<path d="M3 12h7m4 0h7M12 3v7m0 4v7"/><circle cx="12" cy="12" r="2" fill="currentColor"/>'
};
function icon(name) { return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`; }
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); }); }
hydrateIcons();

const definitions = {
  battery: { name: '电源', english: 'DC power', prefix: 'E', value: 6, unit: 'V', min: 1.5, max: 12, step: .5 },
  lamp: { name: '小灯泡', english: 'Light bulb', prefix: 'L', value: 10, unit: 'Ω', min: 1, max: 50, step: 1 },
  resistor: { name: '电阻', english: 'Resistor', prefix: 'R', value: 10, unit: 'Ω', min: 1, max: 100, step: 1 },
  switch: { name: '开关', english: 'Switch', prefix: 'S', value: 0 },
  ammeter: { name: '电流表', english: 'Ammeter', prefix: 'A', value: 0 },
  voltmeter: { name: '电压表', english: 'Voltmeter', prefix: 'V', value: 0 },
  rheostat: { name:'滑动变阻器',english:'Rheostat',prefix:'RV',idPrefix:'t',value:20,unit:'Ω',min:1,max:100,step:1,note:'两端有效电阻 · 右侧滑块调节' },
  motor: { name:'电动机',english:'DC motor',prefix:'M',value:12,unit:'Ω',min:2,max:100,step:1,note:'电阻近似模型 · 通电转动' },
  buzzer: { name:'蜂鸣器',english:'Buzzer',prefix:'BZ',idPrefix:'z',value:30,unit:'Ω',min:5,max:100,step:1,note:'电阻近似模型 · 通电视觉指示' },
  heater: { name:'电热丝',english:'Heater',prefix:'H',value:20,unit:'Ω',min:1,max:100,step:1,note:'固定电阻模型 · 显示电热功率' },
  capacitor: { name:'电容',english:'Capacitor',prefix:'C',value:100,unit:'μF',min:10,max:1000,step:10,note:'稳态直流视为断路 · 不模拟充放电' },
  inductor: { name:'线圈',english:'Inductor',prefix:'Co',idPrefix:'q',value:100,unit:'mH',min:10,max:1000,step:10,note:'稳态直流理想短路 · 不模拟暂态' },
  fuse: { name:'保险丝',english:'Fuse',prefix:'F',value:1,unit:'A',min:.1,max:5,step:.1,note:'冷态电阻 0.2 Ω · 超过额定电流熔断' }
};
let state, selected = 'l1', tool = 'select', pendingTerminal = null, solution, zoom = 1, activeTab = 'table', activeGuide = 'series';
let history = [], drag = null, lastPointer = null, toastTimer, saveTimer, confirmCallback, propertyBefore = null;
const STORAGE_KEY = 'circuit-lab-v1';
const clone = (value) => JSON.parse(JSON.stringify(value));
const fixed = (value, places = 2) => Number.isFinite(value) ? value.toFixed(places) : '—';
const component = (id, type, x, y, value, angle = 0) => ({ id, type, x, y, value: value ?? definitions[type].value, angle, closed: true, ...(type==='fuse'?{blown:false}:{}) });
function preset(name) {
  let components = [], wires = [], junctions = [];
  const w = (a, b, via) => wires.push({ id: `w${wires.length + 1}`, a, b, ...(via ? { via } : {}) });
  if (name === 'series') {
    components = [component('e1', 'battery', 145, 260, 6, 90), component('s1', 'switch', 325, 135), component('l1', 'lamp', 605, 135), component('r1', 'resistor', 605, 370, 10, 180), component('a1', 'ammeter', 325, 370, 0, 180), component('v1', 'voltmeter', 605, 255)];
    w('e1:0', 's1:0', [{ x: 145, y: 135 }]); w('s1:1', 'l1:0');
    w('l1:1', 'r1:0', [{ x: 730, y: 135 }, { x: 730, y: 370 }]); w('r1:1', 'a1:0'); w('a1:1', 'e1:1', [{ x: 145, y: 370 }]);
    w('l1:0', 'v1:0', [{ x: 505, y: 135 }, { x: 505, y: 255 }]); w('l1:1', 'v1:1', [{ x: 700, y: 135 }, { x: 700, y: 255 }]);
  } else if (name === 'parallel') {
    components = [component('e1','battery',145,270,6,90),component('s1','switch',200,120),component('a1','ammeter',360,120),component('l1','lamp',565,300,10),component('l2','lamp',565,400,10),component('v1','voltmeter',565,200)];
    junctions=[{id:'n1',x:440,y:200},{id:'n2',x:690,y:200},{id:'n3',x:440,y:300},{id:'n4',x:690,y:300},{id:'n5',x:440,y:400},{id:'n6',x:690,y:400}];
    w('e1:0','s1:0',[{x:145,y:120}]);w('s1:1','a1:0');w('a1:1','n1:0',[{x:440,y:120}]);
    w('n1:0','n3:0');w('n3:0','n5:0');w('n2:0','n4:0');w('n4:0','n6:0');
    w('n6:0','e1:1',[{x:690,y:455},{x:145,y:455}]);
    w('n1:0','v1:0');w('v1:1','n2:0');w('n3:0','l1:0');w('l1:1','n4:0');w('n5:0','l2:0');w('l2:1','n6:0');
  } else if (name === 'ohm') {
    components = [component('e1', 'battery', 145, 260, 6, 90), component('s1', 'switch', 325, 135), component('a1', 'ammeter', 605, 135), component('r1', 'resistor', 605, 370, 20, 180), component('v1', 'voltmeter', 605, 255, 0, 180)];
    w('e1:0', 's1:0', [{ x: 145, y: 135 }]); w('s1:1', 'a1:0');
    w('a1:1', 'r1:0', [{ x: 730, y: 135 }, { x: 730, y: 370 }]); w('r1:1', 'e1:1', [{ x: 145, y: 370 }]);
    w('r1:1', 'v1:1', [{ x: 505, y: 370 }, { x: 505, y: 255 }]); w('r1:0', 'v1:0', [{ x: 700, y: 370 }, { x: 700, y: 255 }]);
  }
  return { preset: name, components, wires, junctions, running: true, showCurrent: true, records: state?.records ?? [], nextId: 20 };
}

function validStored(data) {
  if (!data || !['series','parallel','ohm','free'].includes(data.preset) || typeof data.running !== 'boolean' || typeof data.showCurrent !== 'boolean' || !Number.isSafeInteger(data.nextId) || data.nextId < 1 || !Array.isArray(data.components) || data.components.length > 40 || !Array.isArray(data.wires) || data.wires.length > 200 || !Array.isArray(data.records) || data.records.length > 500) return false;
  if(data.junctions!==undefined && (!Array.isArray(data.junctions) || data.junctions.length>100)) return false;
  const ids = new Set(), terminalKeys = new Set(), wireIds = new Set();
  for (const c of data.components) {
    const d = c && Object.hasOwn(definitions,c.type) && definitions[c.type];
    if (!d || !/^[a-z]\d+$/.test(c.id) || ids.has(c.id) || !Number.isFinite(c.x) || c.x < 0 || c.x > 840 || !Number.isFinite(c.y) || c.y < 0 || c.y > 510 || !Number.isFinite(c.value) || (d.unit && (c.value < d.min || c.value > d.max)) || ![0,90,180,270].includes(c.angle) || typeof c.closed !== 'boolean') return false;
    ids.add(c.id); terminalKeys.add(`${c.id}:0`); terminalKeys.add(`${c.id}:1`);
    if(c.type==='fuse' && typeof c.blown!=='boolean') return false;
  }
  for(const n of data.junctions??[]) {
    if(!n || !/^n\d+$/.test(n.id) || ids.has(n.id) || !Number.isFinite(n.x) || n.x<0 || n.x>840 || !Number.isFinite(n.y) || n.y<0 || n.y>510) return false;
    ids.add(n.id);terminalKeys.add(`${n.id}:0`);
  }
  if (data.components.filter(c => c.type === 'battery').length > 1) return false;
  for (const w of data.wires) {
    if (!w || !/^w\d+$/.test(w.id) || wireIds.has(w.id) || !terminalKeys.has(w.a) || !terminalKeys.has(w.b) || w.a === w.b || (w.via && (!Array.isArray(w.via) || w.via.length > 20 || !w.via.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) < 5000 && Math.abs(p.y) < 5000)))) return false;
    wireIds.add(w.id);
  }
  return data.records.every(r => r && ['串联电路','并联电路','欧姆定律','自由搭建'].includes(r.experiment) && Number.isFinite(r.voltage) && Number.isFinite(r.current) && (r.resistance == null || Number.isFinite(r.resistance)) && /^\d{2}:\d{2}:\d{2}$/.test(r.time) && typeof r.createdAt === 'string' && Number.isFinite(Date.parse(r.createdAt)));
}
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  state = validStored(saved) ? saved : preset('series');
} catch { state = preset('series'); }
state.junctions ??= [];
selected = state.components.find(c => c.type === 'lamp')?.id ?? state.components[0]?.id ?? null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('saveStatus').innerHTML = '<span></span>已自动保存'; }
    catch { $('saveStatus').innerHTML = '<span></span>本次更改未保存'; }
  }, 180);
}
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}});
function pushHistory(snapshot = state) { history.push(clone(snapshot)); if (history.length > 50) history.shift(); $('undoButton').disabled = false; }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible'); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600); }
function confirmAction(title, description, callback) { $('confirmTitle').textContent = title; $('confirmDescription').textContent = description; confirmCallback = callback; $('confirmDialog').showModal(); }
function getComponent(id) { return state.components.find(c => c.id === id); }
function getJunction(id) { return state.junctions.find(n=>n.id===id); }
function getItem(id) { return getComponent(id)??getJunction(id); }
function getWire(id) { return state.wires.find(w=>w.id===id); }
function label(c) { return `${definitions[c.type].prefix}${c.id.match(/\d+/)?.[0] ?? ''}`; }
function terminalPoint(key) {
  const [id, index] = key.split(':'); const c = getComponent(id); if (!c) return getJunction(id)??{ x: 0, y: 0 };
  const radians = c.angle * Math.PI / 180, offset = index === '0' ? -54 : 54;
  return { x: c.x + offset * Math.cos(radians), y: c.y + offset * Math.sin(radians) };
}
function wirePath(w) {
  return wirePoints(w,terminalPoint).map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
}
function symbol(c, thumbnail = false) {
  const reading = solution?.components[c.id];
  const active=!thumbnail && state?.running && Math.abs(reading?.current??0)>1e-8;
  if(c.type==='junction') return '<path d="M-48 0H48M0-25v50"/><circle r="8" fill="#8c70b2"/>';
  if (c.type === 'battery') return '<path d="M-54 0h46M8 0h46M-8-24v48M8-13v26"/><text class="battery-polarity" x="-28" y="-12">+</text><text class="battery-polarity" x="24" y="-12">−</text>';
  if (c.type === 'resistor') return '<path d="M-54 0h26m56 0h26"/><rect x="-28" y="-13" width="56" height="26" rx="2"/><path d="M-21-6h42" opacity=".16"/>';
  if(c.type==='rheostat') return '<path d="M-54 0h26m56 0h26"/><rect x="-28" y="-12" width="56" height="24" rx="2"/><path d="m-18 25 36-50m-10 2 10-2v10"/>';
  if(c.type==='capacitor') return '<path d="M-54 0h46M8 0h46M-8-23v46M8-23v46"/>';
  if(c.type==='inductor') return '<path d="M-54 0h20C-34-25-12-25-12 0C-12-25 10-25 10 0C10-25 32-25 32 0h22"/>';
  if(c.type==='heater') return `<path d="M-54 0h21m66 0h21"/><path d="M-33 0-26-15-13 15 0-15 13 15 26-15 33 0" stroke="${active?'#d89467':'#8c78ac'}"/><path d="M-23-23q-5-6 0-12m23 12q-5-6 0-12m23 12q-5-6 0-12" stroke="${active?'#d6a085':'#b6a5c7'}" opacity="${active ? 0.8 : 0.25}"/>`;
  if(c.type==='motor') return `<path d="M-54 0h28m52 0h28"/><circle r="26"/><g class="${active?'motor-rotor active':'motor-rotor'}" stroke="#ad92c8"><path d="M0-19v38M-19 0h38m-13-13 26 26m-26 0 26-26"/></g><circle r="12" stroke="none" fill="#fdfcff"/>${thumbnail?'<text class="motor-letter" y="7">M</text>':''}`;
  if(c.type==='buzzer') return `<path d="M-54 0h25m43 0h40M-29-14h18L14-25v50l-25-11h-18Z"/><g class="${active?'buzzer-wave active':'buzzer-wave'}"><path d="M23-11q12 11 0 22M33-20q22 20 0 40" opacity="${active?1:.3}"/></g>`;
  if(c.type==='fuse') return `<path d="M-54 0h27m54 0h27"/><rect x="-27" y="-12" width="54" height="24" rx="3"/><path d="${c.blown?'M-22 0h10m24 0h10m-15-7 14 14m-14 0 14-14':'M-22 0h44'}" stroke="${c.blown?'#d97882':'#8c78ac'}"/>`;
  if (c.type === 'lamp') {
    const power = Math.abs(reading?.power ?? 0);
    const glow = !thumbnail && power > .0001;
    return `${glow ? `<circle r="48" fill="url(#lampGlow)" stroke="none" opacity="${Math.min(.95, .2 + power / 5)}"/>` : ''}<path d="M-54 0h28m52 0h28"/><circle r="26" fill="${glow ? '#fff5d6' : '#fdfcff'}" stroke="${glow ? '#c9ac6e' : '#8c78ac'}"/><path d="m-17-17 34 34m-34 0 34-34" stroke="${glow ? '#c7a065' : '#8c78ac'}"/>`;
  }
  if (c.type === 'switch') return `<path d="M-54 0h29M25 0h29M-23 0 23 ${c.closed ? 0 : -24}"/><circle cx="-25" cy="0" r="3"/><circle cx="25" cy="0" r="3"/>`;
  return `<path d="M-54 0h28m52 0h28"/><circle r="26"/>${thumbnail ? `<text class="meter-letter" y="8">${c.type === 'ammeter' ? 'A' : 'V'}</text>` : ''}`;
}
function thumbnail(type) { return `<svg viewBox="-62 -32 124 64" aria-hidden="true"><g class="component-symbol">${symbol({ type, closed: false }, true)}</g></svg>`; }
function renderLibrary() {
  $('libraryCount').textContent=`${Object.keys(definitions).length} 种元件`;
  $('componentLibrary').innerHTML = `<button class="component-card junction-card" data-add="junction" draggable="true" aria-label="添加接线节点"><span class="component-thumb">${thumbnail('junction')}</span><span><strong>接线节点</strong><small>Junction</small></span><span class="component-add">+</span></button>`+Object.entries(definitions).map(([type, d]) => `<button class="component-card" data-add="${type}" draggable="true" aria-label="添加${d.name}"><span class="component-thumb">${thumbnail(type)}</span><span><strong>${d.name}</strong><small>${d.english}</small></span><span class="component-add">+</span></button>`).join('');
}
function recompute() {
  solution=solveCircuit(state.components,state.wires,state.junctions);
  const overloaded=state.components.filter(c=>c.type==='fuse' && !c.blown && Math.abs(solution.components[c.id]?.current??0)>c.value+1e-9);
  if(overloaded.length) {
    overloaded.forEach(c=>c.blown=true);solution=solveCircuit(state.components,state.wires,state.junctions);
    toast(`${overloaded.map(label).join('、')} 已熔断：超过额定电流。检查电路后可更换保险丝。`);
  }
  return overloaded.length>0;
}
function renderBoard() {
  const focused = document.activeElement;
  const focusedSelector = focused?.dataset.terminal ? `[data-terminal="${focused.dataset.terminal}"]` : focused?.dataset.component ? `[data-component="${focused.dataset.component}"]` : focused?.dataset.wire ? `[data-wire="${focused.dataset.wire}"]` : null;
  const running = state.running && solution.powered;
  const defs = '<defs><radialGradient id="lampGlow"><stop offset="0" stop-color="#f6d373" stop-opacity=".7"/><stop offset="1" stop-color="#ffe69b" stop-opacity="0"/></radialGradient></defs>';
  const wires = state.wires.map(w => {
    const current = solution.wires?.[w.id] ?? 0;
    const points=wirePoints(w,terminalPoint);
    const hits=points.slice(1).map((p,i)=>{const a=points[i],dx=p.x-a.x,dy=p.y-a.y;return `<rect class="wire-segment-hit" x="0" y="-7" width="${Math.hypot(dx,dy)}" height="14" transform="translate(${a.x},${a.y}) rotate(${Math.atan2(dy,dx)*180/Math.PI})"/>`;}).join('');
    return `<g data-wire="${w.id}" role="button" tabindex="0" aria-label="导线 ${w.id}，双击添加节点，按 Delete 删除">${hits}<path class="wire-base ${selected===w.id?'selected':''}" d="${wirePath(w)}"/><path class="wire-hit" d="${wirePath(w)}"/>${running && state.showCurrent && Math.abs(current) > 1e-8 ? `<path class="wire-flow ${current < 0 ? 'reverse' : ''}" d="${wirePath(w)}"/>` : ''}</g>`;
  }).join('');
  const components = state.components.map(c => {
    const d = definitions[c.type], reading = solution.components[c.id];
    let detail = c.type==='fuse'&&c.blown?'已熔断':d.unit ? `${c.value} ${d.unit}` : c.type === 'switch' ? (c.closed ? '闭合' : '断开') : `${fixed(reading?.[c.type === 'ammeter' ? 'current' : 'voltage'] ?? 0)} ${c.type === 'ammeter' ? 'A' : 'V'}`;
    const vertical = c.angle % 180 === 90, lx = vertical ? -64 : 0, ly = vertical ? 4 : 47;
    return `<g class="component-group" data-component="${c.id}" role="button" tabindex="0" aria-label="${d.name} ${label(c)}，${detail}"><rect x="${c.x-60}" y="${c.y-34}" width="120" height="108" fill="transparent"/><title>${d.name} ${label(c)} · ${detail}${c.type === 'switch' ? '，双击切换通断' : ''}</title>${selected === c.id ? `<rect class="component-outline" x="${c.x - (vertical ? 97 : 66)}" y="${c.y - (vertical ? 66 : 43)}" width="${vertical ? 150 : 132}" height="${vertical ? 132 : 124}" rx="8"/>` : ''}<g class="component-symbol" transform="translate(${c.x},${c.y}) rotate(${c.angle})">${symbol(c)}</g>${c.type==='motor' ? `<text class="motor-letter" x="${c.x}" y="${c.y+7}">M</text>` : ''}${['ammeter','voltmeter'].includes(c.type) ? `<text class="meter-letter" x="${c.x}" y="${c.y+8}">${c.type === 'ammeter' ? 'A' : 'V'}</text>` : ''}<text class="component-name" x="${c.x + lx}" y="${c.y + ly}">${label(c)}</text><text class="component-value" x="${c.x + lx}" y="${c.y + ly + 18}">${detail}</text>${[0, 1].map(index => { const key = `${c.id}:${index}`, p = terminalPoint(key); return `<g data-terminal="${key}" role="button" tabindex="0" aria-label="连接 ${label(c)} 的接线端 ${index}"><circle class="terminal-hit" cx="${p.x}" cy="${p.y}" r="14"/><circle class="terminal ${pendingTerminal === key ? 'pending' : ''}" cx="${p.x}" cy="${p.y}" r="4.5"/>${['ammeter','voltmeter'].includes(c.type) ? `<text class="battery-polarity" x="${p.x+(vertical ? 10 : 0)}" y="${p.y-10}" text-anchor="middle">${index === 0 ? '+' : '−'}</text>` : ''}</g>`; }).join('')}</g>`;
  }).join('');
  const junctions=state.junctions.map(n=>`<g class="junction-group ${selected===n.id?'selected':''}" data-junction="${n.id}" data-terminal="${n.id}:0" role="button" tabindex="0" aria-label="接线节点 ${n.id.toUpperCase()}，拖动移动，Enter 连接"><title>接线节点 ${n.id.toUpperCase()} · 可连接多条支路</title><circle class="junction-hit" cx="${n.x}" cy="${n.y}" r="14"/><circle class="junction-ring" cx="${n.x}" cy="${n.y}" r="11"/><circle class="junction-dot ${pendingTerminal===`${n.id}:0`?'pending':''}" cx="${n.x}" cy="${n.y}" r="5"/></g>`).join('');
  let preview = '';
  if (pendingTerminal && lastPointer) { const p = terminalPoint(pendingTerminal); preview = `<path class="wire-preview" d="M${p.x} ${p.y} H${lastPointer.x} V${lastPointer.y}"/>`; }
  const empty = state.components.length ? '' : '<text class="canvas-empty" x="420" y="235">你的第一个电路，从这里开始。</text><text class="canvas-empty" x="420" y="267" style="font-size:11px">点击左侧元件，或把它拖入画布</text>';
  $('board').innerHTML = defs + wires + components + junctions + preview + empty;
  $('board').setAttribute('data-tool', tool);
  const width = 840 / zoom, height = 510 / zoom;
  $('board').setAttribute('viewBox', `${420 - width / 2} ${255 - height / 2} ${width} ${height}`);
  if (focusedSelector) $('board').querySelector(focusedSelector)?.focus({preventScroll:true});
}
function renderReadings() {
  const current = solution.current;
  const battery = state.components.find(c => c.type === 'battery');
  $('totalCurrent').textContent = fixed(current);
  $('totalVoltage').textContent = fixed(battery?.value ?? 0);
  $('totalResistance').textContent = solution.resistance == null ? (solution.status === 'open' ? '∞' : '—') : fixed(solution.resistance, 1);
  $('currentBar').style.width = `${Math.min(100, current / 2 * 100)}%`;
  const status = $('circuitStatus');
  const text = !state.running ? '模拟已暂停' : { ok: '电路已接通', open: '电路未接通', short: '电源短路', invalid: '请检查连接' }[solution.status];
  status.innerHTML = `<span></span>${text}`;
  status.className = `circuit-status${['short', 'invalid'].includes(solution.status) ? ' danger' : solution.status === 'open' || !state.running ? ' warning' : ''}`;
  $('runButton').innerHTML = `${icon(state.running ? 'pause' : 'play')}<span>${state.running ? '暂停模拟' : '开始模拟'}</span>`;
  $('runButton').setAttribute('aria-pressed', String(state.running));
  document.querySelector('.live-tag').style.opacity = state.running ? 1 : .35;
  const reading = solution.components[selected];
  if ($('selectedVoltage')) $('selectedVoltage').textContent = `${fixed(getJunction(selected)?solution.nodes[`${selected}:0`]??0:reading?.voltage ?? 0)} V`;
  if ($('selectedCurrent')) $('selectedCurrent').textContent = `${fixed(reading?.current ?? 0)} A`;
  if($('selectedPower')) $('selectedPower').textContent=`${fixed(Math.abs(reading?.power??0))} W`;
}
function renderProperties() {
  const c = getComponent(selected), panel = $('componentProperties');
  const n=getJunction(selected), w=getWire(selected);
  if(n) {
    const connections=state.wires.filter(w=>w.a===`${n.id}:0`||w.b===`${n.id}:0`).length;
    panel.innerHTML=`<div class="selected-info"><span class="selected-icon">${thumbnail('junction')}</span><div><strong>接线节点 ${n.id.toUpperCase()}</strong><small>实心节点上的导线相互接通</small></div></div><div class="junction-property">已连接 <b>${connections}</b> 条导线<br>位置 X ${Math.round(n.x)} · Y ${Math.round(n.y)}<br>对电源负极电位 <b id="selectedVoltage">—</b></div><p class="node-instructions">拖动节点可以调整走线；切换连线工具 W，从节点引出更多支路。普通导线交叉时不接通。</p><div class="property-actions"><button id="startNodeWire">${icon('wire')}从此节点连线</button><button id="deleteComponent">${icon('trash')}删除</button></div>`;
    $('startNodeWire').onclick=()=>{setTool('wire');pendingTerminal=`${n.id}:0`;renderBoard();};$('deleteComponent').onclick=()=>removeJunction(n.id);renderReadings();return;
  }
  if(w) {
    panel.innerHTML=`<div class="selected-info"><span class="selected-icon">${icon('wire')}</span><div><strong>导线</strong><small>双击导线可插入接线节点</small></div></div><p class="node-instructions">添加节点后，可以从此处引出支路，也可以拖动节点调整拐弯位置。点击节点工具 J，再点击这根导线。</p><div class="property-actions"><button id="insertNodeTool">${icon('junction')}添加节点</button><button id="deleteWire">${icon('trash')}删除导线</button></div>`;
    $('insertNodeTool').onclick=()=>setTool('junction');$('deleteWire').onclick=()=>removeWire(w.id);return;
  }
  if (!c) { panel.innerHTML = '<div class="empty-properties">选择画布上的元件，<br>查看读数或调整参数。</div>'; return; }
  const d = definitions[c.type], name = `${d.name} ${label(c)}`;
  const parameter={battery:['电源电压','U'],capacitor:['电容量','C'],inductor:['电感量','L'],fuse:['额定电流','I'],rheostat:['有效电阻','R']}[c.type]??['电阻值','R'];
  const title = `<div class="selected-info"><span class="selected-icon">${thumbnail(c.type)}</span><div><strong>${name}</strong><small>${d.note??(c.type === 'lamp' ? '固定电阻灯泡模型' : c.type === 'battery' ? '理想直流电源' : c.type === 'resistor' ? '可调电阻' : c.type === 'switch' ? '双击开关也可切换' : c.type === 'ammeter' ? '理想电流表 · 串联接入' : '理想电压表 · 并联接入')}</small></div></div>`;
  const control = d.unit ? `<div class="property-label"><span>${parameter[0]}</span><b>${parameter[1]}</b></div><label class="value-input"><input id="propertyNumber" type="number" min="${d.min}" max="${d.max}" step="${d.step}" value="${c.value}" aria-label="${name} ${parameter[0]}"><span>${d.unit}</span></label><input id="propertyRange" type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${c.value}" aria-label="滑动调整${name}"><div class="range-labels"><span>${d.min} ${d.unit}</span><span>${d.max} ${d.unit}</span></div>` : c.type === 'switch' ? `<button id="switchToggle" class="switch-action">${c.closed ? '断开开关' : '闭合开关'}</button>` : '<div class="property-label"><span>测量时请注意接线极性</span></div>';
  panel.innerHTML = title + control + (c.type==='fuse' && c.blown ? '<button id="replaceFuse" class="switch-action">更换保险丝</button>' : '') + `<div class="component-readings"><span>U<b id="selectedVoltage">—</b></span><span>I<b id="selectedCurrent">—</b></span></div><div class="component-power">电功率 <b id="selectedPower">—</b></div><div class="property-actions"><button id="rotateComponent">${icon('rotate')}旋转 90°</button><button id="deleteComponent">${icon('trash')}删除</button></div>`;
  $('rotateComponent').onclick = () => { pushHistory(); c.angle = (c.angle + 90) % 360; clearRoutes(c.id); update(); renderProperties(); renderReadings(); };
  $('deleteComponent').onclick = () => removeComponent(c.id);
  if ($('switchToggle')) $('switchToggle').onclick = () => toggleSwitch(c.id);
  if($('replaceFuse')) $('replaceFuse').onclick=()=>{pushHistory();c.blown=false;update();renderProperties();};
  if (d.unit) {
    for (const id of ['propertyNumber', 'propertyRange']) {
      $(id).addEventListener('focus', () => { propertyBefore = clone(state); });
      $(id).addEventListener('pointerdown', () => { propertyBefore = clone(state); });
      $(id).addEventListener('input', () => {
        const value = Number($(id).value); if (!Number.isFinite(value) || value < d.min || value > d.max || $(id).value === '') return;
        c.value = Math.round(value * 100) / 100;
        $(id === 'propertyNumber' ? 'propertyRange' : 'propertyNumber').value = c.value;
        recompute(); renderBoard(); renderReadings(); save();
      });
      $(id).addEventListener('change', () => {
        const value = Number($(id).value);
        if ($(id).value === '' || !Number.isFinite(value) || value < d.min || value > d.max) {
          $(id).value = c.value; toast(`请输入 ${d.min}–${d.max} ${d.unit} 之间的数值`);
        }
        if (propertyBefore && JSON.stringify(propertyBefore.components) !== JSON.stringify(state.components)) pushHistory(propertyBefore);
        propertyBefore = clone(state);
        if(c.type==='fuse'&&c.blown)renderProperties();
      });
    }
  }
  renderReadings();
}
function update() { const fuseChanged=recompute(); renderBoard(); renderReadings();if(fuseChanged||getJunction(selected))renderProperties(); save(); $('undoButton').disabled = !history.length; }
function setTool(value) {
  tool = value; pendingTerminal = null;
  document.querySelectorAll('[data-tool]').forEach(el => { if (el.tagName === 'BUTTON') { el.classList.toggle('active', el.dataset.tool === value); el.setAttribute('aria-pressed', String(el.dataset.tool === value)); } });
  $('boardHint').innerHTML = `${icon(value==='junction'?'junction':value === 'wire' ? 'wire' : value === 'erase' ? 'eraser' : 'cursor')}<span>${value==='junction'?'点击空白放置节点 · 点击导线插入节点':value === 'wire' ? '点击接线端或节点 · 点击空白添加拐点 · Esc 取消' : value === 'erase' ? '点击元件、节点或导线删除 · Ctrl+Z 撤销' : '拖动元件或节点 · 双击导线添加节点 · J 节点 / W 连线'}</span>`;
  renderBoard();
}
function selectComponent(id) { selected = id; renderBoard(); renderProperties(); }
function renderSelection() {
  $('board').querySelectorAll('[data-junction]').forEach(el=>el.classList.toggle('selected',el.dataset.junction===selected));
  $('board').querySelectorAll('[data-wire] .wire-base').forEach(el=>el.classList.toggle('selected',el.parentElement.dataset.wire===selected));
  $('board').querySelectorAll('.component-outline').forEach(el => el.remove());
  const c = getComponent(selected), group = c && $('board').querySelector(`[data-component="${c.id}"]`);
  if (!group) return;
  const vertical = c.angle % 180 === 90, outline = document.createElementNS(svgNS, 'rect');
  for (const [key,value] of Object.entries({class:'component-outline',x:c.x-(vertical?97:66),y:c.y-(vertical?66:43),width:vertical?150:132,height:vertical?132:124,rx:8})) outline.setAttribute(key,String(value));
  group.prepend(outline);
}
function addComponent(type, point) {
  if(type==='junction') {placeJunction(point??{x:420,y:255});return;}
  if (state.components.length >= 40) { toast('画布最多支持 40 个元件'); return; }
  if (type === 'battery' && state.components.some(c => c.type === 'battery')) { toast('当前实验使用一个电源。选择现有电源即可调整电压。'); return; }
  pushHistory();
  const number = state.components.filter(c => c.type === type).reduce((n, c) => Math.max(n, Number(c.id.slice(1))), 0) + 1;
  const prefix = definitions[type].idPrefix??({battery:'e',lamp:'l',resistor:'r',switch:'s',ammeter:'a',voltmeter:'v'}[type]??type[0]);
  const position = point ?? { x: 260 + (state.nextId % 4) * 110, y: 220 + (Math.floor(state.nextId / 4) % 2) * 90 };
  const c = component(`${prefix}${number}`, type, Math.max(90, Math.min(750, position.x)), Math.max(75, Math.min(420, position.y)), undefined, type === 'battery' ? 90 : 0);
  state.components.push(c); state.nextId++; state.preset = 'free'; selected = c.id;
  setTool('select'); updatePresetUI(); update(); renderProperties(); toast(`已添加${definitions[type].name}，点击接线端连接电路`);
}
function clearRoutes(id) { for (const w of state.wires) if (w.a.startsWith(`${id}:`) || w.b.startsWith(`${id}:`)) delete w.via; }
function removeComponent(id) {
  pushHistory(); state.components = state.components.filter(c => c.id !== id); state.wires = state.wires.filter(w => !w.a.startsWith(`${id}:`) && !w.b.startsWith(`${id}:`));
  if (selected === id) selected = null; pendingTerminal = null; state.preset = 'free'; updatePresetUI(); update(); renderProperties();
}
function removeJunction(id) {
  pushHistory();state.junctions=state.junctions.filter(n=>n.id!==id);state.wires=state.wires.filter(w=>w.a!==`${id}:0`&&w.b!==`${id}:0`);
  selected=null;pendingTerminal=null;state.preset='free';updatePresetUI();update();renderProperties();
}
function nextWireId() {return `w${Date.now()}${state.nextId++}`;}
function placeJunction(point,wireId=null) {
  const source=pendingTerminal, target=wireId&&getWire(wireId);
  const projection=target&&projectOnWire(target,point,terminalPoint);
  if(target&&!projection) return;
  const p=projection?.point??{x:Math.max(20,Math.min(820,Math.round(point.x/10)*10)),y:Math.max(20,Math.min(490,Math.round(point.y/10)*10))};
  if(target) {
    const endpoint=[target.a,target.b].find(key=>{const t=terminalPoint(key);return Math.hypot(p.x-t.x,p.y-t.y)<1;});
    if(endpoint) {if(source) connectTerminal(endpoint);else {selected=endpoint.split(':')[0];if(tool==='wire')pendingTerminal=endpoint;renderSelection();renderProperties();renderBoard();}return;}
  }
  const existing=state.junctions.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<(target ? 0.1 : 6)), key=existing?`${existing.id}:0`:null;
  const crossing=target?state.wires.filter(w=>{const hit=projectOnWire(w,p,terminalPoint);return hit&&hit.distance<.1&&splitWire(w,p,terminalPoint,'candidate:0','candidateWire');}):[];
  const needsConnection=source&&source!==key&&!state.wires.some(w=>(w.a===source&&w.b===key)||(w.b===source&&w.a===key));
  if((!existing&&state.junctions.length>=100)||state.wires.length+crossing.length+(needsConnection?1:0)>200){toast('最多支持 100 个节点和 200 根导线');return;}
  pushHistory();
  const n=existing??{id:`n${state.nextId++}`,x:p.x,y:p.y};if(!existing)state.junctions.push(n);
  const terminal=`${n.id}:0`, crossingIds=new Set(crossing.map(w=>w.id));
  state.wires=state.wires.flatMap(w=>crossingIds.has(w.id)?splitWire(w,p,terminalPoint,terminal,nextWireId())?.wires??[w]:[w]);
  if(source&&source!==terminal&&!state.wires.some(w=>(w.a===source&&w.b===terminal)||(w.b===source&&w.a===terminal)))state.wires.push({id:nextWireId(),a:source,b:terminal});
  selected=n.id;pendingTerminal=target?(source?null:tool==='wire'?terminal:null):(tool==='wire'||source?terminal:null);
  state.preset='free';updatePresetUI();update();renderProperties();
  if(tool==='junction'||(!source&&target))toast('已添加接线节点。拖动可调整走线，从节点可以引出支路。');
}
function connectTerminal(key) {
  if (!pendingTerminal) { pendingTerminal = key; renderBoard(); return; }
  if (pendingTerminal === key) { pendingTerminal = null; renderBoard(); return; }
  if (state.wires.some(w => (w.a === pendingTerminal && w.b === key) || (w.b === pendingTerminal && w.a === key))) { toast('这两个接线端已经连接'); pendingTerminal = null; renderBoard(); return; }
  if (state.wires.length >= 200) { toast('画布最多支持 200 根导线'); pendingTerminal = null; renderBoard(); return; }
  pushHistory(); state.wires.push({ id: `w${Date.now()}${state.nextId++}`, a: pendingTerminal, b: key }); pendingTerminal = null;
  state.preset = 'free'; updatePresetUI(); update(); if (solution.status === 'short') toast('检测到电源短路：请断开跨接电源两端的导线，或串入电阻。');
}
function toggleSwitch(id) { const c = getComponent(id); if (c?.type !== 'switch') return; pushHistory(); c.closed = !c.closed; selected = id; update(); renderProperties(); }
function updatePresetUI() {
  $('presetSelect').value = state.preset;
  document.querySelectorAll('[data-preset]').forEach(el => el.classList.toggle('active-experiment', el.dataset.preset === state.preset));
  const tips = { series: ['串联电路中，电流处处相等，总电压等于各部分电压之和。', 'I = I₁ = I₂ · U = U₁ + U₂'], parallel: ['并联各支路电压相等，干路电流等于各支路电流之和。', 'U = U₁ = U₂ · I = I₁ + I₂'], ohm: ['保持电阻不变，导体中的电流与两端电压成正比。', 'I = U / R'], free: ['电流表串联接入电路，电压表并联在被测元件两端。', 'I = U / R'] }[state.preset];
  $('physicsTip').textContent = tips[0]; $('physicsFormula').textContent = tips[1];
}
function loadPreset(name) {
  pushHistory(); state = preset(name); selected = state.components.find(c => c.type === 'lamp' || c.type === 'resistor')?.id ?? null;
  pendingTerminal = null; zoom = 1; $('zoomLabel').textContent = '100%'; $('currentToggle').checked = true; setTool('select'); updatePresetUI(); update(); renderProperties();
  toast(name === 'free' ? '空白画布已准备好，开始搭建你的电路吧' : `已载入「${$('presetSelect').selectedOptions[0].textContent}」`);
}

function pointFromEvent(event) {
  const p = $('board').createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
  const matrix = $('board').getScreenCTM(); return matrix ? p.matrixTransform(matrix.inverse()) : { x: 420, y: 255 };
}
$('board').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const terminal=event.target.closest('[data-terminal]'),componentEl=event.target.closest('[data-component]'),wireEl=event.target.closest('[data-wire]'),junctionEl=event.target.closest('[data-junction]');
  if (terminal && tool!=='erase' && tool!=='junction' && (!junctionEl || tool==='wire' || pendingTerminal)) { event.stopPropagation(); connectTerminal(terminal.dataset.terminal); return; }
  if (tool === 'erase') {
    if (componentEl) removeComponent(componentEl.dataset.component);
    else if(junctionEl) removeJunction(junctionEl.dataset.junction);
    else if (wireEl) { removeWire(wireEl.dataset.wire); }
    return;
  }
  if(tool==='junction') {if(!componentEl)placeJunction(pointFromEvent(event),wireEl?.dataset.wire);return;}
  if(wireEl&&(tool==='wire'||pendingTerminal)) {placeJunction(pointFromEvent(event),wireEl.dataset.wire);return;}
  if(!terminal&&!componentEl&&!wireEl&&(tool==='wire'||pendingTerminal)) {placeJunction(pointFromEvent(event));return;}
  if ((componentEl||junctionEl) && tool === 'select') {
    const c = getItem(componentEl?.dataset.component??junctionEl.dataset.junction), p = pointFromEvent(event);
    drag = { id: c.id, offsetX: p.x - c.x, offsetY: p.y - c.y, before: clone(state), moved: false, startX: p.x, startY: p.y };
    selected = c.id; renderProperties(); renderSelection();
  } else if(wireEl&&tool==='select'){selected=wireEl.dataset.wire;renderProperties();renderSelection();}
  else if (!componentEl && !wireEl && tool === 'select') { selected = null; renderProperties(); renderBoard(); }
});
$('board').addEventListener('pointermove', event => {
  const p = pointFromEvent(event); lastPointer = p;
  if (drag) {
    if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) < 4) return;
    if (!drag.moved) $('board').setPointerCapture(event.pointerId);
    const c=getItem(drag.id),node=Boolean(getJunction(c.id));c.x=Math.max(node?20:90,Math.min(node?820:750,Math.round((p.x-drag.offsetX)/10)*10));c.y=Math.max(node?20:75,Math.min(node?490:420,Math.round((p.y-drag.offsetY)/10)*10));
    drag.moved = true; clearRoutes(c.id); renderBoard();
  } else if (pendingTerminal) renderBoard();
});
function endDrag() { if (!drag) return; if (drag.moved) { pushHistory(drag.before); update();renderProperties(); } drag = null; }
$('board').addEventListener('pointerup', endDrag); $('board').addEventListener('pointercancel', endDrag);
$('board').addEventListener('pointerleave', endDrag);
$('board').addEventListener('dblclick', event => {const el=event.target.closest('[data-component]'),wire=event.target.closest('[data-wire]');if(el&&!event.target.closest('[data-terminal]'))toggleSwitch(el.dataset.component);else if(wire&&tool==='select')placeJunction(pointFromEvent(event),wire.dataset.wire);});
function removeWire(id) { pushHistory(); state.wires = state.wires.filter(w => w.id !== id); state.preset = 'free'; pendingTerminal = null;if(selected===id)selected=null;updatePresetUI();update();renderProperties(); }
$('board').addEventListener('keydown', event => {
  const wire = event.target.closest('[data-wire]'),node=event.target.closest('[data-junction]');
  if(node&&['Delete','Backspace'].includes(event.key)){event.preventDefault();event.stopPropagation();removeJunction(node.dataset.junction);return;}
  if(wire&&event.key==='Enter'){event.preventDefault();const points=wirePoints(getWire(wire.dataset.wire),terminalPoint);if(points.length>1)placeJunction({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2},wire.dataset.wire);return;}
  if (wire && ['Delete','Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); removeWire(wire.dataset.wire); return; }
  if (['Enter', ' '].includes(event.key)) {
    event.preventDefault(); const terminal = event.target.closest('[data-terminal]'), c = event.target.closest('[data-component]');
    if (terminal) connectTerminal(terminal.dataset.terminal); else if (c) { selectComponent(c.dataset.component); if (event.key === ' ') toggleSwitch(c.dataset.component); }
  }
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) && tool === 'select') {
    const el=event.target.closest('[data-component]')??node,c=el&&getItem(el.dataset.component??el.dataset.junction);if(!c)return;
    event.preventDefault();pushHistory();c.x=Math.max(node?20:90,Math.min(node?820:750,c.x+(event.key==='ArrowRight'?10:event.key==='ArrowLeft'?-10:0)));c.y=Math.max(node?20:75,Math.min(node?490:420,c.y+(event.key==='ArrowDown'?10:event.key==='ArrowUp'?-10:0)));clearRoutes(c.id);selected=c.id;update();renderProperties();$('board').querySelector(`[${node?'data-junction':'data-component'}="${c.id}"]`)?.focus();
  }
});
document.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => setTool(button.dataset.tool));
$('componentLibrary').addEventListener('click', event => { const button = event.target.closest('[data-add]'); if (button) addComponent(button.dataset.add); });
$('componentLibrary').addEventListener('dragstart', event => { const button = event.target.closest('[data-add]'); if (button) { event.dataTransfer.setData('text/circuit-component', button.dataset.add); event.dataTransfer.effectAllowed = 'copy'; } });
$('boardWrap').addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
$('boardWrap').addEventListener('drop', event => { event.preventDefault(); const type = event.dataTransfer.getData('text/circuit-component'); if (type==='junction'||Object.hasOwn(definitions,type)) addComponent(type, pointFromEvent(event)); });
$('runButton').onclick = () => { state.running = !state.running; update(); };
$('currentToggle').checked = state.showCurrent;
$('currentToggle').onchange = () => { state.showCurrent = $('currentToggle').checked; renderBoard(); save(); };
$('undoButton').onclick = () => { if (!history.length) return; const records = state.records; state = history.pop(); state.records = records;state.junctions??=[]; selected = getItem(selected)||getWire(selected) ? selected : state.components[0]?.id ?? null; pendingTerminal = null; $('currentToggle').checked = state.showCurrent; updatePresetUI(); update(); renderProperties(); toast('已撤销上一步操作'); };
function setZoom(value) { zoom = Math.max(.65, Math.min(1.65, value)); $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`; renderBoard(); }
$('zoomIn').onclick = () => setZoom(zoom + .1); $('zoomOut').onclick = () => setZoom(zoom - .1); $('fitButton').onclick = () => setZoom(1);
$('checkButton').onclick = () => {
  const floating = state.components.filter(c => !state.wires.some(w => w.a.startsWith(`${c.id}:`) || w.b.startsWith(`${c.id}:`)));
  toast(solution.status === 'ok' ? `电路连接正确。${floating.length ? `有 ${floating.length} 个元件尚未接入。` : ''}电流 ${fixed(solution.current)} A，等效电阻 ${solution.resistance == null ? '—' : fixed(solution.resistance, 1)} Ω。` : solution.message);
};
$('presetSelect').onchange = () => loadPreset($('presetSelect').value);
document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => loadPreset(button.dataset.preset));
$('resetButton').onclick = () => confirmAction('重置当前实验？', '元件位置、连接和参数将恢复为当前实验的初始状态。已记录的实验数据会保留，也可以撤销这次操作。', () => loadPreset(state.preset));
$('clearButton').onclick = () => confirmAction('清空实验画布？', '画布上的元件和导线将被移除。实验数据会保留，你可以通过撤销恢复电路。', () => loadPreset('free'));
$('confirmAction').onclick = () => { $('confirmDialog').close(); confirmCallback?.(); confirmCallback = null; };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
document.addEventListener('keydown', event => {
  if (['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName) || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') { pendingTerminal = null; setTool('select'); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $('undoButton').click(); }
  if (!event.ctrlKey && !event.metaKey) {
    if (event.key.toLowerCase() === 'v') setTool('select'); if (event.key.toLowerCase() === 'w') setTool('wire'); if (event.key.toLowerCase() === 'e') setTool('erase');
    if(event.key.toLowerCase()==='j')setTool('junction');
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { event.preventDefault();if(getJunction(selected))removeJunction(selected);else if(getWire(selected))removeWire(selected);else removeComponent(selected); }
  }
});

function renderData() {
  $('recordBadge').textContent = state.records.length; $('dataCount').textContent = state.records.length;
  if (activeTab === 'chart') { renderChart(); return; }
  const rows = state.records.map((r, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${r.experiment}</td><td>${fixed(r.voltage)}</td><td>${fixed(r.current)}</td><td>${r.resistance == null ? '—' : fixed(r.resistance, 1)}</td><td>${r.time}</td><td><button class="row-delete" data-delete-record="${index}" title="删除这条记录" aria-label="删除第 ${index + 1} 条记录">${icon('trash')}</button></td></tr>`).join('');
  $('dataContent').innerHTML = `<div class="table-scroll"><table class="data-table"><thead><tr><th>序号</th><th>实验类型</th><th>电源电压 U / V</th><th>总电流 I / A</th><th>等效电阻 R / Ω</th><th>记录时间</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${rows ? '' : `<div class="data-empty">${icon('notebook')}还没有实验数据，点击「记录本次数据」保存你的第一次观察。</div>`}`;
}
function renderChart() {
  const records = state.records, W = 520, H = 190, L = 45, R = 17, T = 18, B = 33;
  if (!records.length) { $('dataContent').innerHTML = `<div class="data-empty" style="min-height:150px">${icon('chart')}记录数据后，在这里比较电压和电流的关系。</div>`; return; }
  const maxU = Math.max(1, ...records.map(r => r.voltage)) * 1.15, maxI = Math.max(.1, ...records.map(r => r.current)) * 1.15;
  const x = u => L + u / maxU * (W-L-R), y = i => H-B-i/maxI*(H-T-B);
  const grid = Array.from({length: 5}, (_, n) => { const yy = T + n / 4 * (H-T-B); return `<path d="M${L} ${yy}H${W-R}" stroke="#efebf6"/><text x="${L-9}" y="${yy+3}" text-anchor="end" fill="#aaa0b7" font-size="9">${fixed(maxI*(1-n/4))}</text>`; }).join('');
  const labels = Array.from({length: 5}, (_, n) => `<text x="${L+n/4*(W-L-R)}" y="${H-B+18}" text-anchor="middle" fill="#aaa0b7" font-size="9">${fixed(maxU*n/4,1)}</text>`).join('');
  const dots = records.map((r,index) => `<circle cx="${x(r.voltage)}" cy="${y(r.current)}" r="4" fill="#9b7bd5" stroke="white" stroke-width="1.5"><title>记录 ${index+1}：${fixed(r.voltage)} V，${fixed(r.current)} A，${r.experiment}</title></circle>`).join('');
  $('dataContent').innerHTML = `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="已记录电源电压与总电流的散点图">${grid}<path d="M${L} ${T}V${H-B}H${W-R}" stroke="#d6cddd" fill="none"/>${labels}${dots}<text x="9" y="12" fill="#a397b0" font-size="9">I / A</text><text x="${W-27}" y="${H-1}" fill="#a397b0" font-size="9">U / V</text></svg><div class="chart-note"><strong>从数据中，发现规律。</strong>每个点代表一次记录。保持同一个电路和电阻值不变，再改变电源电压，观察电流怎样变化。<div class="chart-legend"><span></span>已记录的实验数据 · ${records.length} 个点</div></div></div>`;
}
document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { activeTab = button.dataset.tab; document.querySelectorAll('[data-tab]').forEach(el => el.classList.toggle('active', el === button)); renderData(); });
$('recordButton').onclick = () => {
  if (!state.running) { toast('请先开始模拟，再记录测量数据'); return; }
  if (solution.status !== 'ok') { toast('请先连接一个完整电路，再记录实验数据'); return; }
  if (state.records.length >= 500) { toast('已达到 500 条记录，请先导出数据并删除部分记录'); return; }
  const battery = state.components.find(c => c.type === 'battery');
  const time = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  state.records.push({ experiment: {series:'串联电路',parallel:'并联电路',ohm:'欧姆定律',free:'自由搭建'}[state.preset], voltage:battery?.value ?? 0, current:solution.current, resistance:solution.resistance, time, createdAt:new Date().toISOString(), circuit:clone({components:state.components,wires:state.wires,junctions:state.junctions}) });
  save(); renderData(); toast(`已记录第 ${state.records.length} 次观察`);
};
$('dataContent').addEventListener('click', event => { const button = event.target.closest('[data-delete-record]'); if (!button) return; state.records.splice(Number(button.dataset.deleteRecord),1); save(); renderData(); toast('记录已删除'); });
$('exportButton').onclick = () => {
  if (!state.records.length) { toast('记录实验数据后即可导出 CSV 文件'); return; }
  const header = ['序号','实验类型','电源电压(V)','总电流(A)','等效电阻(Ω)','记录时间'];
  const csvCell = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  const csv = '\uFEFF' + [header, ...state.records.map((r,i) => [i+1,r.experiment,r.voltage,r.current,r.resistance,r.createdAt])].map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `电路实验数据-${new Date().toLocaleDateString('sv-SE')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); toast('实验数据已导出');
};
$('recordsNav').onclick = () => { activeTab = 'table'; document.querySelectorAll('[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === 'table')); renderData(); $('dataPanel').scrollIntoView({behavior:'smooth',block:'center'}); };
$('labNav').onclick = () => document.querySelector('.workspace').scrollIntoView({behavior:'smooth',block:'center'});

const guides = {
  series: { title:'探索串联电路', intro:'沿着一条路径流动的电流，会在不同元件之间发生什么？', steps:['观察画布：电源、开关、电流表、小灯泡和电阻串联，电压表并联在灯泡两端。','选中小灯泡或电阻，比较各自的电流和电压读数。电流是否相等？各部分电压之和是否等于电源电压？','改变一个电阻值，观察电流和灯泡亮度的变化，并记录至少三组数据。','断开开关，看看电流和小灯泡发生什么变化。'], formula:'I = I₁ = I₂ &nbsp;&nbsp; U = U₁ + U₂ &nbsp;&nbsp; R = R₁ + R₂' },
  parallel: { title:'探索并联电路', intro:'当电流有了两条路可走，它会怎样分配？', steps:['载入并联实验。两个小灯泡分别位于两条支路，电流表测量干路电流。','分别选中两个灯泡，比较两端电压。把支路电流相加，再与总电流比较。','把 L₂ 的电阻从 10 Ω 改为 20 Ω，观察两条支路的电流和灯泡亮度。','删除一条灯泡支路的导线，观察另一个灯泡是否继续发光。使用撤销恢复电路。'], formula:'U = U₁ = U₂ &nbsp;&nbsp; I = I₁ + I₂ &nbsp;&nbsp; 1/R = 1/R₁ + 1/R₂' },
  ohm: { title:'探究欧姆定律', intro:'保持电阻不变，电流怎样随电压改变？', steps:['载入欧姆定律实验，保持电阻 R₁ = 20 Ω 不变。电流表串联，电压表并联在电阻两端。','选中电源，分别将电压设为 2 V、4 V、6 V、8 V。每次改变后点击「记录本次数据」。','切换到「数据图表」，观察电压与电流散点的关系。计算每组 U / I，看看结果是否相同。','接着保持电压 6 V 不变，改变电阻值，探索电流与电阻之间的关系。'], formula:'I = U / R &nbsp;&nbsp; U / I = R' },
  help: { title:'你的电路实验工具箱', intro:'可以直接从经典实验开始，也可以选择「自由搭建」从零探索。', steps:['添加与移动：点击左侧元件，或拖入画布。拖动元件或接线节点调整位置，选中后用右侧面板调整参数、旋转或删除。','连接：按 W，点击端子或节点开始，点击空白位置可以连续添加节点控制拐弯，点击目标端子结束。按 J 可在任意位置放节点；双击导线可插入节点。实心节点处的支路互相接通，普通交叉不接通。','测量：电流表串联接入被测支路，电压表并联在被测元件两端。读数按接线端 0 → 1 取正；反接可能出现负值。','模拟与记录：双击开关切换通断，使用暂停按钮停止电流动画并保留读数。数据保存在当前浏览器中，可导出 CSV。清空画布保留记录。'], formula:'' }
};
function showGuide(name) {
  activeGuide = name; const g = guides[name];
  document.querySelectorAll('[data-guide]').forEach(el => el.classList.toggle('active', el.dataset.guide === name));
  $('guideContent').innerHTML = `<div class="guide-content"><h3>${g.title}</h3><p>${g.intro}</p><ol>${g.steps.map(step => `<li>${step}</li>`).join('')}</ol>${g.formula ? `<div class="guide-formula">${g.formula}</div>` : '<div class="guide-shortcuts"><span><kbd>V</kbd>选择与移动</span><span><kbd>W</kbd>连接导线</span><span><kbd>J</kbd>添加接线节点</span><span><kbd>E</kbd>删除工具</span><span><kbd>Ctrl+Z</kbd>撤销</span><span><kbd>Esc</kbd>取消连线</span><span><kbd>方向键</kbd>移动选中元件</span></div>'}<div class="guide-model">亮度用于定性显示电功率；灯泡电阻在本模型中固定，不模拟温度、电源内阻或电表量程。电动机、蜂鸣器以电阻近似，蜂鸣器不播放声音；电容稳态断路、理想线圈稳态短路，不模拟充放电。保险丝超过额定电流会熔断。孤立电压表无法确定电压，显示为 0。</div></div>`;
  $('startGuideExperiment').innerHTML = `${name === 'help' ? '回到实验室' : '开始这个实验'}${icon('arrow-right')}`;
  if (!$('guideDialog').open) $('guideDialog').showModal();
}
document.querySelectorAll('[data-guide]').forEach(button => button.onclick = () => showGuide(button.dataset.guide));
$('guideButton').onclick = $('guideNav').onclick = () => showGuide(state.preset === 'free' ? 'series' : state.preset);
$('helpButton').onclick = () => showGuide('help');
$('startGuideExperiment').onclick = () => { $('guideDialog').close(); if (activeGuide !== 'help') loadPreset(activeGuide); };

recompute(); renderLibrary(); updatePresetUI(); update(); renderProperties(); renderData();
