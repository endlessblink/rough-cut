import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { prepareMetadata, signMetadata, verifyMetadata, verifyArtifactMetadata } from './release-metadata.mjs';
import { publisherSignaturePayload } from '../apps/desktop/src/main/update-controller.mjs';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { parseUpdateInfo } = require('electron-updater/out/providers/Provider');
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider');
// Published RFC8032 test vector, never a production credential.
const knownTestKey = createPrivateKey({ key: Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'), format: 'der', type: 'pkcs8' });
function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'rough-cut-metadata-test-'));
  const image=join(dir,'Rough-Cut-0.1.0-beta.7.AppImage'),key=join(dir,'test-key.pem'),pub=join(dir,'test-public.pem');
  writeFileSync(image, 'SYNTHETIC_TEST_BYTES_NOT_A_PACKAGE');
  writeFileSync(key,knownTestKey.export({type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase:'test-only-passphrase'}),{mode:0o600});
  writeFileSync(pub,createPublicKey(knownTestKey).export({type:'spki',format:'pem'}));
  return {dir,image,key,pub};
}
test('prepared and signed beta YAML is preserved by installed 6.x GitHub provider parser and verifies',async()=>{
 const f=fixture();try {
  const metadata=await prepareMetadata({version:'0.1.0-beta.7',appImagePath:f.image});
  assert.equal(metadata.files[0].size,34);assert.equal(metadata.sha512,metadata.files[0].sha512);
  const signed=signMetadata({metadata,encryptedKeyPath:f.key,passphrase:'test-only-passphrase'});
  const parsed=parseUpdateInfo(JSON.stringify(signed),'beta-linux.yml','https://github.com/endlessblink/rough-cut/releases/download/v0.1.0-beta.7/beta-linux.yml');
  assert.equal(parsed.publisherSignature,signed.publisherSignature);
  verifyMetadata({metadata:parsed,publicKeyPath:f.pub,currentVersion:'0.1.0-beta.6'});
  const provider=new GitHubProvider({provider:'github',owner:'endlessblink',repo:'rough-cut'},{channel:'beta',allowPrerelease:true},{platform:'linux',executor:{}});
  assert.equal(provider.resolveFiles({...parsed,tag:'v0.1.0-beta.7'})[0].url.href,'https://github.com/endlessblink/rough-cut/releases/download/v0.1.0-beta.7/Rough-Cut-0.1.0-beta.7.AppImage');
  assert.throws(()=>verifyMetadata({metadata:{...parsed,files:[{...parsed.files[0],sha512:Buffer.alloc(64).toString('base64')}]},publicKeyPath:f.pub,currentVersion:'0.1.0-beta.6'}));
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('signer rejects wrong passphrase, readable/symlink/plaintext keys and does not modify app bytes',async()=>{
 const f=fixture();try {
  const metadata=await prepareMetadata({version:'0.1.0-beta.7',appImagePath:f.image});
  assert.throws(()=>signMetadata({metadata,encryptedKeyPath:f.key,passphrase:'wrong'}));
  chmodSync(f.key,0o644);assert.throws(()=>signMetadata({metadata,encryptedKeyPath:f.key,passphrase:'test-only-passphrase'}));chmodSync(f.key,0o600);
  const link=join(f.dir,'link');symlinkSync(f.key,link);assert.throws(()=>signMetadata({metadata,encryptedKeyPath:link,passphrase:'test-only-passphrase'}));
  writeFileSync(f.key,knownTestKey.export({type:'pkcs8',format:'pem'}));assert.throws(()=>signMetadata({metadata,encryptedKeyPath:f.key,passphrase:''}));
  assert.deepEqual(await prepareMetadata({version:'0.1.0-beta.7',appImagePath:f.image}),metadata);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('metadata preparation rejects non-beta versions, unsafe asset names and symlinks',async()=>{
 const f=fixture();try {
  await assert.rejects(prepareMetadata({version:'0.1.0',appImagePath:f.image}));
  const bad=join(f.dir,'bad name.AppImage');writeFileSync(bad,'bad');await assert.rejects(prepareMetadata({version:'0.1.0-beta.7',appImagePath:bad}));
  const link=join(f.dir,'Link.AppImage');symlinkSync(f.image,link);await assert.rejects(prepareMetadata({version:'0.1.0-beta.7',appImagePath:link}));
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('artifact verification detects changed bytes/name/size before signing or local acceptance',async()=>{
 const f=fixture();try {
  const metadata=await prepareMetadata({version:'0.1.0-beta.7',appImagePath:f.image});
  await verifyArtifactMetadata({metadata,appImagePath:f.image});
  assert.throws(()=>signMetadata({metadata:{...metadata,version:'0.1.0'},encryptedKeyPath:f.key,passphrase:'test-only-passphrase'}));
  writeFileSync(f.image,'CHANGED_SYNTHETIC_TEST_BYTES');await assert.rejects(verifyArtifactMetadata({metadata,appImagePath:f.image}));
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});

// Windows: the installer is signed with the same owner key; the platform is part of what is signed.
const INSTALLER_NAME = 'Rough-Cut-0.1.0-beta.11-Setup.exe';
function installerFixture() {
  const f = fixture();
  const installer = join(f.dir, INSTALLER_NAME);
  writeFileSync(installer, 'SYNTHETIC_TEST_BYTES_NOT_AN_INSTALLER');
  return { ...f, installer };
}
test('Windows metadata is prepared from the Setup.exe and only accepts a safe installer name', async () => {
  const f = installerFixture();
  try {
    const metadata = await prepareMetadata({ version: '0.1.0-beta.11', installerPath: f.installer, platform: 'win32' });
    assert.equal(metadata.files[0].url, INSTALLER_NAME);
    assert.equal(metadata.files[0].size, 37);
    assert.equal(metadata.path, INSTALLER_NAME);
    await verifyArtifactMetadata({ metadata, installerPath: f.installer, platform: 'win32' });
    const wrong = join(f.dir, 'setup.exe');
    writeFileSync(wrong, 'x');
    await assert.rejects(prepareMetadata({ version: '0.1.0-beta.11', installerPath: wrong, platform: 'win32' }));
    await assert.rejects(prepareMetadata({ version: '0.1.0-beta.11', installerPath: f.image, platform: 'win32' }), undefined, 'an AppImage is not a Windows installer');
    await assert.rejects(prepareMetadata({ version: '0.1.0-beta.11', appImagePath: f.installer, platform: 'linux' }), undefined, 'a Setup.exe is not an AppImage');
    await assert.rejects(prepareMetadata({ version: '0.1.0-beta.11', installerPath: f.installer, platform: 'darwin' }));
    writeFileSync(f.installer, 'CHANGED_SYNTHETIC_TEST_BYTES');
    await assert.rejects(verifyArtifactMetadata({ metadata, installerPath: f.installer, platform: 'win32' }));
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
// Signing needs the Linux owner-only key file checks (file modes, process.getuid), so it runs on Linux.
test('a Windows signature verifies for Windows and for nothing else', { skip: process.platform === 'win32' && 'owner-only key file checks need Linux' }, async () => {
  const f = installerFixture();
  try {
    const metadata = await prepareMetadata({ version: '0.1.0-beta.11', installerPath: f.installer, platform: 'win32' });
    const signed = signMetadata({ metadata, encryptedKeyPath: f.key, passphrase: 'test-only-passphrase', platform: 'win32' });
    verifyMetadata({ metadata: signed, publicKeyPath: f.pub, currentVersion: '0.1.0-beta.10', platform: 'win32' });
    // electron-updater's own parser keeps the signature field, and its Windows provider would read beta.yml.
    const parsed = parseUpdateInfo(JSON.stringify(signed), 'beta.yml', 'https://github.com/endlessblink/rough-cut/releases/download/v0.1.0-beta.11/beta.yml');
    assert.equal(parsed.publisherSignature, signed.publisherSignature);
    // The same metadata is not valid as a Linux release.
    assert.throws(() => verifyMetadata({ metadata: signed, publicKeyPath: f.pub, currentVersion: '0.1.0-beta.10', platform: 'linux' }));
    // The tool refuses to sign a Windows installer as a Linux asset...
    assert.throws(() => signMetadata({ metadata, encryptedKeyPath: f.key, passphrase: 'test-only-passphrase', platform: 'linux' }));
    // ...and even a Linux-style signature made directly with the same key does not authorise the Windows installer.
    const forged = { ...metadata, publisherSignature: sign(null, publisherSignaturePayload(metadata, 'linux'), knownTestKey).toString('base64') };
    assert.notEqual(forged.publisherSignature, signed.publisherSignature);
    assert.throws(() => verifyMetadata({ metadata: forged, publicKeyPath: f.pub, currentVersion: '0.1.0-beta.10', platform: 'win32' }));
    assert.throws(() => signMetadata({ metadata, encryptedKeyPath: f.key, passphrase: 'wrong', platform: 'win32' }));
    assert.throws(() => signMetadata({ metadata, encryptedKeyPath: f.key, passphrase: 'test-only-passphrase', platform: 'darwin' }));
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
