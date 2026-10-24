const path = require('node:path');

const APP_URL = 'circuit://lab/index.html';

function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'circuit:' && url.hostname === 'lab' &&
      !url.port && !url.username && !url.password;
  } catch {
    return false;
  }
}

function resolveAssetPath(value, root) {
  if (!isAppUrl(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    if (pathname.includes('\0')) return null;
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return file;
  } catch {
    return null;
  }
}

module.exports = { APP_URL, isAppUrl, resolveAssetPath };
