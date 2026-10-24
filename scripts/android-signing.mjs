import {execFileSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';

export function verifySigningFingerprint(actual, baseline) {
  const normalized=String(actual).replaceAll(':','').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(normalized)||normalized!==baseline.sha256)throw new Error(`Android 发布证书不匹配：必须沿用 ${baseline.baseline} 的证书 ${baseline.sha256}，实际为 ${normalized}。不会生成或替换私钥。`);
  return normalized;
}

export function verifyReleaseKeystore(jdk) {
  const baseline=JSON.parse(readFileSync(new URL('../android/release-certificate.json',import.meta.url),'utf8'));
  const pem=execFileSync(path.join(jdk,'bin',process.platform==='win32'?'keytool.exe':'keytool'),[
    '-exportcert','-rfc','-keystore',process.env.ANDROID_KEYSTORE_FILE,'-alias',process.env.ANDROID_KEY_ALIAS,'-storepass:env','ANDROID_KEYSTORE_PASSWORD'
  ],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
  const cert=new X509Certificate(pem);
  verifySigningFingerprint(cert.fingerprint256,baseline);
  const publicKey=cert.publicKey.export({type:'spki',format:'pem'}).trim();
  if(process.env.GITHUB_ACTIONS==='true'&&!process.env.ANDROID_RELEASE_PUBLIC_KEY)throw new Error('缺少已核实的 ANDROID_RELEASE_PUBLIC_KEY，停止发布。');
  if(process.env.ANDROID_RELEASE_PUBLIC_KEY&&publicKey!==process.env.ANDROID_RELEASE_PUBLIC_KEY.trim().replaceAll('\r',''))throw new Error('发布密钥与仓库保存的 v2.9.0 公钥不匹配。');
  if(process.env.ANDROID_RELEASE_CERT_SHA256)verifySigningFingerprint(process.env.ANDROID_RELEASE_CERT_SHA256,baseline);
  console.log(`已核对 Android 发布密钥：沿用 ${baseline.baseline} 证书 ${baseline.sha256}。`);
}
