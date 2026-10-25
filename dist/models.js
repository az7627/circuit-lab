export const definitions = {
  battery: { name: '电源', english: 'DC power', prefix: 'E', note:'电动势与内阻可调 · 支持串联或并联', value: 6, unit: 'V', min: 1.5, max: 12, step: .5 },
  lamp: { name: '小灯泡', english: 'Light bulb', prefix: 'L', value: 10, unit: 'Ω', min: 1, max: 50, step: 1 },
  resistor: { name: '电阻', english: 'Resistor', prefix: 'R', value: 10, unit: 'Ω', min: 1, max: 100, step: 1 },
  switch: { name: '开关', english: 'Switch', prefix: 'S', value: 0 },
  spdt: { name:'双掷开关',english:'SPDT switch',prefix:'SP',idPrefix:'d',value:0,note:'单刀双掷 · 公共端 C 接通 1 或 2 · 双击切换' },
  ammeter: { name: '电流表', english: 'Ammeter', prefix: 'A', value: 0 },
  voltmeter: { name: '电压表', english: 'Voltmeter', prefix: 'V', value: 0 },
  rheostat: { name:'滑动变阻器',english:'Rheostat',prefix:'RV',idPrefix:'t',value:20,unit:'Ω',min:1,max:100,step:1,note:'下方 A、B 两柱，上方 P 滑片 · 一上一下调阻' },
  motor: { name:'电动机',english:'DC motor',prefix:'M',value:12,unit:'Ω',min:2,max:100,step:1,note:'线圈电阻与反电动势模型 · 启动、转动和停转电流不同' },
  bell: { name:'电铃',english:'Electric bell',prefix:'B',idPrefix:'z',value:30,unit:'Ω',min:5,max:100,step:1,note:'供电改变敲击频率、振幅与响度' },
  heater: { name:'电热丝',english:'Heater',prefix:'H',value:20,unit:'Ω',min:1,max:100,step:1,note:'固定电阻模型 · 红热程度随功率变化' },
  capacitor: { name:'电容',english:'Capacitor',prefix:'C',value:1000,unit:'μF',min:10,max:100000,step:10,note:'模拟充电、储能与放电 · 可慢放观察' },
  led: { name:'发光二极管',english:'LED',prefix:'LED',idPrefix:'g',value:2,unit:'V',min:1.2,max:3.6,step:.1,note:'正向导通、反向截止 · 建议串联限流电阻' },
  inductor: { name:'线圈',english:'Inductor',prefix:'Co',idPrefix:'q',value:100,unit:'mH',min:10,max:1000,step:10,note:'稳态直流理想短路 · 不模拟暂态' },
  fuse: { name:'保险丝',english:'Fuse',prefix:'F',value:1,unit:'A',min:.1,max:5,step:.1,note:'冷态电阻 0.2 Ω · 超过额定电流熔断' }
};
export const component = (id, type, x, y, value, angle = 0) => ({ id, type, x, y, value: value ?? definitions[type].value, angle, closed: true, ...(type==='fuse'?{blown:false}:{}), ...(type==='spdt'?{position:1}:{}),...(type==='battery'?{internalResistance:0}:{}),...(type==='rheostat'?{slider:.5}:{}),...(type==='capacitor'?{chargeVoltage:0}:{}),...(type==='motor'?{stalled:false}:{}) });
export function createPreset(name,records=[]) {
  let components = [], wires = [], junctions = [];
  const w = (a, b, via) => wires.push({ id: `w${wires.length + 1}`, a, b, ...(via ? { via } : {}) });
  if (name === 'series') {
    components = [component('e1', 'battery', 145, 260, 6, 270), component('s1', 'switch', 325, 135), component('l1', 'lamp', 605, 135), component('r1', 'resistor', 605, 370, 10, 180), component('a1', 'ammeter', 325, 370), component('v1', 'voltmeter', 605, 255, 0, 180)];
    w('e1:0', 's1:0', [{ x: 145, y: 135 }]); w('s1:1', 'l1:0');
    w('l1:1', 'r1:0', [{ x: 730, y: 135 }, { x: 730, y: 370 }]); w('r1:1', 'a1:0'); w('a1:1', 'e1:1', [{ x: 145, y: 370 }]);
    w('l1:0', 'v1:0', [{ x: 505, y: 135 }, { x: 505, y: 255 }]); w('l1:1', 'v1:1', [{ x: 700, y: 135 }, { x: 700, y: 255 }]);
  } else if (name === 'parallel') {
    components = [component('e1','battery',145,270,6,270),component('s1','switch',200,120),component('a1','ammeter',360,120,0,180),component('l1','lamp',565,300,10),component('l2','lamp',565,400,10),component('v1','voltmeter',565,200,0,180)];
    junctions=[{id:'n1',x:440,y:200},{id:'n2',x:690,y:200},{id:'n3',x:440,y:300},{id:'n4',x:690,y:300},{id:'n5',x:440,y:400},{id:'n6',x:690,y:400}];
    w('e1:0','s1:0',[{x:145,y:120}]);w('s1:1','a1:0');w('a1:1','n1:0',[{x:440,y:120}]);
    w('n1:0','n3:0');w('n3:0','n5:0');w('n2:0','n4:0');w('n4:0','n6:0');
    w('n6:0','e1:1',[{x:690,y:455},{x:145,y:455}]);
    w('n1:0','v1:0');w('v1:1','n2:0');w('n3:0','l1:0');w('l1:1','n4:0');w('n5:0','l2:0');w('l2:1','n6:0');
  } else if (name === 'ohm') {
    components = [component('e1', 'battery', 145, 260, 6, 270), component('s1', 'switch', 325, 135), component('a1', 'ammeter', 605, 135, 0, 180), component('r1', 'resistor', 605, 370, 20, 180), component('v1', 'voltmeter', 605, 255)];
    w('e1:0', 's1:0', [{ x: 145, y: 135 }]); w('s1:1', 'a1:0');
    w('a1:1', 'r1:0', [{ x: 730, y: 135 }, { x: 730, y: 370 }]); w('r1:1', 'e1:1', [{ x: 145, y: 370 }]);
    w('r1:1', 'v1:1', [{ x: 505, y: 370 }, { x: 505, y: 255 }]); w('r1:0', 'v1:0', [{ x: 700, y: 370 }, { x: 700, y: 255 }]);
  }
  return { preset: name, components, wires, junctions, running: true, showCurrent: true, records, nextId: 20,viewModelVersion:2,viewMode:'schematic',routingVersion:1 };
}

