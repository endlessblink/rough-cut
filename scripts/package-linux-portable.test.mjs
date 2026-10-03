import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('release artifact never bakes a machine-specific sandbox symlink; launcher falls back when the system blocks the sandbox', () => {
  assert.match(packager, /ROUGH_CUT_RELEASE_ARTIFACT/);
  assert.match(packager, /apparmor_restrict_unprivileged_userns/);
  assert.match(packager, /--no-sandbox/);
});
