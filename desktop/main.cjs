const { app, BrowserWindow, dialog, Menu, protocol, session, shell } = require('electron');
const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { APP_URL, isAppUrl, resolveAssetPath } = require('./paths.cjs');

// Test launches use their own profile, including across complete app restarts.
if (process.env.CIRCUIT_LAB_TEST_DATA_DIR) {
  if (!path.isAbsolute(process.env.CIRCUIT_LAB_TEST_DATA_DIR)) throw new Error('测试数据目录必须为绝对路径');
  app.setPath('userData', process.env.CIRCUIT_LAB_TEST_DATA_DIR);
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'circuit',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'";
let mainWindow;

function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      shell.openExternal(url.href).catch(error => console.error('无法打开链接:', error.message));
    }
  } catch { /* Ignore malformed links. */ }
}

function createWindow() {
  const icon = [path.join(__dirname, 'icon.png'), path.join(__dirname, '../build/icon.png')].find(file => existsSync(file));
  mainWindow = new BrowserWindow({
    title: '电路实验室',
    width: 1440,
    height: 940,
    minWidth: 360,
    minHeight: 600,
    backgroundColor: '#ffffff',
    icon,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  mainWindow.once('ready-to-show', () => {
    if (!process.env.CIRCUIT_LAB_TEST_DATA_DIR) mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.loadURL(APP_URL).catch(error => {
    dialog.showErrorBox('电路实验室启动失败', error.message);
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    const root = path.join(app.getAppPath(), 'dist');
    protocol.handle('circuit', async request => {
      const file = resolveAssetPath(request.url, root);
      if (!file || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
      try {
        const body = await readFile(file);
        return new Response(request.method === 'HEAD' ? null : body, { headers: {
          'Content-Type': types[path.extname(file)] || 'application/octet-stream',
          'Content-Security-Policy': csp,
          'X-Content-Type-Options': 'nosniff'
        } });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(permission === 'fullscreen' && isAppUrl(contents.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission) => {
      return permission === 'fullscreen' && isAppUrl(contents?.getURL());
    });
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({
        title: '导出电路实验',
        defaultPath: path.join(app.getPath('documents'), path.basename(item.getFilename())),
        filters: [{ name: '实验 JSON 文件', extensions: ['json'] }]
      });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '视图', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
      { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'close' }] }
    ]));
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  }).catch(error => {
    dialog.showErrorBox('电路实验室启动失败', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
