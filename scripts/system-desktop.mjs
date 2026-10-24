import {spawn} from 'node:child_process';
import {copyFile,mkdir,readdir,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {releaseInfo} from './release-info.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),mode=process.argv[2]||'build';
const run=(exe,args)=>new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd:root,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${exe} 退出码 ${code}`)));});
await run(process.execPath,['scripts/desktop-icons.mjs']);
await run(process.execPath,['node_modules/@tauri-apps/cli/tauri.js','icon','dist/favicon.svg','--output','build/tauri-icons']);
// Tauri AppImages bundle WebKitGTK. The light Linux edition must use the
// system engine, so ship a dependency-declaring DEB and a plain binary archive.
const bundles=process.platform==='win32'?'nsis':process.platform==='darwin'?'app,dmg':'deb';
await run(process.execPath,['node_modules/@tauri-apps/cli/tauri.js',mode==='dev'?'dev':'build',...(mode==='dev'?[]:['--bundles',bundles])]);
if(mode==='dev')process.exit(0);
const {version}=await releaseInfo(),output=path.join(root,'release/system-webview');await mkdir(output,{recursive:true});
const source=path.join(root,'src-tauri/target/release/bundle');
async function collect(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory()){if(!entry.name.endsWith('.app'))await collect(file);}else{const ext=entry.name.endsWith('.AppImage')?'AppImage':path.extname(entry.name).slice(1);if(['exe','dmg','deb','AppImage'].includes(ext)){const platform=process.platform==='win32'?'windows':process.platform==='darwin'?'macos':'linux',suffix=ext==='exe'?'-setup':'';await copyFile(file,path.join(output,`CircuitLab-${version}-${platform}-${process.arch}-system-webview${suffix}.${ext}`));}}}}
await collect(source);
if(process.platform==='win32')await copyFile(path.join(root,'src-tauri/target/release/circuit-lab-systemwebview.exe'),path.join(output,`CircuitLab-${version}-windows-x64-system-webview-portable.exe`));
if(process.platform==='darwin')await run('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',path.join(source,'macos/电路实验室轻量版.app'),path.join(output,`CircuitLab-${version}-macos-${process.arch}-system-webview.zip`)]);
if(process.platform==='linux'){
  const stage=path.join(root,'build/system-webview-linux'),binary='circuit-lab-systemwebview';
  await mkdir(stage,{recursive:true});await copyFile(path.join(root,'src-tauri/target/release',binary),path.join(stage,binary));await chmod(path.join(stage,binary),0o755);
  await writeFile(path.join(stage,'README.txt'),'电路实验室 '+version+' · 系统 WebView 轻量版\n\n适用于 Ubuntu 24.04 或兼容的 Linux x64 系统。\n安装系统运行时：sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0\n启动：./circuit-lab-systemwebview\n网页资源已内置，本压缩包不包含浏览器内核。\n');
  await run('tar',['-czf',path.join(output,`CircuitLab-${version}-linux-x64-system-webview.tar.gz`),'-C',stage,binary,'README.txt']);
}
console.log('已生成系统 WebView 轻量版安装包：'+output);
