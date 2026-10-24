import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {verifySigningFingerprint} from '../scripts/android-signing.mjs';
const baseline=JSON.parse(readFileSync(new URL('../android/release-certificate.json',import.meta.url),'utf8'));
test('Android releases must keep the published v2.9.0 signer',()=>{
  assert.equal(verifySigningFingerprint(baseline.sha256,baseline),baseline.sha256);
  assert.equal(verifySigningFingerprint(baseline.sha256.toUpperCase().match(/../g).join(':'),baseline),baseline.sha256);
  assert.throws(()=>verifySigningFingerprint('f4db96265132071932ee8e6f0f46924786dd35db141d365b5e58bceedb983c58',baseline),/发布证书不匹配/);
  assert.throws(()=>verifySigningFingerprint('',baseline),/发布证书不匹配/);
});
