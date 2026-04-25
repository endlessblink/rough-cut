// Cursor sync regression guard — companion to the TASK-197 pre-capture test.
//
// Static-source check on `recording-session-manager.mjs`. Asserts the wiring
// that prevents the recorded cursor track from desyncing from the playback
// timeline (the original symptom: clicks visible in the recorded video but
// the cursor sprite drawn elsewhere — see plans/glowing-wobbling-axolotl.md).
//
// The fix relies on three invariants in this file:
//
//   1. `cursorRecorder.start(...)` is called with the project's timeline fps
//      (`currentTimelineFps`), NEVER `TARGET_CAPTURE_FPS`. Mixing those two
//      is what reintroduces the 60-vs-30 unit mismatch.
//   2. The `RECORDING_SET_TIMELINE_FPS` IPC handler exists and updates
//      `currentTimelineFps`. Without it the renderer can't push the project
//      frameRate to the main process.
//   3. The `PANEL_SAVE_RECORDING` handler overrides `metadata.timelineFps`
//      and `metadata.cursorEventsFps` with the value the session actually
//      used. The panel hardcodes `timelineFps: 30`; if we trust it blindly
//      a 60fps project's duration math is wrong and the asset doesn't carry
//      the cursor cadence the loader needs to rescale correctly.
//
// Brittle by design — same rationale as the TASK-197 guard. If you rename a
// referenced symbol, update this test alongside the source change in the
// same commit.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, 'recording-session-manager.mjs');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');
const LINES = SOURCE.split('\n');

function findCallSites(needle) {
  const matches = [];
  for (let i = 0; i < LINES.length; i++) {
    if (LINES[i].includes(needle)) matches.push({ line: i + 1, text: LINES[i] });
  }
  return matches;
}

test('cursor sync: cursorRecorder.start uses project timeline fps, not TARGET_CAPTURE_FPS', () => {
  // Find every call to cursorRecorder.start( and inspect the first few lines
  // following each one. The first positional argument is the fps. Whitelist
  // any variable name that includes "Timeline" or "currentTimeline"; flag
  // any literal use of TARGET_CAPTURE_FPS in those windows.
  const startCalls = [];
  for (let i = 0; i < LINES.length; i++) {
    if (/cursorRecorder\.start\s*\(/.test(LINES[i])) {
      startCalls.push(i);
    }
  }

  assert.ok(
    startCalls.length > 0,
    'expected at least one cursorRecorder.start( callsite — has the recorder been removed?',
  );

  for (const lineIdx of startCalls) {
    // Look at the call line + the 5 lines BEFORE it (where the fps argument
    // is often computed into a local variable like `const cursorFps = ...`).
    const window = LINES.slice(Math.max(0, lineIdx - 5), lineIdx + 1).join('\n');
    const usesTimelineVar = /currentTimelineFps|cursorFps\s*=\s*currentTimelineFps/.test(window);
    const usesCaptureFps = /TARGET_CAPTURE_FPS/.test(window);

    assert.ok(
      usesTimelineVar,
      `recording-session-manager.mjs:${lineIdx + 1} — cursorRecorder.start() must derive its fps ` +
        `from currentTimelineFps. The 5-line window before the call did not reference it. ` +
        `Without this the cursor sidecar is sampled at a different cadence than the playback ` +
        `transport indexes it (cursor-sync regression).`,
    );

    assert.ok(
      !usesCaptureFps,
      `recording-session-manager.mjs:${lineIdx + 1} — cursorRecorder.start() callsite references ` +
        `TARGET_CAPTURE_FPS in its argument context. Pass currentTimelineFps instead — the cursor ` +
        `recorder must run at the project's timeline cadence so cursor[playheadFrame] is a direct lookup.`,
    );
  }
});

test('cursor sync: RECORDING_SET_TIMELINE_FPS handler exists and assigns currentTimelineFps', () => {
  const handlerHits = findCallSites('RECORDING_SET_TIMELINE_FPS');
  assert.ok(
    handlerHits.length >= 1,
    'expected RECORDING_SET_TIMELINE_FPS to be referenced in recording-session-manager.mjs ' +
      '(the main process needs the renderer to publish the project frameRate).',
  );

  // Find the handler block and ensure it assigns currentTimelineFps.
  const handlerStart = LINES.findIndex((line) =>
    /ipcMain\.on\s*\(\s*IPC_CHANNELS\.RECORDING_SET_TIMELINE_FPS/.test(line),
  );
  assert.notEqual(
    handlerStart,
    -1,
    'expected an ipcMain.on(IPC_CHANNELS.RECORDING_SET_TIMELINE_FPS, ...) handler.',
  );

  // Walk forward up to 15 lines looking for an assignment to currentTimelineFps.
  const body = LINES.slice(handlerStart, handlerStart + 15).join('\n');
  assert.match(
    body,
    /currentTimelineFps\s*=/,
    `RECORDING_SET_TIMELINE_FPS handler at line ${handlerStart + 1} must assign currentTimelineFps. ` +
      `Without the assignment the published value never reaches cursorRecorder.start().`,
  );
});

test('cursor sync: startFfmpegCapture call wires onFirstFrame -> cursorRecorder.setStartTime', () => {
  // The FFmpeg first-frame anchor (derived from `-progress pipe:1`) is the
  // only signal that pins cursor[0] to the actual file frame 0 on Linux/X11.
  // Without this wiring the cursor sidecar would re-anchor to MediaRecorder
  // start (later than first frame), reproducing the constant cursor lag.
  // Find a startFfmpegCapture( callsite that's not the import line.
  const startCalls = LINES.map((line, idx) => ({ line, idx }))
    .filter(({ line }) => /startFfmpegCapture\s*\(/.test(line) && !/^\s*import|from\s+['"]/.test(line));
  assert.ok(startCalls.length > 0, 'expected a startFfmpegCapture( invocation.');
  const matchedAny = startCalls.some(({ idx }) => {
    const body = LINES.slice(idx, idx + 40).join('\n');
    return /onFirstFrame\s*:[\s\S]{0,500}cursorRecorder\.setStartTime\s*\(/.test(body);
  });
  assert.ok(
    matchedAny,
    'startFfmpegCapture must pass onFirstFrame that calls cursorRecorder.setStartTime() — ' +
      'this is the FFmpeg first-frame cursor anchor.',
  );
});

test('cursor sync: MediaRecorder rebase is gated off when FFmpeg path is active', () => {
  // The PANEL_MEDIA_RECORDER_STARTED handler must NOT rebase the cursor
  // recorder when FFmpeg is the actual screen recorder, because MediaRecorder
  // start fires later than FFmpeg's first frame and would shove cursor[0]
  // past the real anchor.
  const handlerLine = LINES.findIndex((line) =>
    /ipcMain\.on\s*\(\s*IPC_CHANNELS\.PANEL_MEDIA_RECORDER_STARTED/.test(line),
  );
  assert.notEqual(handlerLine, -1, 'expected PANEL_MEDIA_RECORDER_STARTED handler.');
  const body = LINES.slice(handlerLine, handlerLine + 15).join('\n');
  assert.match(
    body,
    /isFfmpegCaptureAvailable\s*\(\s*\)/,
    'PANEL_MEDIA_RECORDER_STARTED handler must check isFfmpegCaptureAvailable() so the ' +
      'MediaRecorder rebase is skipped when FFmpeg is the played-back source.',
  );
});

test('cursor sync: PANEL_SAVE_RECORDING overrides metadata.timelineFps and cursorEventsFps', () => {
  // The handler is split across multiple lines (`ipcMain.handle(\n  IPC_CHANNELS.PANEL_SAVE_RECORDING,\n  ...`).
  // Anchor on the channel reference and verify it sits inside an ipcMain.handle invocation.
  const channelLine = LINES.findIndex((line) =>
    /IPC_CHANNELS\.PANEL_SAVE_RECORDING\b/.test(line) && !/^\s*\/\//.test(line),
  );
  assert.notEqual(
    channelLine,
    -1,
    'expected an IPC_CHANNELS.PANEL_SAVE_RECORDING reference (handler binding).',
  );

  // Confirm the previous non-blank line opened ipcMain.handle so we know this
  // is the handler binding, not just a doc reference.
  let prev = channelLine - 1;
  while (prev >= 0 && LINES[prev].trim() === '') prev--;
  assert.match(
    LINES[prev] ?? '',
    /ipcMain\.handle\s*\(/,
    `expected ipcMain.handle( opening immediately before line ${channelLine + 1}.`,
  );

  // The override must happen before saveRecording* is called (otherwise the
  // panel's hardcoded timelineFps:30 wins). Walk forward a generous window.
  const body = LINES.slice(channelLine, channelLine + 60).join('\n');

  assert.match(
    body,
    /metadata[\s\S]{0,400}timelineFps\s*:\s*currentTimelineFps/,
    'PANEL_SAVE_RECORDING handler must overwrite metadata.timelineFps with currentTimelineFps. ' +
      'Without this the asset duration is computed at the panel-hardcoded fps and the cursor ' +
      'lookup desyncs (cursor-sync regression).',
  );

  assert.match(
    body,
    /cursorEventsFps\s*:\s*currentTimelineFps/,
    'PANEL_SAVE_RECORDING handler must set metadata.cursorEventsFps = currentTimelineFps so the ' +
      'asset carries the cursor sample rate. The renderer loader needs this to rescale correctly ' +
      'when project fps != event fps.',
  );
});

test('cursor sync: captureMetadata in the recovery marker carries currentTimelineFps', () => {
  // The recovery marker lets the app reattach to a crashed session and finish
  // saving the recording. If the marker advertises the wrong timelineFps, a
  // recovered session writes the wrong asset.duration on disk.
  const captureMetaIdx = LINES.findIndex((line) => /captureMetadata\s*:\s*\{/.test(line));
  assert.notEqual(captureMetaIdx, -1, 'expected a captureMetadata: { ... } block.');

  const block = LINES.slice(captureMetaIdx, captureMetaIdx + 12).join('\n');
  assert.match(
    block,
    /timelineFps\s*:\s*currentTimelineFps/,
    'captureMetadata.timelineFps must be currentTimelineFps (not TARGET_CAPTURE_FPS).',
  );
  assert.match(
    block,
    /cursorEventsFps\s*:\s*currentTimelineFps/,
    'captureMetadata.cursorEventsFps must be currentTimelineFps so a recovered save writes the ' +
      'asset metadata field the loader reads.',
  );
});
