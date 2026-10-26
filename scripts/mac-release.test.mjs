import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { macReleaseVersion, macReleaseManifest } from './lib/mac-release-metadata.mjs';
import { captureLaunchScreenshot } from './mac/capture-launch-screenshot.mjs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { gt } = createRequire(require.resolve('electron-updater'))('semver');

test('Mac launch capture falls back after a browser timeout and still fails without visual evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rc-mac-launch-capture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'launch.png');
  const png = Buffer.alloc(1200);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(900, 16); png.writeUInt32BE(600, 20);
  let nativeCalls = 0;
  const timeout = async () => { throw new Error('Page.captureScreenshot timed out'); };
  assert.equal(await captureLaunchScreenshot({ path, capturePage: timeout, nativeCapture: async output => {
    nativeCalls++; await writeFile(output, png);
  } }), 'native-macos');
  assert.equal(nativeCalls, 1);
  assert.equal(await captureLaunchScreenshot({ path, capturePage: async () => ({ data: png.toString('base64') }),
    nativeCapture: () => { throw new Error('must not run'); } }), 'browser');
  await assert.rejects(captureLaunchScreenshot({ path: join(root, 'missing.png'), capturePage: timeout,
    nativeCapture: async () => {} }), /ENOENT/);
  await assert.rejects(captureLaunchScreenshot({ path, capturePage: timeout,
    nativeCapture: async output => writeFile(output, 'invalid') }), /invalid/);
});

test('Mac build versions increase without changing the shared base version', () => {
  const base = '0.1.0-beta.12';
  const first = macReleaseVersion(base, { GITHUB_RUN_NUMBER: '40' });
  const next = macReleaseVersion(base, { GITHUB_RUN_NUMBER: '41' });
  assert.equal(first, '0.1.0-beta.12.mac.40');
  assert.ok(gt(first, base));
  assert.ok(gt(next, first));
  assert.ok(gt('0.1.0-beta.13', next));
  assert.equal(base, '0.1.0-beta.12');
  assert.equal(macReleaseVersion(base, { ROUGH_CUT_MAC_BUILD: '42', GITHUB_RUN_NUMBER: '40' }), '0.1.0-beta.12.mac.42');
});

test('local Mac builds use a timestamp and invalid explicit build numbers fail closed', () => {
  assert.equal(macReleaseVersion('0.1.0-beta.12', {}, 1700000000000), '0.1.0-beta.12.mac.1700000000');
  for (const value of ['', '0', '-1', '1.5', '01', 'abc', '9007199254740992']) {
    assert.throws(() => macReleaseVersion('0.1.0-beta.12', { ROUGH_CUT_MAC_BUILD: value }));
    assert.throws(() => macReleaseVersion('0.1.0-beta.12', { GITHUB_RUN_NUMBER: value }));
  }
  assert.throws(() => macReleaseVersion('../../bad', {}));
});

test('both architectures publish the same manifest tied to the existing shared release', () => {
  const manifest = macReleaseManifest('0.1.0-beta.12.mac.41', 'v0.1.0-beta.12');
  assert.equal(manifest.version, '0.1.0-beta.12.mac.41');
  assert.equal(manifest.releaseTag, 'v0.1.0-beta.12');
  for (const arch of ['arm64', 'x64']) {
    assert.equal(manifest.files[arch].dmg, `Rough-Cut-${manifest.version}-mac-${arch}.dmg`);
    assert.equal(manifest.files[arch].zip, `Rough-Cut-${manifest.version}-mac-${arch}.zip`);
  }
  assert.throws(() => macReleaseManifest('0.1.0-beta.12', 'v0.1.0-beta.12'));
  assert.throws(() => macReleaseManifest('0.1.0-beta.12.mac.41', '../bad'));
  assert.throws(() => macReleaseManifest('0.1.0-beta.12.mac.41', 'v0.1.0-beta.13'), 'stale packages cannot target a new shared release');
});

test('only Mac packaging consumes the independent build version and feed', async () => {
  const linux = await readFile(new URL('./package-linux.mjs', import.meta.url), 'utf8');
  const windows = await readFile(new URL('./package-windows.mjs', import.meta.url), 'utf8');
  for (const source of [linux, windows]) {
    assert.doesNotMatch(source, /macReleaseVersion|mac-latest\.json|ROUGH_CUT_MAC_BUILD/);
  }
});
