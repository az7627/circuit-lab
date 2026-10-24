import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const android = path.join(root, 'android');
const command = process.argv[2] || 'debug';
const wrapperHash = '7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172';

async function run(executable, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`命令执行失败，退出码 ${code}`)));
  });
}

async function ensureWrapper() {
  const target = path.join(android, 'gradle/wrapper/gradle-wrapper.jar');
  let jar = existsSync(target) ? await readFile(target) : null;
  if (jar && createHash('sha256').update(jar).digest('hex') === wrapperHash) return;
  console.log('下载 Gradle 8.14.3 wrapper（校验 SHA-256；不加入 Git）…');
  const response = await fetch('https://raw.githubusercontent.com/gradle/gradle/v8.14.3/gradle/wrapper/gradle-wrapper.jar', {
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`Gradle wrapper 下载失败：HTTP ${response.status}`);
  jar = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(jar).digest('hex') !== wrapperHash) throw new Error('Gradle wrapper SHA-256 校验失败。');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, jar);
}

async function javaHome() {
  const candidates = [process.env.CIRCUIT_LAB_JAVA_HOME, process.env.JAVA_HOME];
  const jdks = path.join(os.homedir(), '.jdks');
  if (existsSync(jdks)) for (const name of await readdir(jdks)) candidates.push(path.join(jdks, name));
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:/Program Files';
    for (const vendor of ['Eclipse Adoptium', 'Java', 'Microsoft']) {
      const directory = path.join(programFiles, vendor);
      if (existsSync(directory)) for (const name of await readdir(directory)) candidates.push(path.join(directory, name));
    }
    candidates.push(path.join(programFiles, 'Android/Android Studio/jbr'));
  } else if (process.platform === 'darwin') {
    const directory = '/Library/Java/JavaVirtualMachines';
    if (existsSync(directory)) for (const name of await readdir(directory)) candidates.push(path.join(directory, name, 'Contents/Home'));
    candidates.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  } else {
    if (existsSync('/usr/lib/jvm')) for (const name of await readdir('/usr/lib/jvm')) candidates.push(path.join('/usr/lib/jvm', name));
    candidates.push('/opt/android-studio/jbr');
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const release = await readFile(path.join(candidate, 'release'), 'utf8');
      const major = Number(release.match(/JAVA_VERSION="(\d+)/)?.[1]);
      if (major >= 21 && major <= 24 && existsSync(path.join(candidate, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) return candidate;
    } catch { /* Try the next installed JDK. */ }
  }
  throw new Error('需要 JDK 21（Gradle 8.14.3 支持 JDK 21–24）。请安装并设置 JAVA_HOME 或 CIRCUIT_LAB_JAVA_HOME。');
}

function sdkHome() {
  const candidates = [
    process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android/Sdk'),
    path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')
  ];
  return candidates.find(candidate => candidate && existsSync(path.join(candidate, 'platforms')));
}

async function main() {
  if (!['sync', 'open', 'debug', 'release', 'bundle', 'test', 'ci'].includes(command)) throw new Error(`未知 Android 命令：${command}`);
  if (['release', 'bundle', 'ci'].includes(command)) {
    const required = ['ANDROID_KEYSTORE_FILE', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length) throw new Error(`正式包需要签名。请设置 ${missing.join('、')}；本地试用请运行 npm run android:build。`);
    if (!path.isAbsolute(process.env.ANDROID_KEYSTORE_FILE) || !existsSync(process.env.ANDROID_KEYSTORE_FILE)) {
      throw new Error('ANDROID_KEYSTORE_FILE 必须是已有密钥库的绝对路径。');
    }
  }
  const cli = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
  if (!existsSync(cli)) throw new Error('请先在 circuit-lab 目录运行 npm ci。');
  await run(process.execPath, [cli, 'sync', 'android']);
  await ensureWrapper();
  if (command === 'sync') return;
  if (command === 'open') {
    await run(process.execPath, [cli, 'open', 'android']);
    return;
  }
  const jdk = await javaHome();
  const sdk = sdkHome();
  if (!sdk && !existsSync(path.join(android, 'local.properties'))) {
    throw new Error('未找到 Android SDK。请用 Android Studio 安装 SDK Platform 36、Build Tools 36.0.0，并设置 ANDROID_HOME。');
  }
  const env = { ...process.env, JAVA_HOME: jdk, ...(sdk ? { ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk } : {}) };
  const tasks = command === 'ci' ? [':app:lintRelease', ':app:assembleRelease', ':app:bundleRelease'] : [{ debug: ':app:assembleDebug', release: ':app:assembleRelease', bundle: ':app:bundleRelease', test: ':app:connectedDebugAndroidTest' }[command]];
  console.log(`使用 JDK：${jdk}`);
  await run(path.join(jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), [
    '-classpath', path.join(android, 'gradle/wrapper/gradle-wrapper.jar'),
    'org.gradle.wrapper.GradleWrapperMain', ...tasks, '--console=plain', '--no-daemon'
  ], { cwd: android, env });
  if (command === 'test') return;
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const kind of command === 'ci' ? ['release', 'bundle'] : [command]) {
    const source = kind === 'bundle' ? 'bundle/release/app-release.aab' : `apk/${kind}/app-${kind}.apk`;
    const output = path.join(root, 'release/android', `CircuitLab-${version}-android-${kind === 'bundle' ? 'release.aab' : `${kind}.apk`}`);
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(path.join(android, 'app/build/outputs', source), output);
    console.log(`已生成：${output}`);
    if (command === 'ci') {
      if (kind === 'release') {
        if (!sdk) throw new Error('签名校验需要设置 ANDROID_HOME。');
        await run(path.join(jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'), [
          '-jar', path.join(sdk, 'build-tools/36.0.0/lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', output
        ]);
      } else {
        await run(path.join(jdk, 'bin', process.platform === 'win32' ? 'jarsigner.exe' : 'jarsigner'), ['-verify', output]);
      }
    }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
