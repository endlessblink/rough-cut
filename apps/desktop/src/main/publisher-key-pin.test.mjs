import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createUpdateController, publisherSignaturePayload, validateReleasePolicy, validateUpdateInfo } from './update-controller.mjs';

const policy = JSON.parse(readFileSync(new URL('../../../../release-policy.json', import.meta.url), 'utf8'));
const expectedFingerprint = '9c524b910bb2c4986f49a209b76dcacb45653946c652a3ccf35276f802442be1';
const options = { currentVersion: '0.1.0-beta.7', feedURL: policy.url, provider: 'github', publisherPublicKey: policy.publisherPublicKey };

test('release source pins the exact owner-supplied Ed25519 SPKI and public documentation copy', () => {
  const key = createPublicKey(policy.publisherPublicKey);
  assert.equal(key.asymmetricKeyType, 'ed25519');
  const digest = createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
  assert.equal(digest, expectedFingerprint);
  assert.equal(policy.publisherPublicKeyFingerprintSha256, expectedFingerprint);
  assert.equal(readFileSync(new URL('../../../../docs/publisher-public-key.pem', import.meta.url), 'utf8'), policy.publisherPublicKey);
  // Validation here inspects a private in-memory copy; the distributed policy stays inactive.
  assert.equal(validateReleasePolicy({ ...policy, activated: true }).publisherPublicKey, policy.publisherPublicKey);
});

test('pinned but inactive release policy makes no updater request or installation', async () => {
  assert.equal(policy.activated, false);
  assert.equal(validateReleasePolicy(policy), null);
  const backend = new EventEmitter();
  let calls = 0;
  for (const method of ['setFeedURL', 'checkForUpdates', 'downloadUpdate', 'quitAndInstall']) {
    backend[method] = () => { calls++; throw new Error('Inactive updater must not call its backend'); };
  }
  const controller = createUpdateController({ backend, releasePolicy: policy, appImagePath: '/tmp/not-written-publisher-pin-test.AppImage', userDataDir: '/tmp', version: options.currentVersion });
  assert.equal((await controller.check()).status, 'disabled');
  assert.equal(controller.install().status, 'not-ready');
  assert.equal(calls, 0);
});

test('owner public pin rejects unsigned metadata and signatures made by a different public test key', () => {
  const metadata = { version: '0.1.0-beta.8', files: [{ url: 'Rough-Cut-0.1.0-beta.8-x64.AppImage', sha512: Buffer.alloc(64, 1).toString('base64') }] };
  assert.throws(() => validateUpdateInfo(metadata, options), /Signed publisher metadata/);
  // Published RFC8032 vector. This is a rejection test, never owner-key signing proof.
  const testKey = createPrivateKey({ key: Buffer.from('302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'), format: 'der', type: 'pkcs8' });
  const differentKeySignature = sign(null, publisherSignaturePayload(metadata), testKey).toString('base64');
  assert.throws(() => validateUpdateInfo({ ...metadata, publisherSignature: differentKeySignature }, options), /Publisher signature verification failed/);
});
