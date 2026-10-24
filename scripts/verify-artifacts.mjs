import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedAssets, releaseInfo } from './release-info.mjs';

export async function verifyAssets(directory, version) {
  const names = expectedAssets(version);
  const actual = (await readdir(directory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(names)) throw new Error(`发版附件不完整或包含额外文件。需要：${names.join(', ')}；收到：${actual.join(', ')}`);
  for (const name of names) {
    const info = await stat(path.join(directory, name));
    if (!info.isFile() || info.size === 0) throw new Error(`附件为空或不是文件：${name}`);
  }
  return names;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = await releaseInfo();
  const directory = fileURLToPath(new URL('../release/collected', import.meta.url));
  const names = await verifyAssets(directory, version);
  console.log(`已核对 ${version} 的全部 ${names.length} 个非空安装包，文件名与发布清单一致。`);
}
