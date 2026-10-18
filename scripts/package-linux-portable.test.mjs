import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const packager = readFileSync(new URL('./package-linux.mjs', import.meta.url), 'utf8');
const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('packaged launchers carry no personal machine defaults', () => {
  assert.doesNotMatch(packager, /\/home\/endlessblink/);
  assert.doesNotMatch(packager, /TRANSCRIPTION_LANGUAGE=he/);
  assert.doesNotMatch(packager, /\/tmp\/rough-cut-runtime-report/);
  assert.match(packager, /\$\{XDG_CONFIG_HOME:-\$HOME\/\.config\}/);
  assert.match(packager, /ROUGH_CUT_USE_LOCAL_VENV/);
});

test('package:linux builds from a clean clone: no private skill gates in the default path', () => {
  assert.doesNotMatch(rootPackage.scripts['package:linux'], /verify:recording-editor/);
  assert.match(rootPackage.scripts['package:linux:verified'], /verify:recording-editor-skill/);
});

test('artifact ships our AGPL licence and keeps Electron\'s beside it; version comes from the app', () => {
  assert.match(packager, /LICENSE\.electron/);
  assert.match(packager, /cp\(join\(root, 'LICENSE'\)/);
  assert.match(packager, /version: desktopVersion/);
});

test('packager keeps its own sandbox helper and never uses machine-specific helpers', () => {
  assert.doesNotMatch(packager, /configureSandboxHelper|chrome-sandbox\.unprivileged|symlink\(/);
  assert.match(packager, /--enable-sandbox/);
});

test('generated launcher enables sandbox and rejects bypass arguments before starting Electron', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rough-cut-launcher-policy-'));
  try {
    const launcher = join(directory, 'run.sh');
    const log = join(directory, 'launch.json');
    writeFileSync(launcher, readFileSync(new URL('../dist/rough-cut-mvp-linux-x64/run.sh', import.meta.url)), { mode: 0o755 });
    writeFileSync(join(directory, 'electron'), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.ROUGH_CUT_LAUNCHER_TEST_LOG, JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
    const env = { ...process.env, ELECTRON_DISABLE_SANDBOX: '', ROUGH_CUT_LAUNCHER_TEST_LOG: log };
    const normal = spawnSync(launcher, ['--user-data-dir=/tmp/rough-cut-launcher-fixture'], { env, encoding: 'utf8' });
    assert.equal(normal.status, 0, normal.stderr);
    assert.deepEqual(JSON.parse(readFileSync(log, 'utf8')), ['--enable-sandbox', join(directory, 'resources/app'), '--user-data-dir=/tmp/rough-cut-launcher-fixture']);
    rmSync(log);
    for (const flag of ['--no-sandbox', '--no-sandbox=true', '--disable-setuid-sandbox', '--disable-gpu-sandbox', '--disable-seccomp-filter-sandbox', '--disable-namespace-sandbox']) {
      const rejected = spawnSync(launcher, [flag], { env, encoding: 'utf8' });
      assert.equal(rejected.status, 64, flag);
      assert.match(rejected.stderr, /requires the Chromium sandbox/);
      assert.equal(existsSync(log), false, `Electron must not start for ${flag}`);
    }
    const rejected = spawnSync(launcher, [], { env: { ...env, ELECTRON_DISABLE_SANDBOX: '1' }, encoding: 'utf8' });
    assert.equal(rejected.status, 64);
    assert.equal(existsSync(log), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('launcher asks for the sandbox rule on restricted systems and never starts unprotected', () => {
  assert.match(packager, /ensure-sandbox\.sh\\" \|\| exit 64; fi\\nexec \\"\$DIR\/electron\\" --enable-sandbox/);
  assert.match(packager, /scripts\/linux\/ensure-sandbox\.sh/);
  const directory = mkdtempSync(join(tmpdir(), 'rough-cut-ensure-sandbox-'));
  try {
    const helper = join(directory, 'ensure-sandbox.sh');
    writeFileSync(helper, readFileSync(new URL('./linux/ensure-sandbox.sh', import.meta.url)), { mode: 0o755 });
    const restrict = join(directory, 'restrict');
    const run = (value, extra = {}) => {
      writeFileSync(restrict, value);
      return spawnSync(helper, [], { encoding: 'utf8', env: { PATH: process.env.PATH, ROUGH_CUT_USERNS_RESTRICT_FILE: restrict, ...extra } });
    };
    // Not restricted: nothing to do.
    const open = run('0\n', { ROUGH_CUT_SANDBOX_DRY_RUN: '1' });
    assert.equal(open.status, 0);
    assert.equal(open.stdout, '');
    // Restricted: the rule is for this folder's exact binary and only allows user namespaces.
    const dry = run('1\n', { ROUGH_CUT_SANDBOX_DRY_RUN: '1' });
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, new RegExp(`profile rough-cut-portable "${join(directory, 'electron').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}" flags=\\(unconfined\\)`));
    assert.match(dry.stdout, /\n {2}userns,\n/);
    // Restricted with no way to ask or authorise (no display, no terminal): refuses to start.
    const refused = run('1\n');
    assert.equal(refused.status, 65);
    assert.match(refused.stderr, /cannot start without its protection/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('launcher installs missing ffmpeg/ffprobe/xdotool/xinput itself, never fatally', () => {
  const helper = readFileSync(new URL('./linux/ensure-deps.sh', import.meta.url), 'utf8');
  assert.match(packager, /ensure-deps\.sh\\" \|\| true/);
  assert.match(packager, /scripts\/linux\/ensure-deps\.sh/);
  for (const tool of ['ffmpeg', 'ffprobe', 'xdotool', 'xinput']) assert.match(helper, new RegExp(tool));
  for (const manager of ['apt-get', 'dnf', 'pacman', 'zypper', 'pkexec', 'sudo']) assert.match(helper, new RegExp(manager));
  assert.match(helper, /ROUGH_CUT_DEP_DRY_RUN/);
});
