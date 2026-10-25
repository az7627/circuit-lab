import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateVersion(pkg, lock, ref = '') {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)(?:\.\d+)*)?$/.exec(pkg.version);
  if (!match || Number(match[2]) > 99 || Number(match[3]) > 99) throw new Error('发版版本须为 X.Y.Z 或 X.Y.Z-alpha.N、-beta.N、-rc.N，次版本和修订版本必须小于 100。');
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) throw new Error('package.json 与 package-lock.json 版本不一致。');
  const tag = `v${pkg.version}`;
  if (ref.startsWith('refs/tags/') && ref !== `refs/tags/${tag}`) throw new Error(`标签 ${ref} 与项目版本 ${tag} 不一致。`);
  const prerelease = Boolean(match[4]) || /-alpha|-beta|-rc/.test(tag);
  return { version: pkg.version, tag, prerelease };
}

export function expectedAssets(version) {
  const parts = version.split('-')[0].split('.').map(Number);
  const systemOnly = parts[0] > 2 || (parts[0] === 2 && parts[1] >= 10);
  if (systemOnly) {
    return [
      `CircuitLab-${version}-windows-x64-setup.exe`,
      `CircuitLab-${version}-windows-x64-portable.exe`,
      ...['arm64', 'x64'].flatMap(arch => ['dmg', 'zip'].map(ext => `CircuitLab-${version}-macos-${arch}.${ext}`)),
      ...['tar.gz', 'deb'].map(ext => `CircuitLab-${version}-linux-x64.${ext}`),
      ...['apk', 'aab'].map(ext => `CircuitLab-${version}-android-release.${ext}`)
    ].sort();
  }
  const variants = parts[0] > 2 || (parts[0] === 2 && (parts[1] > 9 || (parts[1] === 9 && parts[2] >= 1)));
  return [
    `CircuitLab-${version}-windows-x64-setup.exe`,
    `CircuitLab-${version}-windows-x64-portable.exe`,
    ...['arm64', 'x64'].flatMap(arch => ['dmg', 'zip'].map(ext => `CircuitLab-${version}-macos-${arch}.${ext}`)),
    ...['AppImage', 'deb'].map(ext => `CircuitLab-${version}-linux-x64.${ext}`),
    ...['apk', 'aab'].map(ext => `CircuitLab-${version}-android-release.${ext}`),
    ...(variants ? [
      ...['setup', 'portable'].map(kind => `CircuitLab-${version}-windows-x64-system-webview-${kind}.exe`),
      ...['arm64', 'x64'].flatMap(arch => ['dmg', 'zip'].map(ext => `CircuitLab-${version}-macos-${arch}-system-webview.${ext}`)),
      ...['tar.gz', 'deb'].map(ext => `CircuitLab-${version}-linux-x64-system-webview.${ext}`),
      ...['apk', 'aab'].map(ext => `CircuitLab-${version}-android-embedded-release.${ext}`)
    ] : [])
  ].sort();
}

export async function releaseInfo(ref = process.env.GITHUB_REF || '') {
  const [pkg, lock] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../package-lock.json', import.meta.url), 'utf8')
  ]);
  return validateVersion(JSON.parse(pkg), JSON.parse(lock), ref);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const info = await releaseInfo();
  console.log(`已校验版本 ${info.version}，对应标签 ${info.tag}${info.prerelease ? '（预发布版）' : ''}。`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${info.version}\ntag=${info.tag}\nprerelease=${info.prerelease}\n`);
}
