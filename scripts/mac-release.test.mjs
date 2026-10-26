import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { macReleaseVersion, macReleaseManifest } from './lib/mac-release-metadata.mjs';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { gt } = createRequire(require.resolve('electron-updater'))('semver');

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
