import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { releaseInfo } from './release-info.mjs';
import { verifyAssets } from './verify-artifacts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function gh(args) {
  return execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).trim();
}

export function findRelease(repository, tag) {
  try {
    const { apiUrl } = JSON.parse(gh(['release', 'view', tag, '--repo', repository, '--json', 'apiUrl']));
    return JSON.parse(gh(['api', apiUrl]));
  } catch (error) {
    if (/release not found|HTTP 404/i.test(error.stderr || '')) return undefined;
    throw error;
  }
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'push' || !process.env.GITHUB_REF?.startsWith('refs/tags/')) throw new Error('仅允许版本标签触发的 GitHub Actions 发布正式 Release。');
  const { version, tag, prerelease } = await releaseInfo();
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  if (sha !== process.env.GITHUB_SHA) throw new Error('当前提交与版本标签不一致。');
  const directory = path.join(root, 'release/collected');
  const names = await verifyAssets(directory, version);
  const checksums = [];
  for (const name of names) {
    const file = path.join(directory, name);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    checksums.push(`${hash.digest('hex')}  ${name}`);
  }
  await writeFile(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  let existing = findRelease(repository, tag);
  if (existing && existing.target_commitish !== sha) throw new Error('已有 Release 指向其他提交，拒绝覆盖。');
  if (existing && !existing.draft) {
    console.log(`${tag} 已公开，不修改其附件。`);
    return;
  }
  if (!existing) {
    const createArgs = [
      'api', `repos/${repository}/releases`, '--method', 'POST',
      '-f', `tag_name=${tag}`, '-f', `target_commitish=${sha}`, '-f', `name=Circuit Lab ${tag}`,
      '-F', 'draft=true', '-F', `prerelease=${prerelease}`
    ];
    try {
      existing = JSON.parse(gh([...createArgs, '-F', 'generate_release_notes=true']));
    } catch {
      existing = JSON.parse(gh(createArgs));
    }
  }
  if (!existing?.draft) throw new Error('无法读取 Release 草稿，拒绝上传附件。');
  names.push('SHA256SUMS.txt');
  gh(['release', 'upload', tag, ...names.map(name => path.join(directory, name)), '--repo', repository, '--clobber']);
  const uploaded = JSON.parse(gh(['api', `repos/${repository}/releases/${existing.id}`]));
  if (JSON.stringify(uploaded.assets.map(asset => asset.name).sort()) !== JSON.stringify([...names].sort())) throw new Error('远端 Release 附件列表不匹配，保留草稿。');
  for (const name of names) if (uploaded.assets.find(asset => asset.name === name).size !== (await stat(path.join(directory, name))).size) throw new Error(`远端附件大小不匹配：${name}`);
  const notices = '\n\nWindows 构建未做商业代码签名；macOS 为 ad-hoc 签名，未经过 Apple 公证。桌面版和 Android 版均使用系统 WebView；Windows 需已安装 WebView2，Linux 需 WebKitGTK 4.1。Android 沿用 v2.9.0 固定发布证书；旧调试版请先导出实验备份再卸载安装。\n\n附件包含 Windows x64、macOS ARM64/Intel、Linux x64 和 Android APK/AAB；SHA256SUMS.txt 用于校验下载文件。\n';
  await mkdir(path.join(root, 'build'), { recursive: true });
  const notes = path.join(root, 'build/release-notes.md');
  let body;
  try { body = await readFile(path.join(root, `docs/releases/${tag}.md`), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; body = (existing.body || '') + notices; }
  await writeFile(notes, body);
  gh(['release', 'edit', tag, '--repo', repository, '--notes-file', notes]);
  gh(['api', `repos/${repository}/releases/${existing.id}`, '--method', 'PATCH', '-F', 'draft=false', '-F', `prerelease=${prerelease}`, '-F', `make_latest=${prerelease ? 'false' : 'true'}`]);
  console.log(`已公开${prerelease ? '预发布' : ''} https://github.com/${repository}/releases/tag/${tag}，共 ${names.length} 个附件。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
