// Rebuild historical web sources with the current Windows shell and installer.
// Never move historical tags or change their simulation/component implementation.
import {execFileSync,spawn} from 'node:child_process';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.platform!=='win32')throw new Error('历史 Windows 包须在 Windows 上构建。');
const root=fileURLToPath(new URL('../',import.meta.url));
const versions=process.argv.slice(2);
if(!versions.length||versions.some(v=>!['2.9.1','2.10.0-beta.1'].includes(v)))throw new Error('用法：node scripts/repack-windows.mjs 2.9.1 2.10.0-beta.1');
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`构建失败：${code}`)));});
await run(['scripts/desktop-icons.mjs']);
for(const version of versions){
  const stage=path.join(root,'build/windows-repacks',version),output=path.join(root,'release/windows-repacks',version);
  await mkdir(stage,{recursive:true});await mkdir(output,{recursive:true});
  const archive=path.join(stage,'web.tar');
  execFileSync('git',['archive','--format=tar',`--output=${archive}`,`v${version}`,'dist'],{cwd:root,windowsHide:true});
  execFileSync('tar',['-xf',archive,'-C',stage],{windowsHide:true});
  const html=path.join(stage,'dist/index.html');
  await writeFile(html,(await readFile(html,'utf8')).replace(/<title>[^<]*<\/title>/,'<title>电路实验室</title>'));
  const config=path.join(stage,'tauri.override.json');
  await writeFile(config,JSON.stringify({version,build:{frontendDist:path.join(stage,'dist')}}));
  await run(['node_modules/@tauri-apps/cli/tauri.js','build','--bundles','nsis','--config',config]);
  const suffix=version==='2.9.1'?'-system-webview':'';
  await copyFile(path.join(root,`src-tauri/target/release/bundle/nsis/电路实验室_${version}_x64-setup.exe`),path.join(output,`CircuitLab-${version}-windows-x64${suffix}-setup.exe`));
  await copyFile(path.join(root,'src-tauri/target/release/circuit-lab-systemwebview.exe'),path.join(output,`CircuitLab-${version}-windows-x64${suffix}-portable.exe`));
  console.log(`已重打包 v${version}：${output}`);
}
