import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc-channels.mjs';
import { installSupportServices } from './support-services.mjs';

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rc-support-services-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const desktop = join(root, 'Desktop'); await mkdir(desktop);
  const external = [], reveals = [], dialogs = [], handlers = new Map();
  const options = { app: { getPath: key => key === 'desktop' ? desktop : root, getVersion: () => '0.1.0-beta.12.mac.10' },
    ipcMain: { handle: (key, handler) => handlers.set(key, handler) }, channels: IPC_CHANNELS,
    desktopCapturer: { getSources: async () => [{ thumbnail: { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,real-observed-frame' } }] },
    getPermissions: () => ({ screen: 'granted', microphone: 'denied' }),
    getDevices: async () => ({ cameras: [{ name: 'Camera' }], microphones: [{ name: 'Mic' }] }),
    getClaude: async () => ({ ok: false, status: 'not-signed-in', token: 'must-not-leave-main' }),
    getTranscription: async () => ({ available: false, engine: null }), getRecording: () => ({ state: 'idle' }),
    recordingsDir: join(root, 'recordings'), runtimeLogPath: join(root, 'missing.log'),
    shell: { openExternal: async url => external.push(url), showItemInFolder: path => reveals.push(path) },
    dialog: { showMessageBox: async (_parent, options) => dialogs.push(options) },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] }, ...overrides };
  return { root, external, reveals, dialogs, handlers, support: installSupportServices(options) };
}
const results = ['opens', 'screen', 'mic', 'camera', 'claude', 'transcription'].map(id => ({ id, status: id === 'opens' ? 'pass' : 'skipped', detail: 'Observed result' }));

test('persists all six observed checks privately and restores them without opening a browser', async t => {
  const f = await fixture(t);
  assert.equal((await f.support.status()).selfCheck, null);
  await f.support.saveSelfCheck(results);
  assert.equal((await f.support.status()).selfCheck.length, 6);
  assert.equal((await stat(join(f.root, 'mac-self-check.json'))).mode & 0o777, 0o600);
  assert.deepEqual(f.external, []);
  assert.equal(f.handlers.size, 5);
  await assert.rejects(f.support.saveSelfCheck(results.slice(1)), /all six/);
  await assert.rejects(f.support.saveSelfCheck([...results.slice(1), results[1]]), /all six/);
  await assert.rejects(f.support.saveSelfCheck(results.map(r => ({ ...r, status: 'running' }))), /all six/);
});
test('requires an actual nonempty screen image', async t => {
  const f = await fixture(t, { desktopCapturer: { getSources: async () => [{ thumbnail: { isEmpty: () => true } }] } });
  await assert.rejects(f.support.screenThumbnail(), /No screen image/);
});
test('saving a report does not send anything; only Report a problem opens the draft form', async t => {
  const f = await fixture(t);
  await f.support.saveSelfCheck(results);
  const report = await f.support.createReport();
  assert.ok((await stat(report.zipPath)).size > 0);
  assert.deepEqual(f.external, []);
  assert.deepEqual(f.reveals, []);
  await f.support.reportProblem();
  assert.equal(f.external.length, 1);
  assert.ok(f.external[0].startsWith('https://github.com/endlessblink/rough-cut/issues/new?'));
  assert.equal(f.reveals.length, 1);
  assert.match(f.dialogs[0].detail, /Nothing was sent/);
});
test('failed tool/device discovery stays false and does not prevent a report', async t => {
  const fail = async () => { throw new Error('private diagnostic detail'); };
  const f = await fixture(t, { getClaude: fail, getTranscription: fail, getDevices: fail });
  const status = await f.support.status();
  assert.deepEqual(status.claude, { ok: false, status: 'unavailable' });
  assert.equal(status.transcription.available, false);
  assert.ok((await f.support.createReport()).zipPath.endsWith('.zip'));
});
test('browser failure preserves the saved zip and does not await the acknowledgement', async t => {
  const f = await fixture(t, {
    shell: { showItemInFolder: () => {}, openExternal: async () => { throw new Error('browser unavailable'); } },
    dialog: { showMessageBox: () => new Promise(() => {}) },
  });
  const report = await Promise.race([f.support.reportProblem(), new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('report waited for acknowledgement')), 1000); timer.unref();
  })]);
  assert.equal(report.issueOpened, false);
  assert.ok((await stat(report.zipPath)).size > 0);
});
