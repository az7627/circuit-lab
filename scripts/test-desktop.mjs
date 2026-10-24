import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const artifacts = path.join(root, 'artifacts/desktop', `${process.platform}-${process.arch}`);
const profile = await mkdtemp(path.join(os.tmpdir(), 'circuit-lab-smoke-'));
const packaged = process.argv.includes('--packaged');
const env = { ...process.env, CIRCUIT_LAB_TEST_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
await mkdir(artifacts, { recursive: true });

async function executable() {
  if (!packaged) return createRequire(import.meta.url)('electron');
  const explicit = process.argv.indexOf('--executable');
  if (explicit !== -1) return path.resolve(process.argv[explicit + 1]);
  const output = path.join(root, 'release/desktop');
  if (process.platform === 'win32') return path.join(output, 'win-unpacked/电路实验室.exe');
  if (process.platform === 'linux') return path.join(output, 'linux-unpacked/circuit-lab');
  for (const directory of [`mac-${process.arch}`, 'mac']) {
    const binaryDirectory = path.join(output, directory, '电路实验室.app/Contents/MacOS');
    if (existsSync(binaryDirectory)) {
      const files = await readdir(binaryDirectory, { withFileTypes: true });
      const binaries = files.filter(file => file.isFile());
      assert.equal(binaries.length, 1, 'macOS 应用的主程序不唯一');
      return path.join(binaryDirectory, binaries[0].name);
    }
  }
  throw new Error('未找到打包后的 macOS 应用');
}

const binary = await executable();
assert.ok(existsSync(binary), `未找到应用程序：${binary}`);
let application, page;
const consoleErrors = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function launch() {
  application = await electron.launch({
    executablePath: binary, args: packaged ? [] : [root], cwd: root, env, timeout: 45000
  });
  page = await application.firstWindow();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.show();
    window.focus();
  });
  await page.waitForFunction(() => document.querySelectorAll('[data-add]').length === 14);
  assert.ok((await page.title()).includes('电路实验室'));
  assert.equal(await page.evaluate(() => typeof process), 'undefined');
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox), true);
  assert.equal(await application.evaluate(({ app }) => app.isPackaged), packaged);
  if (packaged) assert.ok((await application.evaluate(({ app }) => app.getAppPath())).endsWith('app.asar'));
}

async function closeApplication() {
  if (!application) return;
  const current = application;
  application = null;
  const timer = setTimeout(() => current.process().kill('SIGKILL'), 10000);
  try { await current.close(); } finally { clearTimeout(timer); }
}

async function clickHeaderAction(id) {
  if (await page.locator('#' + id).evaluate(element => !!element.closest('#headerActionsMenu')?.hidden)) await page.locator('#headerMoreButton').click();
  await page.locator('#' + id).click();
}

async function toggleFullscreen(active) {
  if (process.platform === 'darwin') {
    await application.evaluate(({ BrowserWindow }, entering) => {
      globalThis.__circuitFullscreenTransition = false;
      BrowserWindow.getAllWindows()[0].once(entering ? 'enter-full-screen' : 'leave-full-screen', () => {
        globalThis.__circuitFullscreenTransition = true;
      });
    }, active);
  }
  await clickHeaderAction('fullscreenButton');
  if (process.platform === 'darwin') {
    const deadline = Date.now() + 20000;
    while (!await application.evaluate(() => globalThis.__circuitFullscreenTransition)) {
      if (Date.now() > deadline) throw new Error('macOS 原生全屏转换超时');
      await wait(100);
    }
  }
  await page.waitForFunction(entering => !!document.fullscreenElement === entering, active);
}

try {
  console.log(`检查${packaged ? '打包后的' : '开发版'}应用：${binary}`);
  await launch();
  assert.equal(await page.locator('#workspace').isVisible(), false);
  await page.locator('#emptyCreateButton').click();
  await page.locator('#experimentNameInput').fill('持续集成保存验证');
  await page.locator('#nameForm').evaluate(form => form.requestSubmit());
  await clickHeaderAction('helpButton');
  await page.locator('[data-guide="series"]').click();
  await page.locator('#startGuideExperiment').click();
  await page.waitForFunction(() => document.getElementById('activeExperimentName').textContent === '持续集成保存验证');
  await page.locator('[data-component="a1"]').focus();await page.keyboard.press('Enter');
  assert.ok(await page.evaluate(() => parseFloat(document.getElementById('selectedCurrent').textContent) > 0));
  await toggleFullscreen(true);
  await toggleFullscreen(false);
  await closeApplication();
  await launch();
  await page.waitForFunction(() => document.getElementById('activeExperimentName').textContent === '持续集成保存验证');
  assert.equal(await page.locator('#inspector').isVisible(), false);
  await page.locator('[data-component="a1"]').focus();await page.keyboard.press('Enter');
  assert.ok(await page.evaluate(() => parseFloat(document.getElementById('selectedCurrent').textContent) > 0));

  const exported = path.join(artifacts, 'exported-experiment.json');
  await application.evaluate(({ session }, target) => {
    globalThis.__circuitLabDownload = null;
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(target);
      item.once('done', (_doneEvent, state) => { globalThis.__circuitLabDownload = state; });
    });
  }, exported);
  await clickHeaderAction('experimentExportButton');
  const deadline = Date.now() + 20000;
  let download;
  do {
    download = await application.evaluate(() => globalThis.__circuitLabDownload);
    if (download) break;
    await wait(100);
  } while (Date.now() < deadline);
  assert.equal(download, 'completed');
  assert.equal(JSON.parse(await readFile(exported, 'utf8')).name, '持续集成保存验证');
  await page.locator('#experimentFile').setInputFiles(exported);
  await page.waitForFunction(() => document.getElementById('activeExperimentName').textContent === '持续集成保存验证（导入）');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(390, 844));
  await page.waitForFunction(() => innerWidth < 450);
  await page.waitForFunction(() => { const board = document.getElementById('board').getBoundingClientRect(); return board.width > 100 && board.height > 150; });
  await page.waitForTimeout(320);
  const layout = await page.evaluate(() => {
    const board = document.getElementById('board').getBoundingClientRect();
    return { width: board.width, height: board.height, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(layout.width > 100 && layout.height > 150, JSON.stringify(layout));
  assert.equal(layout.overflow, false);
  assert.deepEqual(consoleErrors, []);
  await page.screenshot({ path: path.join(artifacts, 'passed.png') });
  console.log('启动、离线模块、沙盒、全屏、重启恢复、JSON 导出导入和窄屏布局检查通过。');
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifacts, 'failed.png'), timeout: 5000 }).catch(() => {});
  await writeFile(path.join(artifacts, 'error.txt'), `${error.stack}\n${consoleErrors.join('\n')}`);
  throw error;
} finally {
  await closeApplication().catch(() => {});
  const relative = path.relative(os.tmpdir(), profile);
  if (/^circuit-lab-smoke-[^\\/]+$/.test(relative)) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
