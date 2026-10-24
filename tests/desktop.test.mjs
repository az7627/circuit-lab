import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const { APP_URL, isAppUrl, resolveAssetPath } = createRequire(import.meta.url)('../desktop/paths.cjs');
const root = path.resolve('dist');

test('desktop serves local ES modules, query strings and the home page from the packaged web root', () => {
  assert.equal(resolveAssetPath(APP_URL, root), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath('circuit://lab/', root), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath('circuit://lab/workbench.js?v=2.8', root), path.join(root, 'workbench.js'));
  assert.equal(isAppUrl('circuit://lab/index.html'), true);
});

test('desktop rejects other origins, malformed URLs and encoded filesystem escapes', () => {
  for (const url of [
    'https://lab/index.html', 'file:///etc/passwd', 'circuit://other/index.html',
    'circuit://user@lab/index.html', 'circuit://lab:123/index.html', 'not a url',
    'circuit://lab/%2e%2e%2fpackage.json', 'circuit://lab/%00', 'circuit://lab/%zz'
  ]) assert.equal(resolveAssetPath(url, root), null, url);
  if (process.platform === 'win32') {
    assert.equal(resolveAssetPath('circuit://lab/..%5cpackage.json', root), null);
  }
});
