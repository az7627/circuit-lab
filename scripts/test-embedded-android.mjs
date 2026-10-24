import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const sdk=process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA||'', 'Android/Sdk');
const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
const serial=process.env.ANDROID_SERIAL;
if(!serial)throw new Error('请设置测试模拟器的 ANDROID_SERIAL。');
const run=args=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
const pkg='io.circuitlab.app.embedded.debug',version=JSON.parse(readFileSync('package.json','utf8')).version;
const oldNight=run(['shell','cmd','uimode','night']).match(/Night mode: (\w+)/)?.[1]||'auto';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 run(['install','-r','-t',`release/android/CircuitLab-${version}-android-embedded-debug.apk`]);
 run(['shell','am','force-stop',pkg]);
 run(['shell','pm','clear',pkg]);
 run(['shell','cmd','uimode','night','yes']);
 run(['shell','am','start','-n',pkg+'/io.circuitlab.embedded.EmbeddedActivity','--ez','circuitlab.smoke','true']);
 let report;
 for(let n=0;n<120;n++){await wait(1000);try{report=JSON.parse(run(['shell','run-as',pkg,'cat','files/smoke-report.json']));break;}catch{}if(n%20===19)console.log('正在等待内置 GeckoView 完成原生检查…');}
 assert.ok(report,'内置内核测试超时');assert.equal(report.error,undefined,JSON.stringify(report));assert.equal(report.systemTheme,'dark');assert.equal(report.persistence,true);assert.equal(report.fullscreen,true);
 const exported=JSON.parse(run(['shell','run-as',pkg,'cat','files/smoke-export.json']));assert.equal(exported.name,'内置内核验证');
 mkdirSync('artifacts/embedded-android',{recursive:true});writeFileSync('artifacts/embedded-android/report.json',JSON.stringify(report,null,2));
 console.log('Android 内置 GeckoView：离线启动、系统深色、重载保存、原生导出和系统栏全屏检查通过。');console.log(JSON.stringify(report));
}finally{try{run(['shell','am','force-stop',pkg]);run(['shell','cmd','uimode','night',oldNight]);}catch{}}
