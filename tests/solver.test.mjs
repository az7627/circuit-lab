import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solveCircuit } from '../dist/solver.js';

const battery = (id = 'b', value = 6) => ({ id, type: 'battery', value });
const resistor = (id, value = 10) => ({ id, type: 'resistor', value });
const wire = (a, b) => ({ id: `${a}-${b}`, a, b });
const close = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should equal ${expected}`);
};
const finite = (result) => {
  assert.ok(Number.isFinite(result.current));
  for (const component of Object.values(result.components)) {
    assert.ok(Object.values(component).every(Number.isFinite));
  }
  assert.ok(Object.values(result.nodes).every(Number.isFinite));
  assert.ok(Object.values(result.wires).every(Number.isFinite));
};
const powerBalanced = (result) => close(Object.values(result.components).reduce((sum, item) => sum + item.power, 0), 0);

test('6 V across two 10 Ω series loads produces 0.3 A and conserves power', () => {
  const result = solveCircuit([battery(), resistor('r1'), resistor('r2')], [
    wire('b:0', 'r1:0'), wire('r1:1', 'r2:0'), wire('r2:1', 'b:1'),
  ]);
  assert.equal(result.status, 'ok');
  assert.equal(result.powered, true);
  close(result.current, 0.3);
  close(result.resistance, 20);
  close(result.components.r1.current, 0.3);
  close(result.components.r2.voltage, 3);
  close(result.components.b.current, -0.3);
  close(result.nodes['b:0'], 6);
  close(result.nodes['b:1'], 0);
  close(result.wires['b:0-r1:0'], 0.3);
  close(result.wires['r1:1-r2:0'], 0.3);
  close(result.wires['r2:1-b:1'], 0.3);
  powerBalanced(result);
});

test('two 10 Ω parallel branches each carry 0.6 A, with 1.2 A total', () => {
  const result = solveCircuit([battery(), resistor('r1'), resistor('r2')], [
    wire('b:0', 'r1:0'), wire('r1:0', 'r2:0'), wire('b:1', 'r1:1'), wire('r1:1', 'r2:1'),
  ]);
  close(result.current, 1.2);
  close(result.resistance, 5);
  close(result.components.r1.current, 0.6);
  close(result.components.r2.current, 0.6);
  close(result.wires['b:0-r1:0'], 1.2);
  close(result.wires['r1:0-r2:0'], 0.6);
  close(result.wires['b:1-r1:1'], -1.2);
  close(result.wires['r1:1-r2:1'], -0.6);
  powerBalanced(result);
});

test('an open switch interrupts current and carries the battery voltage', () => {
  const components = [battery(), resistor('r'), { id: 's', type: 'switch', closed: false }];
  const wires = [wire('b:0', 'r:0'), wire('r:1', 's:0'), wire('s:1', 'b:1')];
  const result = solveCircuit(components, wires);
  assert.equal(result.status, 'open');
  close(result.current, 0);
  close(result.components.r.current, 0);
  close(result.components.s.voltage, 6);
  assert.equal(result.resistance, null);
  assert.ok(Object.values(result.wires).every((value) => value === 0));
  const closed = solveCircuit(components.map((component) => ({ ...component, closed: true })), wires);
  assert.equal(closed.status, 'ok');
  close(closed.components.s.current, 0.6);
});

test('a battery short is detected without inventing a large current', () => {
  const result = solveCircuit([battery()], [wire('b:0', 'b:1')]);
  assert.equal(result.status, 'short');
  assert.equal(result.powered, false);
  assert.equal(result.current, 0);
  assert.equal(result.resistance, 0);
  assert.equal(result.wires['b:0-b:1'], 0);
  finite(result);
  assert.equal(solveCircuit([battery('tiny', 1e-10)], [wire('tiny:0', 'tiny:1')]).status, 'short');
});

test('an ideal ammeter in series reads signed current without changing the circuit', () => {
  const result = solveCircuit([battery(), resistor('r'), { id: 'a', type: 'ammeter' }], [
    wire('b:0', 'a:0'), wire('a:1', 'r:0'), wire('r:1', 'b:1'),
  ]);
  assert.equal(result.status, 'ok');
  close(result.current, 0.6);
  close(result.components.a.current, 0.6);
  close(result.components.a.voltage, 0);
  close(result.wires['b:0-a:0'], 0.6);
  close(result.wires['a:1-r:0'], 0.6);
  close(result.wires['r:1-b:1'], 0.6);
  powerBalanced(result);
});

test('a lamp reports its electrical heating power from its resistance', () => {
  const result = solveCircuit([battery(), { id: 'lamp', type: 'lamp', value: 12 }], [
    wire('b:0', 'lamp:0'), wire('lamp:1', 'b:1'),
  ]);
  assert.equal(result.status, 'ok');
  close(result.components.lamp.voltage, 6);
  close(result.components.lamp.current, 0.5);
  close(result.components.lamp.power, 3);
  powerBalanced(result);
});

test('an ammeter across a battery is a short', () => {
  const result = solveCircuit([battery(), { id: 'a', type: 'ammeter' }], [
    wire('b:0', 'a:0'), wire('a:1', 'b:1'),
  ]);
  assert.equal(result.status, 'short');
  finite(result);
});

test('a voltmeter in parallel reads voltage and draws no current', () => {
  const result = solveCircuit([battery(), resistor('r'), { id: 'v', type: 'voltmeter' }], [
    wire('b:0', 'r:0'), wire('r:1', 'b:1'), wire('v:0', 'r:0'), wire('v:1', 'r:1'),
  ]);
  close(result.current, 0.6);
  close(result.components.v.voltage, 6);
  close(result.components.v.current, 0);
  close(result.wires['v:0-r:0'], 0);
  close(result.wires['v:1-r:1'], 0);
});

test('floating loads and a one-lead voltmeter do not create singular matrices or phantom readings', () => {
  const result = solveCircuit([battery(), resistor('r'), resistor('floating'), { id: 'v', type: 'voltmeter' }], [
    wire('b:0', 'r:0'), wire('r:1', 'b:1'), wire('v:0', 'b:0'),
  ]);
  assert.equal(result.status, 'ok');
  close(result.current, 0.6);
  close(result.components.floating.current, 0);
  close(result.components.floating.voltage, 0);
  close(result.components.v.voltage, 0);
  finite(result);
});

test('an isolated battery has a voltage but no current; empty circuits remain finite', () => {
  const isolated = solveCircuit([battery(), { id: 'v', type: 'voltmeter' }], []);
  assert.equal(isolated.status, 'open');
  close(isolated.components.b.voltage, 6);
  close(isolated.current, 0);
  finite(isolated);
  const empty = solveCircuit([], []);
  assert.equal(empty.status, 'open');
  finite(empty);
});

test('compatible parallel ideal batteries share current symmetrically', () => {
  const result = solveCircuit([battery('b1'), battery('b2'), resistor('r')], [
    wire('b1:0', 'b2:0'), wire('b1:1', 'b2:1'), wire('b1:0', 'r:0'), wire('r:1', 'b1:1'),
  ]);
  assert.equal(result.status, 'ok');
  close(result.components.b1.current, -0.3);
  close(result.components.b2.current, -0.3);
  close(result.current, 0.6);
  close(result.resistance, 10);
  powerBalanced(result);
});

test('an ammeter in one parallel branch retains the total supply voltage and equivalent resistance',()=>{
  const result=solveCircuit([battery(),resistor('r1'),resistor('r2'),{id:'a',type:'ammeter'}],[wire('b:0','a:0'),wire('a:1','r1:0'),wire('r1:1','b:1'),wire('b:0','r2:0'),wire('r2:1','b:1')]);
  close(result.components.a.current,.6);close(result.current,1.2);close(result.sourceVoltage,6);close(result.resistance,5);assert.equal(result.sourceMode,'pack');
});

test('series batteries add voltage, including reversed polarity', () => {
  for (const secondVoltage of [3, -3]) {
    const result = solveCircuit([battery('b1'), battery('b2', secondVoltage), resistor('r')], [
      wire('b1:1', 'b2:0'), wire('b2:1', 'r:1'), wire('r:0', 'b1:0'),
    ]);
    assert.equal(result.status, 'ok');
    close(result.components.r.voltage, 6 + secondVoltage);
    close(result.components.r.current, (6 + secondVoltage) / 10);
    close(result.sourceVoltage,6+secondVoltage);
    close(result.current,(6+secondVoltage)/10);
    close(result.resistance,10);
    powerBalanced(result);
  }
});

test('conflicting parallel ideal batteries return an explicit invalid result', () => {
  const result = solveCircuit([battery('b1'), battery('b2', 9), resistor('r')], [
    wire('b1:0', 'b2:0'), wire('b1:1', 'b2:1'), wire('b1:0', 'r:0'), wire('r:1', 'b1:1'),
  ]);
  assert.equal(result.status, 'invalid');
  assert.match(result.message, /电压互相冲突/);
  assert.equal(result.current, 0);
  assert.ok(Object.values(result.wires).every((value) => value === 0));
  finite(result);
});

test('an unbalanced bridge solves arbitrary topology rather than just series/parallel templates', () => {
  const components = [battery('b', 10), resistor('r1', 10), resistor('r2', 10),
    resistor('r3', 10), resistor('r4', 20), resistor('bridge', 10)];
  const result = solveCircuit(components, [
    wire('b:0', 'r1:0'), wire('b:0', 'r3:0'), wire('r1:1', 'r2:0'),
    wire('r3:1', 'r4:0'), wire('r2:1', 'b:1'), wire('r4:1', 'b:1'),
    wire('bridge:0', 'r1:1'), wire('bridge:1', 'r3:1'),
  ]);
  assert.equal(result.status, 'ok');
  close(result.nodes['bridge:0'], 70 / 13);
  close(result.nodes['bridge:1'], 80 / 13);
  close(result.components.bridge.current, -1 / 13);
  close(result.current, 11 / 13);
  powerBalanced(result);
});

test('independent powered islands each receive a reference voltage and contribute output current', () => {
  const result = solveCircuit([battery('b1'), battery('b2', 9), resistor('r1'), resistor('r2', 30)], [
    wire('b1:0', 'r1:0'), wire('b1:1', 'r1:1'), wire('b2:0', 'r2:0'), wire('b2:1', 'r2:1'),
  ]);
  assert.equal(result.status, 'ok');
  close(result.current, 0.9);
  assert.equal(result.sourceVoltage,null);
  assert.equal(result.sourceMode,'multiple');
  close(result.nodes['b1:0'], 6);
  close(result.nodes['b2:0'], 9);
  powerBalanced(result);
});

test('wire loops and bypassed loads do not destabilize the solution', () => {
  const result = solveCircuit([battery(), resistor('r1'), resistor('r2')], [
    wire('b:0', 'r1:0'), wire('r1:1', 'r2:0'), wire('r2:1', 'b:1'),
    { id: 'bypass1', a: 'r1:0', b: 'r1:1' }, { id: 'bypass2', a: 'r1:0', b: 'r1:1' },
  ]);
  assert.equal(result.status, 'ok');
  close(result.current, 0.6);
  close(result.components.r1.current, 0);
  close(result.components.r2.current, 0.6);
  close(result.wires.bypass1, 0.3);
  close(result.wires.bypass2, 0.3);
  close(result.wires.bypass1 + result.wires.bypass2, 0.6);
  powerBalanced(result);
});

test('wire readings follow a → b orientation even when a connection is listed backwards', () => {
  const result = solveCircuit([battery(), resistor('r')], [
    wire('r:0', 'b:0'), wire('b:1', 'r:1'),
  ]);
  assert.equal(result.status, 'ok');
  close(result.wires['r:0-b:0'], -0.6);
  close(result.wires['b:1-r:1'], -0.6);
});

test('invalid terminals and non-positive resistance are rejected', () => {
  assert.equal(solveCircuit([battery()], [wire('b:0', 'missing:0')]).status, 'invalid');
  assert.equal(solveCircuit([resistor('r', 0)], []).status, 'invalid');
  assert.equal(solveCircuit([resistor('r', -1)], []).status, 'invalid');
  assert.equal(solveCircuit([battery(), battery()], []).status, 'invalid');
  const invalid = solveCircuit([battery()], [wire('b:0', 'missing:0')]);
  assert.equal(invalid.wires['b:0-missing:0'], 0);
  finite(invalid);
});
