import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCrashReport, createCrashReporting } from './crash-reporting.mjs';
import { createUpdateController, validateReleasePolicy, validateUpdateInfo, saveUpdateBackup, restoreUpdateBackup } from './update-controller.mjs';

function fixture(fn) { const root = mkdtempSync(join(tmpdir(), 'rough-cut-release-safety-')); return Promise.resolve().then(() => fn(root)).finally(() => rmSync(root, { recursive: true, force: true })); }
const runtime = { appVersion: '0.1.0-beta.2', electronVersion: '43.7.7', platform: 'linux', arch: 'x64' };
const info = { version: '0.1.0-beta.3', files: [{ url: 'Rough-Cut.AppImage', sha512: Buffer.alloc(64, 1).toString('base64') }] };
const policy = { approved: true, url: 'https://updates.example.test/releases/', channel: 'beta' };
function backend(result = info) { const b = new EventEmitter(); b.setFeedURL = () => {}; b.checkForUpdates = async () => ({ updateInfo: result }); b.downloadUpdate = async () => {}; b.quitAndInstall = () => {}; return b; }

test('crash payload allowlist rejects recordings, project paths, errors and identifiers', () => {
  const report = createCrashReport({ reason: 'crashed', processType: 'renderer', exitCode: 139, message: '/home/private/secret', stack: 'secret', userId: 'secret', project: 'secret', recording: 'secret', errorType: 'secret' }, { ...runtime, username: 'secret' });
  assert.equal(report.reason, 'crashed'); assert.equal(report.errorType, null); assert.doesNotMatch(JSON.stringify(report), /secret|\/home|username|userId|recording|stack/);
  assert.equal(Object.keys(report).length, 11);
});
test('default off and cancel do not create preference/report files; opt-out clears captured event', () => fixture(async (root) => {
  let response = 2;
  const reporting = createCrashReporting({ userDataDir: root, runtime, dialogs: { showMessageBox: async () => ({ response }) } });
  reporting.capture({ reason: 'crashed' }); assert.equal(reporting.latest(), null);
  assert.equal((await reporting.show()).status, 'canceled'); assert.equal(existsSync(join(root, 'crash-reporting-preference.json')), false);
  response = 1; await reporting.show(); assert.equal(reporting.enabled, true);
  reporting.capture({ reason: 'crashed' }); assert.equal(reporting.latest().reason, 'crashed');
  await reporting.show(); assert.equal(reporting.enabled, false); assert.equal(reporting.latest(), null);
  const reloaded = createCrashReporting({ userDataDir: root, runtime, dialogs: {} }); assert.equal(reloaded.enabled, false);
}));
test('each report export previews exact payload and destination; both cancel stages write nothing', () => fixture(async (root) => {
  const path = join(root, 'report.json'); let preview; let cancelPicker = true; let response = 1;
  const reporting = createCrashReporting({ userDataDir: root, runtime, dialogs: { showSaveDialog: async () => ({ canceled: cancelPicker, filePath: path }), showMessageBox: async (_window, options) => { preview = options; return { response }; } } });
  assert.equal((await reporting.exportReport()).status, 'canceled'); assert.equal(existsSync(path), false);
  cancelPicker = false; assert.equal((await reporting.exportReport()).status, 'canceled'); assert.equal(existsSync(path), false);
  assert.equal(preview.defaultId, 1); assert.match(preview.detail, /No network upload/); assert.ok(preview.detail.includes(path));
  response = 0; assert.equal((await reporting.exportReport()).status, 'exported');
  assert.equal(readFileSync(path, 'utf8'), preview.detail.split('Exact payload:\n')[1]);
  assert.equal(existsSync(join(root, 'crash-reporting-preference.json')), false);
}));
test('update policy requires explicit approval, HTTPS, and credential-free feed; loopback is test-only', () => {
  assert.equal(validateReleasePolicy({ ...policy, approved: false }), null);
  for (const url of ['http://example.test/', 'https://user:pass@example.test/', 'https://example.test/?token=secret', 'http://127.0.0.1/']) assert.throws(() => validateReleasePolicy({ ...policy, url }));
  assert.ok(validateReleasePolicy({ ...policy, url: 'http://127.0.0.1/' }, { allowLoopbackForTests: true }));
  for (const changes of [{ version: '0.0.1' }, { files: [{ ...info.files[0], sha512: 'invalid' }] }, { files: [{ ...info.files[0], url: 'https://other.example.test/file.AppImage' }] }, { files: [{ ...info.files[0], url: 'file.deb' }] }]) assert.throws(() => validateUpdateInfo({ ...info, ...changes }, { currentVersion: runtime.appVersion, feedURL: policy.url }));
});
test('unapproved/unsupported builds make no updater request', () => fixture(async (root) => {
  const b = backend(); b.checkForUpdates = () => { throw new Error('Network must remain unused'); };
  const manager = createUpdateController({ backend: b, releasePolicy: { approved: false }, appImagePath: join(root, 'app.AppImage'), userDataDir: root, version: runtime.appVersion });
  assert.equal((await manager.check()).status, 'disabled'); assert.equal(manager.install().status, 'not-ready');
}));
test('busy recording/export prevents installation; only verified download enables install', () => fixture(async (root) => {
  const image = join(root, 'Rough-Cut.AppImage'); writeFileSync(image, 'OLD'); let busy = true; let installs = 0;
  const b = backend(); b.quitAndInstall = () => installs++;
  const manager = createUpdateController({ backend: b, releasePolicy: policy, appImagePath: image, userDataDir: root, version: runtime.appVersion, isBusy: () => busy });
  assert.equal(b.autoDownload, false); assert.equal(b.autoInstallOnAppQuit, false);
  assert.equal((await manager.check()).status, 'downloaded'); assert.equal(manager.install().status, 'busy'); assert.equal(installs, 0);
  busy = false; assert.equal(manager.install().status, 'install-requested'); assert.equal(installs, 1); assert.equal(readFileSync(`${image}.previous`, 'utf8'), 'OLD');
}));
test('corrupt/network download cannot replace application or become installable', () => fixture(async (root) => {
  const image = join(root, 'Rough-Cut.AppImage'); writeFileSync(image, 'OLD');
  const b = backend(); b.downloadUpdate = async () => { throw new Error('SHA512 mismatch'); };
  const manager = createUpdateController({ backend: b, releasePolicy: policy, appImagePath: image, userDataDir: root, version: runtime.appVersion });
  assert.equal((await manager.check()).status, 'error'); assert.equal(manager.install().status, 'not-ready'); assert.equal(readFileSync(image, 'utf8'), 'OLD');
}));
test('verified rollback restores only application; tamper and symlink fail closed', () => fixture((root) => {
  const image = join(root, 'Rough-Cut.AppImage'); const journal = join(root, 'data/update.json'); const project = join(root, 'project.roughcut');
  writeFileSync(image, 'OLD'); writeFileSync(project, 'PROJECT'); saveUpdateBackup({ appImagePath: image, journalPath: journal, version: runtime.appVersion });
  writeFileSync(image, 'NEW'); assert.equal(restoreUpdateBackup({ appImagePath: image, journalPath: journal }).version, runtime.appVersion); assert.equal(readFileSync(image, 'utf8'), 'OLD'); assert.equal(readFileSync(project, 'utf8'), 'PROJECT');
  writeFileSync(`${image}.previous`, 'TAMPER'); assert.throws(() => restoreUpdateBackup({ appImagePath: image, journalPath: journal }), /integrity/);
  rmSync(`${image}.previous`); symlinkSync(project, `${image}.previous`); assert.throws(() => saveUpdateBackup({ appImagePath: image, journalPath: journal, version: runtime.appVersion }), /regular file/);
}));
test('installer failure after unlink restores verified previous executable', () => fixture(async (root) => {
  const image = join(root, 'Rough-Cut.AppImage'); writeFileSync(image, 'OLD'); const b = backend();
  b.quitAndInstall = () => { rmSync(image); b.emit('error', new Error('move failed')); };
  const manager = createUpdateController({ backend: b, releasePolicy: policy, appImagePath: image, userDataDir: root, version: runtime.appVersion });
  await manager.check(); assert.equal(manager.install().status, 'error'); assert.equal(readFileSync(image, 'utf8'), 'OLD'); assert.match(manager.status().reason, /restored/);
}));
