// One-time repair explicitly requested for the already-published v2.8.2 Android assets.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {verifyReleaseKeystore,verifySigningFingerprint} from './android-signing.mjs';
import {expectedAssets} from './release-info.mjs';

const repo='az7627/circuit-lab',tag='v2.8.2',version='2.8.2';
const root=path.resolve('artifacts/resign',tag),input=path.join(root,'input'),output=path.join(root,'output');
mkdirSync(input,{recursive:true});mkdirSync(output,{recursive:true});
const run=(exe,args)=>execFileSync(exe,args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
const gh=args=>run('gh',args);
const jdk=process.env.JAVA_HOME,sdk=process.env.ANDROID_HOME;
if(!jdk||!sdk)throw new Error('JAVA_HOME 和 ANDROID_HOME 必须设置。');
verifyReleaseKeystore(jdk);
const baseline=JSON.parse(readFileSync('android/release-certificate.json','utf8'));
const java=path.join(jdk,'bin/java'),signer=path.join(sdk,'build-tools/36.0.0/lib/apksigner.jar');
const release=JSON.parse(gh(['api',`repos/${repo}/releases/tags/${tag}`]));
assert.equal(release.draft,false);
gh(['release','download',tag,'--repo',repo,'--pattern','*android-release.*','--pattern','SHA256SUMS.txt','--dir',input]);
const names=['apk','aab'].map(ext=>`CircuitLab-${version}-android-release.${ext}`);
const apk=names[0],aab=names[1];
run(java,['-jar',signer,'sign','--ks',process.env.ANDROID_KEYSTORE_FILE,'--ks-key-alias',process.env.ANDROID_KEY_ALIAS,'--ks-pass','env:ANDROID_KEYSTORE_PASSWORD','--key-pass','env:ANDROID_KEY_PASSWORD','--out',path.join(output,apk),path.join(input,apk)]);
const verification=run(java,['-jar',signer,'verify','--print-certs',path.join(output,apk)]);
verifySigningFingerprint(verification.match(/certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1],baseline);
run(path.join(jdk,'bin/jarsigner'),['-keystore',process.env.ANDROID_KEYSTORE_FILE,'-storepass:env','ANDROID_KEYSTORE_PASSWORD','-keypass:env','ANDROID_KEY_PASSWORD','-signedjar',path.join(output,aab),path.join(input,aab),process.env.ANDROID_KEY_ALIAS]);
run(path.join(jdk,'bin/jarsigner'),['-verify',path.join(output,aab)]);
const entries=new Map(readFileSync(path.join(input,'SHA256SUMS.txt'),'utf8').trim().split('\n').map(line=>{const match=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(match);return [match[2],match[1]];}));
assert.deepEqual([...entries.keys()].sort(),expectedAssets(version));
for(const name of names)entries.set(name,createHash('sha256').update(readFileSync(path.join(output,name))).digest('hex'));
writeFileSync(path.join(output,'SHA256SUMS.txt'),[...entries].map(([name,hash])=>`${hash}  ${name}`).join('\n')+'\n');
gh(['release','upload',tag,'--repo',repo,...[...names,'SHA256SUMS.txt'].map(name=>path.join(output,name)),'--clobber']);
const notice='**Android 签名复核：** Android APK/AAB 已按 v2.9.0 的固定发布密钥重新签名并重新上传，SHA256SUMS.txt 已同步更新。原正式版与 v2.9.0 使用同一证书；调试版使用不同包名和证书。';
if(!(release.body||'').includes('Android 签名复核')){const notes=path.join(root,'notes.md');writeFileSync(notes,(release.body||'')+'\n\n'+notice+'\n');gh(['release','edit',tag,'--repo',repo,'--notes-file',notes]);}
const updated=JSON.parse(gh(['api',`repos/${repo}/releases/tags/${tag}`]));
for(const asset of updated.assets.filter(asset=>names.includes(asset.name)))assert.equal(asset.digest,'sha256:'+entries.get(asset.name));
console.log('已用 v2.9.0 固定发布密钥重签并替换 v2.8.2 的 APK/AAB，校验文件已更新。');
