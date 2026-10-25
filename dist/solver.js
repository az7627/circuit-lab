/**
 * DC / backward-Euler transient solver. Currents run from terminal 0 to 1.
 * Wires and closed switches are exact zero-resistance connections; voltmeters
 * have infinite resistance. A voltage supernode formulation avoids the
 * singular matrices caused by open circuits and floating components.
 */
import {terminalIndices,contactIndex} from './terminals.js?v=2.6';
const TYPES = new Set(['battery','resistor','lamp','switch','spdt','ammeter','voltmeter','rheostat','motor','bell','buzzer','heater','capacitor','inductor','fuse','led']);
const RESISTIVE_TYPES = new Set(['resistor','lamp','rheostat','motor','bell','buzzer','heater']);
const resistanceOf = (component) => component.type === 'fuse' ? 0.2 : component.value;
const VOLTAGE_EPSILON = 1e-9;
export function motorBackEmf(voltage,resistance){return Math.sign(voltage)*Math.max(0,40/resistance*Math.abs(voltage)-.35)/(40/resistance+.72);}

class UnionFind {
  constructor(size) { this.parent = Array.from({ length: size }, (_, i) => i); }
  find(i) {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  join(a, b) { this.parent[this.find(a)] = this.find(b); }
}

const clean = (value) => Math.abs(value) < 1e-12 ? 0 : value;
// The off-state LED shunt only anchors floating nodes numerically. Suppress its
// sub-nanoamp leakage consistently in component, supply and cable readings.
const cleanCurrent = value => Math.abs(value)<1e-9?0:clean(value);
const zeroReading = () => ({ voltage: 0, current: 0, power: 0 });

function batteryPacks(branches,sources,group,voltage,passiveOutflow,readings,zeroUnion){
  const packs=new Map();
  const node=n=>zeroUnion.find(n),outflow=new Map();
  passiveOutflow.forEach((current,n)=>outflow.set(node(n),(outflow.get(node(n))??0)+current));
  for(const battery of branches.filter(b=>b.type==='battery')){
    const id=group[battery.a];if(!packs.has(id))packs.set(id,{batteries:[],vertices:new Set(),ports:new Set(),degree:new Map()});
    packs.get(id).batteries.push(battery);
  }
  for(const source of sources){const pack=packs.get(group[source.a]);if(!pack)continue;const a=node(source.a),b=node(source.b);for(const n of [a,b]){pack.vertices.add(n);if(a!==b)pack.degree.set(n,(pack.degree.get(n)??0)+1);}}
  for(const branch of branches){if(['battery','ammeter','inductor','spdt'].includes(branch.type)||(branch.type==='switch'&&branch.closed))continue;for(const n of [branch.a,branch.b])packs.get(group[n])?.ports.add(node(n));}
  return [...packs.values()].map(pack=>{
    if(pack.ports.size<2)for(const [n,degree] of pack.degree)if(degree===1)pack.ports.add(n);
    if(pack.ports.size<2){const first=[...pack.ports][0]??node(pack.batteries[0].a);pack.ports.add(first);const furthest=[...pack.vertices].reduce((a,b)=>Math.abs(voltage[a]-voltage[first])>=Math.abs(voltage[b]-voltage[first])?a:b,first);pack.ports.add(furthest);}
    const netPower=pack.batteries.reduce((sum,b)=>sum+readings[b.id].power,0);
    const twoPorts=pack.ports.size===2,ports=[...pack.ports];
    return {voltage:twoPorts?clean(Math.abs(voltage[ports[0]]-voltage[ports[1]])):null,
      current:netPower< -1e-12?(twoPorts?clean(Math.abs(outflow.get(ports[0])??0)):clean(pack.batteries.reduce((sum,b)=>sum+(readings[b.id].power<0?Math.abs(readings[b.id].current):0),0))):0};
  });
}

function emptyResult(components, status, message, wires = []) {
  const readings = Object.create(null);
  const nodes = Object.create(null);
  const wireReadings = Object.create(null);
  if (Array.isArray(components)) {
    for (const component of components) {
      if (component && typeof component.id === 'string') {
        readings[component.id] = zeroReading();
        for(const index of terminalIndices(component.type))nodes[`${component.id}:${index}`]=0;
      }
    }
  }
  if (Array.isArray(wires)) {
    for (const wire of wires) {
      if (wire && typeof wire.id === 'string') wireReadings[wire.id] = 0;
    }
  }
  return { status, message, components: readings, current: 0,
    resistance: status === 'short' ? 0 : null, powered: false, nodes, wires: wireReadings };
}

/** Solve a positive-definite, grounded graph Laplacian with scaled pivoting. */
function solveDense(matrix, rhs) {
  const n = rhs.length;
  if (!n) return [];
  const rows = matrix.map((row, i) => {
    const scale = Math.max(...row.map(Math.abs));
    if (!(scale > 0) || !Number.isFinite(scale)) throw new Error('Invalid conductance');
    return [...row.map((value) => value / scale), rhs[i] / scale];
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-14) throw new Error('Unresolved circuit');
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = rows[row][col] / rows[col][col];
      if (!factor) continue;
      rows[row][col] = 0;
      for (let j = col + 1; j <= n; j++) rows[row][j] -= factor * rows[col][j];
    }
  }
  const solution = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let value = rows[row][n];
    for (let j = row + 1; j < n; j++) value -= rows[row][j] * solution[j];
    solution[row] = value / rows[row][row];
    if (!Number.isFinite(solution[row])) throw new Error('Non-finite result');
  }
  return solution;
}

/** One reference potential per connected island, including isolated vertices. */
function solveGraph(vertexCount, edges, injection) {
  const connected = new UnionFind(vertexCount);
  for (const edge of edges) if (edge.a !== edge.b) connected.join(edge.a, edge.b);
  const reference = new Map();
  for (let i = 0; i < vertexCount; i++) {
    const island = connected.find(i);
    if (!reference.has(island)) reference.set(island, i);
  }
  const unknown = [];
  const index = new Map();
  for (let i = 0; i < vertexCount; i++) {
    if (reference.get(connected.find(i)) !== i) {
      index.set(i, unknown.length);
      unknown.push(i);
    }
  }
  const matrix = unknown.map(() => new Array(unknown.length).fill(0));
  const rhs = unknown.map((i) => injection[i]);
  for (const { a, b, weight } of edges) {
    if (a === b) continue;
    const ai = index.get(a), bi = index.get(b);
    if (ai !== undefined) matrix[ai][ai] += weight;
    if (bi !== undefined) matrix[bi][bi] += weight;
    if (ai !== undefined && bi !== undefined) {
      matrix[ai][bi] -= weight;
      matrix[bi][ai] -= weight;
    }
  }
  const solution = solveDense(matrix, rhs);
  const potential = new Array(vertexCount).fill(0);
  unknown.forEach((vertex, i) => { potential[vertex] = solution[i]; });
  return { potential, connected };
}

export function solveCircuit(components, wires, junctions = [], transient = null) {
  const invalid = (message = '元件或导线数据不完整，请检查参数。') =>
    emptyResult(components, 'invalid', message, wires);
  if (!Array.isArray(components) || !Array.isArray(wires) || !Array.isArray(junctions)) return invalid();
  const terminals = new Map();
  const ids = new Set();
  for (const component of components) {
    if (!component || typeof component.id !== 'string' || !component.id ||
      ids.has(component.id) || !TYPES.has(component.type)) return invalid();
    if(component.type==='spdt'&&![1,2].includes(component.position))return invalid('请选择双掷开关的支路 1 或 2。');
    if(component.type==='battery'&&component.internalResistance!==undefined&&(!Number.isFinite(component.internalResistance)||component.internalResistance<0))return invalid('电源内阻必须是非负有限数值。');
    if(component.type==='rheostat'&&component.slider!==undefined&&(!Number.isFinite(component.slider)||component.slider<0||component.slider>1))return invalid('滑片位置须在 0%–100% 之间。');
    if ((component.type === 'battery' || RESISTIVE_TYPES.has(component.type) || ['capacitor','inductor','fuse','led'].includes(component.type)) &&
      (typeof component.value !== 'number' || !Number.isFinite(component.value))) return invalid();
    if ((RESISTIVE_TYPES.has(component.type) || ['capacitor','inductor','fuse','led'].includes(component.type)) &&
      (!(component.value > 0) || !Number.isFinite(1 / component.value))) {
      return invalid('电阻值必须是大于零的有限数值。');
    }
    ids.add(component.id);
    for(const index of terminalIndices(component.type))terminals.set(`${component.id}:${index}`,terminals.size);
  }
  for(const junction of junctions) {
    if(!junction || typeof junction.id !== 'string' || !junction.id || ids.has(junction.id)) return invalid('接线节点数据不完整或标识重复。');
    ids.add(junction.id); terminals.set(`${junction.id}:0`,terminals.size);
  }
  const wireEdges = [];
  const wireIds = new Set();
  const union = new UnionFind(terminals.size);
  for (const wire of wires) {
    if (!wire || typeof wire.id !== 'string' || !wire.id || wireIds.has(wire.id) ||
      !terminals.has(wire.a) || !terminals.has(wire.b)) return invalid();
    wireIds.add(wire.id);
    const a = terminals.get(wire.a), b = terminals.get(wire.b);
    union.join(a, b);
    wireEdges.push({ a, b, weight: 1, wireId: wire.id });
  }
  for (const component of components) {
    if(component.type==='ammeter'||component.type==='voltmeter'){
      const low=wires.some(w=>w.a===`${component.id}:2`||w.b===`${component.id}:2`),high=wires.some(w=>w.a===`${component.id}:0`||w.b===`${component.id}:0`);
      if(low&&high)return invalid('同一电表的两个正接线柱不能同时接线，请选择一个量程。');
      const a=terminals.get(`${component.id}:0`),b=terminals.get(`${component.id}:2`);union.join(a,b);wireEdges.push({a,b,weight:1});
    }
    if ((component.type === 'switch' && component.closed) || component.type === 'spdt' || component.type === 'inductor') {
      const a = terminals.get(`${component.id}:0`), b = terminals.get(`${component.id}:${contactIndex(component)}`);
      union.join(a, b);
      wireEdges.push({ a, b, weight: 1, id: component.id });
    }
    if(component.type==='rheostat'){
      const position=component.slider??1;
      for(const [zero,one,id] of position===0?[[0,1,component.id]]:position===1?[[1,2,`${component.id}~right`]]:[]){const a=terminals.get(`${component.id}:${zero}`),b=terminals.get(`${component.id}:${one}`);union.join(a,b);wireEdges.push({a,b,weight:1,id});}
    }
  }
  const compact = new Map();
  const terminalNodes = [];
  for (let i = 0; i < terminals.size; i++) {
    const root = union.find(i);
    if (!compact.has(root)) compact.set(root, compact.size);
    terminalNodes[i] = compact.get(root);
  }
  const count = compact.size;
  const branches = components.flatMap(component=>{
    const make=(id,one,two,value=component.value)=>({...component,id,value,terminalA:`${component.id}:${one}`,terminalB:`${component.id}:${two}`,a:terminalNodes[terminals.get(`${component.id}:${one}`)],b:terminalNodes[terminals.get(`${component.id}:${two}`)]});
    return component.type==='rheostat'?[make(component.id,0,1,component.value*(component.slider??1)),make(`${component.id}~right`,1,2,component.value*(1-(component.slider??1)))]:[make(component.id,0,contactIndex(component))];
  });
  const sources = branches.filter((branch) => (branch.type === 'battery'&&!(branch.internalResistance>0)) || branch.type === 'ammeter')
    .map((branch) => ({ ...branch, emf: branch.type === 'battery' ? branch.value : 0, weight: 1 }));
  const zeroUnion = new UnionFind(count);
  for (const source of sources) if (source.emf === 0) zeroUnion.join(source.a, source.b);
  for (const source of sources) {
    if (source.emf !== 0 && zeroUnion.find(source.a) === zeroUnion.find(source.b)) {
      return emptyResult(components, 'short', '电源被理想导线短路，请断开连接后再实验。', wires);
    }
  }

  const adjacency = Array.from({ length: count }, () => []);
  for (const source of sources) {
    adjacency[source.a].push({ node: source.b, difference: -source.emf });
    adjacency[source.b].push({ node: source.a, difference: source.emf });
  }
  const group = new Array(count).fill(-1);
  const offset = new Array(count).fill(0);
  let groupCount = 0;
  for (let start = 0; start < count; start++) {
    if (group[start] !== -1) continue;
    const queue = [start];
    group[start] = groupCount;
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const { node, difference } of adjacency[from]) {
        const expected = offset[from] + difference;
        if (!Number.isFinite(expected)) return invalid('电源参数过大，请使用合理的实验数值。');
        if (group[node] === -1) {
          group[node] = groupCount;
          offset[node] = expected;
          queue.push(node);
        } else if (Math.abs(offset[node] - expected) > VOLTAGE_EPSILON *
          Math.max(1, Math.abs(offset[node]), Math.abs(expected))) {
          return invalid('理想电源的电压互相冲突，请检查电池方向与连接。');
        }
      }
    }
    groupCount++;
  }

  try {
    const loads = branches.filter(branch=>(RESISTIVE_TYPES.has(branch.type)&&branch.value>0)||(branch.type==='fuse'&&!branch.blown)||branch.type==='led'||(branch.type==='battery'&&branch.internalResistance>0)||(branch.type==='capacitor'&&transient?.dt>0));
    const models=new Map(),guess=new Map(loads.map(load=>[load.id,0]));
    const nonlinear=loads.some(load=>load.type==='led'||(load.type==='motor'&&!transient));
    let voltage=offset.slice();
    for(let iteration=0;iteration<(nonlinear?100:1);iteration++){
      const conductanceEdges=[],injection=new Array(groupCount).fill(0);
      for(const load of loads){
        let resistance=resistanceOf(load),emf=0;
        if(load.type==='battery'){resistance=load.internalResistance;emf=load.value;}
        if(load.type==='motor')emf=load.stalled?0:transient?(transient.motors?.[load.id]??0):motorBackEmf(guess.get(load.id),load.value);
        if(load.type==='capacitor'){resistance=transient.dt/(load.value*1e-6)+.05;emf=transient.capacitors?.[load.id]??load.chargeVoltage??0;}
        if(load.type==='led'){const on=guess.get(load.id)>load.value;resistance=on?10:1e12;emf=on?load.value:0;}
        const weight=1/resistance,bias=-emf*weight,a=group[load.a],b=group[load.b];models.set(load.id,{weight,bias,emf,resistance});conductanceEdges.push({a,b,weight});
        const current=weight*(offset[load.a]-offset[load.b])+bias;injection[a]-=current;injection[b]+=current;
      }
      const {potential:base}=solveGraph(groupCount,conductanceEdges,injection);voltage=offset.map((value,i)=>value+base[group[i]]);
      let error=0;for(const load of loads){const value=voltage[load.a]-voltage[load.b],previous=guess.get(load.id);if(load.type==='led'||load.type==='motor')error=Math.max(error,Math.abs(value-previous));guess.set(load.id,value*.65+previous*.35);}
      if(!nonlinear||error<1e-9)break;
    }
    const passiveOutflow = new Array(count).fill(0),externalOutflow=new Array(count).fill(0);
    const currents = new Map();
    for (const load of loads) {
      const model=models.get(load.id),current=(voltage[load.a]-voltage[load.b]-model.emf)/model.resistance;
      currents.set(load.id, current);
      passiveOutflow[load.a] += current;
      passiveOutflow[load.b] -= current;
      if(load.type!=='battery'){externalOutflow[load.a]+=current;externalOutflow[load.b]-=current;}
    }
    // Compatible ideal-source loops can have non-unique branch currents.
    // The least-norm KCL solution gives deterministic, symmetric sharing.
    const { potential: sourceFlow } = solveGraph(count, sources, passiveOutflow.map((value) => -value));
    for (const source of sources) currents.set(source.id, sourceFlow[source.a] - sourceFlow[source.b]);

    // Reconstruct currents through closed switches using KCL on the original
    // terminal graph, while ideal wire loops again use the least-norm solution.
    const terminalOutflow = new Array(terminals.size).fill(0);
    for (const branch of [...loads, ...sources]) {
      const current = currents.get(branch.id) || 0;
      terminalOutflow[terminals.get(branch.terminalA)] += current;
      terminalOutflow[terminals.get(branch.terminalB)] -= current;
    }
    const { potential: wireFlow } = solveGraph(terminals.size, wireEdges, terminalOutflow.map((value) => -value));
    for (const edge of wireEdges) if (edge.id) currents.set(edge.id, wireFlow[edge.a] - wireFlow[edge.b]);

    const electrical = new UnionFind(count);
    for (const branch of [...loads, ...sources]) electrical.join(branch.a, branch.b);
    // Ground each independent circuit at its first battery's negative terminal.
    const reference = new Map();
    for (const branch of branches) {
      if (branch.type === 'battery' && !reference.has(electrical.find(branch.a))) {
        reference.set(electrical.find(branch.a), voltage[branch.b]);
      }
    }
    for (let i = 0; i < count; i++) voltage[i] -= reference.get(electrical.find(i)) || 0;

    const readings = Object.create(null);
    let outputCurrent = 0;
    let outputPower = 0;
    for (const branch of branches) {
      const sameIsland = electrical.find(branch.a) === electrical.find(branch.b);
      const drop = sameIsland ? voltage[branch.a] - voltage[branch.b] : 0;
      const current = cleanCurrent(currents.get(branch.id) || 0);
      const power = drop * current;
      if (![drop, current, power].every(Number.isFinite)) throw new Error('Non-finite result');
      readings[branch.id] = { voltage: clean(drop), current: clean(current), power: clean(power) };
      if(branch.type==='battery')readings[branch.id].internalPower=current*current*(branch.internalResistance??0);
      if(branch.type==='motor'){readings[branch.id].backEmf=models.get(branch.id)?.emf??0;readings[branch.id].heatPower=current*current*branch.value;readings[branch.id].mechanicalPower=power-readings[branch.id].heatPower;}
      if (branch.type === 'battery' && power < -1e-12) {
        outputCurrent += Math.abs(current);
        outputPower -= power;
      }
    }
    outputCurrent = clean(outputCurrent);
    for(const c of components.filter(c=>c.type==='rheostat')){
      const left=readings[c.id],right=readings[`${c.id}~right`],connected=index=>wires.some(w=>w.a===`${c.id}:${index}`||w.b===`${c.id}:${index}`);
      const useRight=!connected(0)&&connected(2),bothFixed=!connected(1)&&connected(0)&&connected(2);
      readings[c.id]={voltage:clean(bothFixed?left.voltage+right.voltage:useRight?-right.voltage:left.voltage),current:clean(useRight?-right.current:left.current),power:clean(left.power+right.power),leftResistance:c.value*(c.slider??1),rightResistance:c.value*(1-(c.slider??1))};delete readings[`${c.id}~right`];
    }
    const realShort=branches.some(b=>b.type==='battery'&&b.internalResistance>0&&zeroUnion.find(b.a)===zeroUnion.find(b.b)&&Math.abs(b.value)>VOLTAGE_EPSILON);
    const powered = realShort||outputPower > 1e-12||loads.some(load=>['capacitor','motor'].includes(load.type)&&cleanCurrent(currents.get(load.id)??0)*(models.get(load.id)?.emf??0)<-1e-12);
    const wireReadings = Object.create(null);
    for (const edge of wireEdges) {
      if (edge.wireId) {
        const current = cleanCurrent(wireFlow[edge.a] - wireFlow[edge.b]);
        if (!Number.isFinite(current)) throw new Error('Non-finite wire current');
        wireReadings[edge.wireId] = current;
      }
    }
    const batteries = branches.filter((branch) => branch.type === 'battery');
    const packUnion=new UnionFind(count),allSources=[...sources,...loads.filter(b=>b.type==='battery')];for(const source of allSources)packUnion.join(source.a,source.b);
    const packGroup=Array.from({length:count},(_,i)=>packUnion.find(i));
    const packs=batteryPacks(branches,allSources,packGroup,voltage,externalOutflow,readings,zeroUnion);
    const sourceVoltage=packs.length===1?packs[0].voltage:null;
    const sourceMode=!packs.length?'none':packs.length>1?'multiple':sourceVoltage===null?'tapped':'pack';
    const reportedCurrent=cleanCurrent(realShort?batteries.reduce((sum,b)=>sum+(zeroUnion.find(b.a)===zeroUnion.find(b.b)?Math.abs(currents.get(b.id)??0):0),0):packs.reduce((sum,pack)=>sum+pack.current,0));
    const resistance=powered&&sourceVoltage!==null&&reportedCurrent>0?sourceVoltage/reportedCurrent:null;
    const nodes = Object.create(null);
    for (const [terminal, i] of terminals) nodes[terminal] = clean(voltage[terminalNodes[i]]);
    return { status: realShort?'short':powered ? 'ok' : 'open',
      message: realShort?'电源外部短路，电流由内阻限制；请断开短接导线。':powered ? '电路已接通，电压与电流已实时计算。' :
        batteries.length ? '电路未形成有电流的闭合回路，请连接导线并闭合开关。' : '请加入电源并连接闭合回路。',
      components: readings, current: reportedCurrent, sourceVoltage, sourceMode,
      resistance: resistance === null ? null : clean(resistance), powered, nodes, wires: wireReadings };
  } catch {
    return invalid('电路参数无法稳定求解，请检查电阻值与电源连接。');
  }
}
