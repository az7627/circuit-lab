import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateVersion, expectedAssets } from '../scripts/release-info.mjs';

test('release tags and both lockfile versions must identify the same stable Android-compatible version', () => {
  const pkg = { version: '2.8.2' }, lock = { version: '2.8.2', packages: { '': { version: '2.8.2' } } };
  assert.deepEqual(validateVersion(pkg, lock, 'refs/tags/v2.8.2'), { version: '2.8.2', tag: 'v2.8.2' });
  assert.throws(() => validateVersion(pkg, lock, 'refs/tags/v2.8.1'), /标签/);
  assert.throws(() => validateVersion(pkg, { ...lock, version: '2.8.1' }), /版本不一致/);
  for (const version of ['2.8.2-beta.1', '2.100.0', '2.8.100', '02.8.2']) assert.throws(() => validateVersion({ version }, lock), /稳定版本/);
});

test('a release requires both mac architectures, both desktop formats and signed Android APK/AAB with distinct names', () => {
  const files = expectedAssets('2.8.2');
  assert.equal(files.length, 10);
  assert.equal(new Set(files).size, 10);
  for (const file of ['CircuitLab-2.8.2-macos-arm64.dmg', 'CircuitLab-2.8.2-macos-x64.zip', 'CircuitLab-2.8.2-linux-x64.deb', 'CircuitLab-2.8.2-android-release.apk', 'CircuitLab-2.8.2-android-release.aab']) assert.ok(files.includes(file));
});
