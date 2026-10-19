import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createUpdateController, publisherSignaturePayload, UPDATE_PLATFORMS, validateUpdateInfo } from './update-controller.mjs';

// Disposable generated keys: they never sign a real artifact and are not release credentials.
const keys = generateKeyPairSync('ed25519');
const otherKeys = generateKeyPairSync('ed25519');
const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
const policy = {
  approved: true, activated: true, provider: 'github', owner: 'endlessblink', repo: 'rough-cut',
  url: 'https://github.com/endlessblink/rough-cut/releases/', channel: 'beta', publisherPublicKey: publicPem,
};
const INSTALLER = 'Rough-Cut-0.1.0-beta.11-Setup.exe';
const sha = (byte = 1) => Buffer.alloc(64, byte).toString('base64');
const windowsOptions = { currentVersion: '0.1.0-beta.10', feedURL: policy.url, provider: 'github', publisherPublicKey: publicPem, platform: 'win32' };

// Signed metadata as the owner's tool produces it: the platform is part of what is signed.
function signed({ platform = 'win32', key = keys.privateKey, ...changes } = {}) {
  const info = { version: '0.1.0-beta.11', files: [{ url: INSTALLER, sha512: sha() }], ...changes };
  return { ...info, publisherSignature: sign(null, publisherSignaturePayload(info, platform), key).toString('base64') };
}

test('a Windows installer signed for win32 in the version\'s release is accepted', () => {
  assert.ok(validateUpdateInfo(signed(), windowsOptions));
  assert.deepEqual(Object.keys(UPDATE_PLATFORMS).sort(), ['linux', 'win32']);
});

test('a signature made for one platform never authorises the other platform\'s file', () => {
  // The same file list signed as "linux" must not validate for Windows...
  assert.throws(() => validateUpdateInfo(signed({ platform: 'linux' }), windowsOptions), /signature/i);
  // ...and a Windows signature must not validate for Linux (the file name is rejected first, the signature would be too).
  assert.throws(() => validateUpdateInfo(signed({ platform: 'win32', files: [{ url: 'Rough-Cut.AppImage', sha512: sha() }] }), { ...windowsOptions, platform: 'linux' }), /signature/i);
});

test('unsigned, wrong-key, tampered and unknown-platform metadata is rejected for Windows', () => {
  const info = signed();
  assert.throws(() => validateUpdateInfo({ ...info, publisherSignature: undefined }, windowsOptions));
  assert.throws(() => validateUpdateInfo(signed({ key: otherKeys.privateKey }), windowsOptions), /signature/i);
  assert.throws(() => validateUpdateInfo({ ...info, files: [{ ...info.files[0], sha512: sha(2) }] }, windowsOptions), /signature/i);
  assert.throws(() => validateUpdateInfo(info, { ...windowsOptions, platform: 'darwin' }), /platform/i);
});

test('signed metadata cannot authorise anything but a Rough Cut Setup.exe in the exact release', () => {
  for (const url of [
    'evil.exe', 'Rough-Cut-0.1.0-beta.11-Setup.exe.bak', 'Rough-Cut-0.1.0-beta.11-Setup.exe/../x.exe', '../Rough-Cut-0.1.0-beta.11-Setup.exe',
    'https://example.com/Rough-Cut-0.1.0-beta.11-Setup.exe', 'Rough-Cut-0.1.0-beta.11-win-x64.zip', 'Rough-Cut-x-Setup.exe?token=1', 'Rough-Cut.AppImage',
    'Rough-Cut-0.1.0-beta.11-Setup.exe#frag', 'Rough Cut Setup.exe',
  ]) {
    assert.throws(() => validateUpdateInfo(signed({ files: [{ url, sha512: sha() }] }), windowsOptions), undefined, url);
  }
  // A Windows installer name is not an acceptable Linux asset either.
  assert.throws(() => validateUpdateInfo(signed({ platform: 'linux' }), { ...windowsOptions, platform: 'linux' }));
});

test('old version, tag mismatch and malformed checksum are rejected for Windows', () => {
  assert.throws(() => validateUpdateInfo(signed({ version: '0.1.0-beta.9' }), windowsOptions));
  assert.throws(() => validateUpdateInfo(signed({ version: '0.1.0-beta.10' }), windowsOptions));
  assert.throws(() => validateUpdateInfo(signed({ tag: 'v0.1.0-beta.12' }), windowsOptions));
  assert.throws(() => validateUpdateInfo(signed({ files: [{ url: INSTALLER, sha512: 'not-a-checksum' }] }), windowsOptions));
});

// A stand-in for electron-updater's NsisUpdater: records what the controller asks of it.
function fakeBackend({ info = signed(), failDownload = false } = {}) {
  const backend = new EventEmitter();
  backend.calls = [];
  backend.setFeedURL = (feed) => { backend.feed = feed; };
  backend.checkForUpdates = async () => { backend.calls.push('check'); return info ? { updateInfo: info } : null; };
  backend.downloadUpdate = async () => { backend.calls.push('download'); if (failDownload) throw new Error('integrity'); };
  backend.quitAndInstall = (silent, forceRun) => { backend.calls.push(`install:${silent}:${forceRun}`); };
  return backend;
}
const windowsController = (overrides = {}) => createUpdateController({ platform: 'win32', packaged: true, releasePolicy: policy, version: '0.1.0-beta.10', userDataDir: 'C:\\nowhere', ...overrides });

test('an inactive release policy makes no updater request on Windows', async () => {
  const backend = fakeBackend();
  const controller = windowsController({ backend, releasePolicy: { ...policy, activated: false, publisherPublicKey: null } });
  assert.equal(controller.status().status, 'disabled');
  assert.equal((await controller.check()).status, 'disabled');
  assert.deepEqual(backend.calls, []);
  assert.equal(backend.feed, undefined);
});

test('a development run (not the installed app) is unsupported on Windows and never contacts the feed', async () => {
  const backend = fakeBackend();
  const controller = windowsController({ backend, packaged: false });
  assert.equal(controller.status().status, 'unsupported');
  await controller.check();
  assert.deepEqual(backend.calls, []);
});

test('Windows check downloads only after the signed metadata is verified, and installs silently on request', async () => {
  const backend = fakeBackend();
  const controller = windowsController({ backend });
  assert.deepEqual(backend.feed, { provider: 'github', owner: 'endlessblink', repo: 'rough-cut', private: false, channel: 'beta' });
  assert.equal(backend.autoDownload, false);
  assert.equal(backend.autoInstallOnAppQuit, false);
  assert.equal(backend.allowDowngrade, false);
  assert.equal(backend.disableDifferentialDownload, true, 'the whole installer is downloaded and checked against the signed SHA512');
  const result = await controller.check();
  assert.equal(result.status, 'downloaded');
  assert.equal(result.version, '0.1.0-beta.11');
  assert.deepEqual(backend.calls, ['check', 'download']);
  // Silent install, run the app again afterwards; no AppImage backup journal is written on Windows.
  assert.equal(controller.install().status, 'install-requested');
  assert.deepEqual(backend.calls, ['check', 'download', 'install:true:true']);
  assert.equal(controller.canRollback(), false);
  assert.equal(controller.rollback().status, 'unsupported');
});

test('unsigned or wrong-platform Windows metadata is never downloaded or installed', async () => {
  for (const info of [signed({ key: otherKeys.privateKey }), signed({ platform: 'linux' }), { ...signed(), publisherSignature: undefined }]) {
    const backend = fakeBackend({ info });
    const controller = windowsController({ backend });
    assert.equal((await controller.check()).status, 'error');
    assert.deepEqual(backend.calls, ['check']);
    assert.equal(controller.install().status, 'not-ready');
    assert.ok(!backend.calls.some((call) => call.startsWith('install')));
  }
});

test('no newer version leaves Windows current, and a failed download is reported without installing', async () => {
  const current = fakeBackend({ info: null });
  assert.equal((await windowsController({ backend: current }).check()).status, 'current');
  const failing = fakeBackend({ failDownload: true });
  const controller = windowsController({ backend: failing });
  assert.equal((await controller.check()).status, 'error');
  assert.equal(controller.install().status, 'not-ready');
});

test('Windows install waits while recording or exporting', async () => {
  let busy = true;
  const backend = fakeBackend();
  const controller = windowsController({ backend, isBusy: () => busy });
  await controller.check();
  assert.equal(controller.install().status, 'busy');
  assert.ok(!backend.calls.some((call) => call.startsWith('install')));
  busy = false;
  assert.equal(controller.install().status, 'install-requested');
});

test('a backend error leaves the installed version in place and explains it', async () => {
  const backend = fakeBackend();
  const controller = windowsController({ backend });
  await controller.check();
  controller.install();
  backend.emit('error', new Error('installer failed'));
  const status = controller.status();
  assert.equal(status.status, 'error');
  assert.match(status.reason, /current version was not replaced/i);
});
