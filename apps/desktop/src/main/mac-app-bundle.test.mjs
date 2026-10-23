import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMacReleaseLaunchEnv, isMacReleaseBundle } from './mac-app-bundle.mjs';

const resourcesPath = '/Applications/Rough Cut.app/Contents/Resources';

test('the Mac release bundle loads the built renderer and opens the editor', () => {
  const env = {};
  assert.equal(applyMacReleaseLaunchEnv(env, { platform: 'darwin', appPath: `${resourcesPath}/app`, resourcesPath }), true);
  assert.equal(env.ROUGH_CUT_LOAD_BUILT_RENDERER, '1');
  assert.equal(env.ROUGH_CUT_STARTUP_MODE, 'editor');
});

test('a dev run on a Mac still loads from Vite', () => {
  const env = {};
  const devResources = '/repo/apps/desktop/node_modules/electron/dist/Electron.app/Contents/Resources';
  assert.equal(applyMacReleaseLaunchEnv(env, { platform: 'darwin', appPath: '/repo/apps/desktop', resourcesPath: devResources }), false);
  assert.deepEqual(env, {});
});

test('Linux and Windows are left to their own launchers', () => {
  for (const platform of ['linux', 'win32']) {
    assert.equal(isMacReleaseBundle({ platform, appPath: `${resourcesPath}/app`, resourcesPath }), false);
  }
});

test('a value set on purpose wins', () => {
  const env = { ROUGH_CUT_STARTUP_MODE: 'recorder' };
  applyMacReleaseLaunchEnv(env, { platform: 'darwin', appPath: `${resourcesPath}/app`, resourcesPath });
  assert.equal(env.ROUGH_CUT_STARTUP_MODE, 'recorder');
});
