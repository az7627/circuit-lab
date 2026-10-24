import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(path.join(os.tmpdir(),'circuit-lab-system-test-'));
const report=path.join(temporary,'report.json'),exported=path.join(temporary,'experiment.json');
const binary=path.join(root,process.platform==='linux'?'build/system-webview-linux/circuit-lab-systemwebview':'src-tauri/target/release/circuit-lab-systemwebview'+(process.platform==='win32'?'.exe':''));
const child=spawn(binary,[],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,CIRCUIT_LAB_SYSTEM_SMOKE_REPORT:report,CIRCUIT_LAB_SYSTEM_SMOKE_EXPORT:exported,CIRCUIT_LAB_SYSTEM_DATA_DIR:path.join(temporary,'profile')}});
const timer=setTimeout(()=>child.kill(),90000);
try{
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 const result=JSON.parse(await readFile(report,'utf8'));assert.equal(code,0,JSON.stringify(result));assert.equal(result.error,undefined);assert.equal(result.persistence,true);assert.equal(result.export,true);assert.equal(result.fullscreen,true);
 assert.equal(JSON.parse(await readFile(exported,'utf8')).name,'系统 WebView 验证');
 await mkdir(path.join(root,'artifacts/system-webview'),{recursive:true});
 await writeFile(path.join(root,'artifacts/system-webview/report.json'),JSON.stringify(result,null,2));
 console.log('系统 WebView 原生启动、主题、重载保存、导出和全屏检查通过。');
 console.log(JSON.stringify(result));
}finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
