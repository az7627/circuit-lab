import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateVersion(pkg, lock, ref = '') {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(pkg.version);
  if (!match || Number(match[2]) > 99 || Number(match[3]) > 99) throw new Error('发版需要稳定版本 X.Y.Z，次版本和修订版本必须小于 100。');
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) throw new Error('package.json 与 package-lock.json 版本不一致。');
  const tag = `v${pkg.version}`;
  if (ref.startsWith('refs/tags/') && ref !== `refs/tags/${tag}`) throw new Error(`标签 ${ref} 与项目版本 ${tag} 不一致。`);
  return { version: pkg.version, tag };
}

export function expectedAssets(version) {
  return [
    `CircuitLab-${version}-windows-x64-setup.exe`,
    `CircuitLab-${version}-windows-x64-portable.exe`,
    ...['arm64', 'x64'].flatMap(arch => ['dmg', 'zip'].map(ext => `CircuitLab-${version}-macos-${arch}.${ext}`)),
    ...['AppImage', 'deb'].map(ext => `CircuitLab-${version}-linux-x64.${ext}`),
    ...['apk', 'aab'].map(ext => `CircuitLab-${version}-android-release.${ext}`)
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
  console.log(`已校验版本 ${info.version}，对应标签 ${info.tag}。`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${info.version}\ntag=${info.tag}\n`);
}
