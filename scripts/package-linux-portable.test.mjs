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
