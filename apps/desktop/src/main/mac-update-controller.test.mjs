import test from 'node:test';
import assert from 'node:assert/strict';
import { createMacUpdateController, validateMacManifest, macNoticeOptions } from './mac-update-controller.mjs';
const version = '0.1.0-beta.12.mac.10';
const tag = 'v0.1.0-beta.12';
const base = `https://github.com/endlessblink/rough-cut/releases/download/${tag}/`;
const manifest = { version, releaseTag: tag, files: Object.fromEntries(['arm64', 'x64'].map(arch => [arch, { dmg: `Rough-Cut-${version}-mac-${arch}.dmg` }])) };
const release = { tag_name: tag, assets: ['mac-latest.json', ...Object.values(manifest.files).map(f => f.dmg)].map(name => ({ name, browser_download_url: base + name })) };
function setup(overrides = {}) {
  const calls = [];
  const c = createMacUpdateController({ version: '0.1.0-beta.12.mac.9', arch: 'arm64', packaged: true, approved: true,
    fetchJSON: async url => { calls.push(url); return url.includes('api.github.com') ? [release] : manifest; },
    showMessageBox: async options => { calls.push(options); return { response: 0 }; },
    openExternal: async url => calls.push({ opened: url }), ...overrides });
  return { c, calls };
}
for (const arch of ['arm64', 'x64']) test(`Mac ${arch} gets correct download and replacement instructions`, async () => {
  const { c, calls } = setup({ arch });
  assert.equal((await c.check({ notify: true })).status, 'available');
  assert.deepEqual(calls.at(-1), { opened: base + manifest.files[arch].dmg });
  assert.equal(calls.at(-2).message, `Rough Cut ${version} is available`);
  assert.equal(calls.at(-2).detail, 'Open it, drag Rough Cut to Applications and choose Replace.');
  assert.deepEqual(calls.at(-2).buttons, ['Download', 'Later']);
  const before = calls.filter(c => typeof c === 'object').length;
  await c.check({ notify: true });
  assert.equal(calls.filter(c => typeof c === 'object').length, before);
  await c.prompt(); // Help can show it again.
  assert.equal(calls.filter(c => typeof c === 'object').length, before + 2);
});
test('Mac current, older and base versions compare monotonically', async () => {
  for (const current of [version, '0.1.0-beta.12.mac.11']) assert.equal((await setup({ version: current }).c.check()).status, 'current');
  assert.equal((await setup({ version: '0.1.0-beta.12' }).c.check()).status, 'available');
});
test('Mac checks fail closed for invalid feed, missing assets and network failure', async () => {
  for (const patch of [{ version: 'bad' }, { releaseTag: 'v0.1.0-beta.13' }, { files: { arm64: { dmg: '../evil.dmg' } } }]) {
    assert.throws(() => validateMacManifest({ ...manifest, ...patch }, release, 'arm64'));
  }
  assert.throws(() => validateMacManifest(manifest, { ...release, assets: [] }, 'arm64'));
  assert.equal((await setup({ fetchJSON: async () => { throw Error('offline'); } }).c.check()).status, 'error');
});
test('missing architecture falls back to the exact release page', () => {
  assert.equal(validateMacManifest({ ...manifest, files: {} }, release, 'arm64').downloadURL, `https://github.com/endlessblink/rough-cut/releases/tag/${tag}`);
});
test('development, unapproved and busy runs do not make requests', async () => {
  for (const overrides of [{ packaged: false }, { approved: false }, { isBusy: () => true }]) {
    const { c, calls } = setup(overrides); await c.check({ notify: true }); assert.deepEqual(calls, []);
  }
});
test('Later never opens a browser, current checks never prompt', async () => {
  const { c, calls } = setup({ showMessageBox: async () => ({ response: 1 }) });
  await c.check({ notify: true }); assert.ok(!calls.some(c => c.opened));
  const current = setup({ version }); await current.c.check({ notify: true });
  assert.equal(current.calls.length, 2);
  assert.equal(macNoticeOptions(version).cancelId, 1);
});
test('concurrent checks share requests and ignore drafts and releases without Mac metadata', async () => {
  let requests = 0;
  const { c } = setup({ fetchJSON: async url => { requests++; return url.includes('api.github.com') ? [{ ...release, draft: true }, {tag_name:'v0.1.0-beta.99', assets:[]}, release] : manifest; } });
  await Promise.all([c.check(), c.check()]); assert.equal(requests, 2);
});
