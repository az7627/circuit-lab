import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateVersion, expectedAssets } from '../scripts/release-info.mjs';
import { verifyAssets } from '../scripts/verify-artifacts.mjs';

test('release tags and both lockfile versions must identify the same Android-compatible version', () => {
  const pkg = { version: '2.8.2' }, lock = { version: '2.8.2', packages: { '': { version: '2.8.2' } } };
  assert.deepEqual(validateVersion(pkg, lock, 'refs/tags/v2.8.2'), { version: '2.8.2', tag: 'v2.8.2', prerelease: false });
  assert.throws(() => validateVersion(pkg, lock, 'refs/tags/v2.8.1'), /标签/);
  assert.throws(() => validateVersion(pkg, { ...lock, version: '2.8.1' }), /版本不一致/);
  assert.deepEqual(validateVersion({ version: '2.10.0-beta.1' }, { version: '2.10.0-beta.1', packages: { '': { version: '2.10.0-beta.1' } } }), { version: '2.10.0-beta.1', tag: 'v2.10.0-beta.1', prerelease: true });
  for (const version of ['2.8.2-preview.1', '2.100.0', '2.8.100', '02.8.2']) assert.throws(() => validateVersion({ version }, lock), /版本/);
});

test('a release requires both mac architectures, both desktop formats and signed Android APK/AAB with distinct names', () => {
  const files = expectedAssets('2.8.2');
  assert.equal(files.length, 10);
  assert.equal(new Set(files).size, 10);
  for (const file of ['CircuitLab-2.8.2-macos-arm64.dmg', 'CircuitLab-2.8.2-macos-x64.zip', 'CircuitLab-2.8.2-linux-x64.deb', 'CircuitLab-2.8.2-android-release.apk', 'CircuitLab-2.8.2-android-release.aab']) assert.ok(files.includes(file));
});

test('v2.9.1 historical release retains both engine editions',()=>{
  const names=expectedAssets('2.9.1');assert.equal(names.length,20);assert.equal(new Set(names).size,20);
  for(const file of ['CircuitLab-2.9.1-windows-x64-system-webview-setup.exe','CircuitLab-2.9.1-macos-arm64-system-webview.zip','CircuitLab-2.9.1-linux-x64-system-webview.tar.gz','CircuitLab-2.9.1-android-embedded-release.apk'])assert.ok(names.includes(file));
  assert.ok(!names.includes('CircuitLab-2.9.1-linux-x64-system-webview.AppImage'),'The system WebView edition must not bundle WebKitGTK in an AppImage');
});

test('v2.10 prereleases contain system WebView builds only and use plain asset names',()=>{
  const names=expectedAssets('2.10.0-beta.1');assert.equal(names.length,10);assert.equal(new Set(names).size,10);
  assert.ok(names.every(name=>!name.includes('-system-webview')&&!name.includes('-embedded')));
  assert.ok(names.includes('CircuitLab-2.10.0-beta.1-linux-x64.tar.gz'));
});

test('downloaded release assets reject platform-renamed, missing, empty and unexpected packages', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'circuit-lab-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const names = expectedAssets('2.8.2');
  await Promise.all(names.map(name => writeFile(path.join(directory, name), 'package')));
  assert.deepEqual(await verifyAssets(directory, '2.8.2'), names);
  const deb = path.join(directory, 'CircuitLab-2.8.2-linux-x64.deb');
  const renamed = path.join(directory, 'CircuitLab-2.8.2-linux-amd64.deb');
  await rename(deb, renamed);
  await assert.rejects(verifyAssets(directory, '2.8.2'), /附件不完整/);
  await rename(renamed, deb);
  await writeFile(deb, '');
  await assert.rejects(verifyAssets(directory, '2.8.2'), /附件为空/);
  await writeFile(deb, 'package');
  await writeFile(path.join(directory, 'unexpected.zip'), 'package');
  await assert.rejects(verifyAssets(directory, '2.8.2'), /额外文件/);
  await rm(path.join(directory, 'unexpected.zip'));
  await rm(deb);
  await assert.rejects(verifyAssets(directory, '2.8.2'), /附件不完整/);
});
