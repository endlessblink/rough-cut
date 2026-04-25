// TASK-197 regression guard.
//
// Static-source test for `recording-session-manager.mjs`. Asserts the three
// invariants that prevent Rough Cut UI from baking into Linux/X11 captures:
//
//   1. No `new Notification(...)` followed by `.show()` inside the IS_LINUX
//      branch around start-recording. (The Linux notification daemon renders
//      popups inside the x11grab capture rect.)
//   2. The first `mainWindow.hide()` line precedes the first
//      `startFfmpegCapture(` line. (Otherwise the first frames capture the
//      still-visible UI.)
//   3. A call to `suspendNotificationsForRecording` exists before the first
//      `startFfmpegCapture(` line. (Catches notifications from other apps.)
//
// Brittle by design — this is a guard against a regression that already
// happened once (commit 4881fd8 silently dropped TASK-197's fix). Reading the
// source text is the cheapest reliable check.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, 'recording-session-manager.mjs');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');
const LINES = SOURCE.split('\n');

function findLine(predicate) {
  for (let i = 0; i < LINES.length; i++) {
    if (predicate(LINES[i], i)) return i + 1;
  }
  return -1;
}

function findAllLines(predicate) {
  const matches = [];
  for (let i = 0; i < LINES.length; i++) {
    if (predicate(LINES[i], i)) matches.push(i + 1);
  }
  return matches;
}

test('TASK-197: no new Notification(...).show() in start-recording flow', () => {
  // Find the start of the IS_LINUX branch in the start-recording flow. We
  // anchor on the comment string so we don't false-match if other code paths
  // add Notifications elsewhere (e.g. the recovery flow). If the anchor moves,
  // update both the test and the source comment together.
  const newNotifLines = findAllLines(
    (line) => /\bnew\s+Notification\s*\(/.test(line) && !/\/\//.test(line.trim()),
  );

  for (const lineNum of newNotifLines) {
    // Walk forward up to 10 lines — if we find `.show()` close by, that's a
    // visible OS notification during recording. Forbidden on Linux.
    const slice = LINES.slice(lineNum - 1, lineNum + 9).join('\n');
    if (/\.show\s*\(/.test(slice)) {
      assert.fail(
        `recording-session-manager.mjs:${lineNum} creates a Notification and calls .show() within 10 lines. ` +
          `On Linux this gets baked into x11grab captures (TASK-197). Remove the Notification or guard it ` +
          `with an explicit non-Linux check.`,
      );
    }
  }
});

test('TASK-197: mainWindow.hide() runs before startFfmpegCapture(', () => {
  const firstHide = findLine((line) => /mainWindow\.hide\s*\(\s*\)/.test(line));
  const firstStart = findLine((line) => /startFfmpegCapture\s*\(/.test(line) && !/^\s*import/.test(line));

  assert.notEqual(firstHide, -1, 'expected at least one mainWindow.hide() call in source');
  assert.notEqual(firstStart, -1, 'expected at least one startFfmpegCapture() call in source');
  assert.ok(
    firstHide < firstStart,
    `mainWindow.hide() at line ${firstHide} must precede startFfmpegCapture() at line ${firstStart}. ` +
      `If hide() runs after capture starts, the first frames bake the UI into the take (TASK-197).`,
  );
});

test('TASK-197: suspendNotificationsForRecording runs before startFfmpegCapture(', () => {
  const suspendCall = findLine(
    (line) => /\bsuspendNotificationsForRecording\s*\(/.test(line) && !/^\s*(async\s+)?function/.test(line),
  );
  const firstStart = findLine(
    (line) => /startFfmpegCapture\s*\(/.test(line) && !/^\s*import/.test(line),
  );

  assert.notEqual(
    suspendCall,
    -1,
    'expected suspendNotificationsForRecording() to be called somewhere in the start-recording flow (TASK-197).',
  );
  assert.ok(
    suspendCall < firstStart,
    `suspendNotificationsForRecording() at line ${suspendCall} must run before startFfmpegCapture() at line ${firstStart}.`,
  );
});

test('TASK-197: resumeNotificationsAfterRecording runs in transitionToIdle', () => {
  const resumeCall = findLine(
    (line) => /\bresumeNotificationsAfterRecording\s*\(/.test(line) && !/^\s*(async\s+)?function/.test(line),
  );

  assert.notEqual(
    resumeCall,
    -1,
    'expected resumeNotificationsAfterRecording() to be called from transitionToIdle (TASK-197). ' +
      'Without this, the suspend leaks across sessions.',
  );
});

test('recording shutdown stops capture resources even when already stopping', () => {
  const alreadyStoppingBranch = SOURCE.match(
    /if \(state === 'recording'\) \{[\s\S]*?await stopActiveCaptureResources\(\);[\s\S]*?\} else \{([\s\S]*?)\n\s*\}/,
  );

  assert.ok(
    alreadyStoppingBranch,
    'expected requestSessionShutdown() to handle both recording and already-stopping states.',
  );
  assert.match(
    alreadyStoppingBranch[1],
    /await stopActiveCaptureResources\(\)/,
    'when state is already stopping, shutdown must still stop FFmpeg/cursor capture before fallback import. ' +
      'Otherwise panel reload/HMR during stop can complete without importing the take.',
  );
  assert.match(
    SOURCE,
    /let captureResourcesStopped = false;/,
    'stopActiveCaptureResources() should be guarded so duplicate stop requests remain safe.',
  );
});
