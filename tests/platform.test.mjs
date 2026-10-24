import assert from 'node:assert/strict';
import { test } from 'node:test';
import { androidFiles, androidSystemBars, saveFile } from '../dist/platform.js';

test('native JSON export reports save, cancellation and file provider errors', async () => {
  const original = globalThis.Capacitor;
  try {
    let result = { saved: true }, received;
    const files = { saveFile: async options => { received = options; if (result instanceof Error) throw result; return result; } };
    globalThis.Capacitor = { getPlatform: () => 'android', Plugins: { CircuitFiles: files } };
    assert.equal(await saveFile('{"name":"电路"}', '实验.json'), true);
    assert.deepEqual(received, { content: '{"name":"电路"}', name: '实验.json' });
    result = { saved: false };
    assert.equal(await saveFile('{}', '取消.json'), false);
    result = new Error('文件保存失败');
    await assert.rejects(saveFile('{}', '失败.json'), /文件保存失败/);
  } finally {
    if (original === undefined) delete globalThis.Capacitor;
    else globalThis.Capacitor = original;
  }
});

test('browser and desktop use web exports while a missing Android bridge is an explicit error', () => {
  assert.equal(androidFiles(null), null);
  assert.equal(androidFiles({ getPlatform: () => 'web' }), null);
  assert.throws(() => androidFiles({ getPlatform: () => 'android' }), /尚未就绪/);
});

test('immersive fullscreen uses the Android bridge for both system bars', async () => {
  const calls=[];
  const native=androidSystemBars({getPlatform:()=> 'android',Plugins:{SystemBars:{hide:async()=>calls.push('hide'),show:async()=>calls.push('show')}}});
  await native.hide();await native.show();assert.deepEqual(calls,['hide','show']);
  assert.equal(androidSystemBars(null),null);
  assert.equal(androidSystemBars({getPlatform:()=> 'web'}),null);
  assert.throws(()=>androidSystemBars({getPlatform:()=> 'android'}),/全屏功能尚未就绪/);
});
