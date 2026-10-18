import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  buildAppImageProfile,
  runAppImageSandboxed,
  sandboxDisabledByArgs,
  sandboxedChildArgs,
  shouldHandOffAppImage,
  userNamespacesRestricted,
} from './linux-sandbox-permission.mjs';

const appImageEnv = { APPIMAGE: '/home/u/Rough-Cut.AppImage' };

test('only an AppImage launch that disabled the sandbox is handed off', () => {
  assert.equal(shouldHandOffAppImage({ platform: 'linux', env: appImageEnv, argv: ['/tmp/.mount_x/rough-cut', '--no-sandbox'] }), true);
  assert.equal(shouldHandOffAppImage({ platform: 'linux', env: appImageEnv, argv: ['/tmp/.mount_x/rough-cut'] }), false);
  assert.equal(shouldHandOffAppImage({ platform: 'linux', env: {}, argv: ['/opt/x/rough-cut', '--no-sandbox'] }), false, 'not an AppImage: refused as before');
  assert.equal(shouldHandOffAppImage({ platform: 'linux', env: { ...appImageEnv, ELECTRON_DISABLE_SANDBOX: '1' }, argv: ['x', '--no-sandbox'] }), false);
  assert.equal(shouldHandOffAppImage({ platform: 'linux', env: { ...appImageEnv, ROUGH_CUT_SANDBOX_HANDOFF: '1' }, argv: ['x', '--no-sandbox'] }), false, 'never loops');
  assert.equal(shouldHandOffAppImage({ platform: 'win32', env: appImageEnv, argv: ['x', '--no-sandbox'] }), false);
});

test('the sandboxed child gets the sandbox on and every sandbox-off argument removed', () => {
  assert.deepEqual(sandboxedChildArgs(['/tmp/.mount_x/rough-cut', '--no-sandbox', '--disable-gpu-sandbox', 'project.roughcut']), ['--enable-sandbox', 'project.roughcut']);
  assert.equal(sandboxDisabledByArgs(['--no-sandbox=true']), true);
  assert.equal(sandboxDisabledByArgs(['--enable-sandbox']), false);
});

test('the restriction is read from the kernel setting, and a missing setting means not restricted', () => {
  assert.equal(userNamespacesRestricted({ readText: () => '1\n' }), true);
  assert.equal(userNamespacesRestricted({ readText: () => '0\n' }), false);
  assert.equal(userNamespacesRestricted({ readText: () => { throw new Error('ENOENT'); } }), false);
});

test('the AppArmor rule matches the deb rule, scoped to AppImage mount paths of this binary', () => {
  const profile = buildAppImageProfile('rough-cut');
  assert.match(profile, /^abi <abi\/4\.0>,/);
  assert.match(profile, /profile rough-cut-appimage "\/\{tmp\/\.mount_\*,tmp\/appimage_extracted_\*\}\/rough-cut" flags=\(unconfined\) \{/);
  assert.match(profile, /\n {2}userns,\n/);
});

function fakeRun({ answer = true, installs = true, restricted = true, profileInstalled = false } = {}) {
  const calls = { asked: 0, told: [], installs: [], spawned: [], exitCodes: [] };
  const child = new EventEmitter();
  runAppImageSandboxed({
    argv: ['/tmp/.mount_ab/rough-cut', '--no-sandbox', 'a.roughcut'],
    env: appImageEnv,
    execPath: '/tmp/.mount_ab/rough-cut',
    restricted,
    profileInstalled,
    ask: () => { calls.asked += 1; return answer; },
    tell: (text) => calls.told.push(text),
    installProfile: (text) => { calls.installs.push(text); return installs; },
    spawnChild: (path, args, options) => { calls.spawned.push({ path, args, handoff: options.env.ROUGH_CUT_SANDBOX_HANDOFF }); return child; },
    exit: (code) => calls.exitCodes.push(code),
    onSignal: () => {},
  });
  return { calls, child };
}

test('restricted system: asks once, adds the rule, then runs the app sandboxed and mirrors its exit', () => {
  const { calls, child } = fakeRun();
  assert.equal(calls.asked, 1);
  assert.equal(calls.installs.length, 1);
  assert.deepEqual(calls.spawned, [{ path: '/tmp/.mount_ab/rough-cut', args: ['--enable-sandbox', 'a.roughcut'], handoff: '1' }]);
  child.emit('exit', 3, null);
  assert.deepEqual(calls.exitCodes, [3]);
});

test('rule already there, or system not restricted: no question, straight to the sandboxed app', () => {
  for (const options of [{ profileInstalled: true }, { restricted: false }]) {
    const { calls } = fakeRun(options);
    assert.equal(calls.asked, 0);
    assert.equal(calls.installs.length, 0);
    assert.equal(calls.spawned.length, 1);
  }
});

test('declined or failed: explains, exits 64, and never starts the app unprotected', () => {
  for (const options of [{ answer: false }, { installs: false }]) {
    const { calls } = fakeRun(options);
    assert.equal(calls.spawned.length, 0);
    assert.deepEqual(calls.exitCodes, [64]);
    assert.match(calls.told.at(-1), /cannot start without its protection/);
  }
});
