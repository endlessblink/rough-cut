// Windows recording pipeline smoke. Runs the real recording session against the real desktop with real ffmpeg:
// capture -> stop -> remux to MP4 -> save project -> reopen -> raw export -> styled export, verifying each file.
// It does NOT judge cursor accuracy or audio devices (those are user-evidence checks in the gate); the cursor is synthetic.
//
//   node scripts/windows/smoke-windows-recording.mjs            3.5 s of a 640x360 corner of the primary display
//   ROUGH_CUT_WIN_SMOKE_MS=8000 ROUGH_CUT_WIN_SMOKE_STYLED=0 node ...
//
// Exit 0 and a final JSON line with "ok":true on success. Any failure exits 1 and names the phase.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecordingSession } from '../../apps/desktop/src/main/recording/recording-session.mjs';
import { createNoopButtonListener } from '../../apps/desktop/src/main/recording/noop-button-listener.mjs';
import { stopRecordingAndCreateProject } from '../../apps/desktop/src/main/recording-stop-handler.mjs';
import { remuxMkvToMp4 } from '../../apps/desktop/src/main/remux-service.mjs';
import { assertReadableMp4, computeSyncedRecordingTiming, probeVideoStreamsTiming, probeVideoTiming } from '../../apps/desktop/src/main/media-probe.mjs';
import { openProjectFile, saveProjectForRecording } from '../../apps/desktop/src/main/project-files.mjs';
import { EXPORT_MODES, exportProjectToMp4 } from '../../apps/desktop/src/main/export-service.mjs';

const width = Number(process.env.ROUGH_CUT_WIN_SMOKE_WIDTH ?? 640);
const height = Number(process.env.ROUGH_CUT_WIN_SMOKE_HEIGHT ?? 360);
const durationMs = Number(process.env.ROUGH_CUT_WIN_SMOKE_MS ?? 3500);
const runStyled = process.env.ROUGH_CUT_WIN_SMOKE_STYLED !== '0';
const keep = process.env.ROUGH_CUT_WIN_SMOKE_KEEP === '1';

let phase = 'init';
const setPhase = (name) => { phase = name; console.info(`[win-smoke] ${name}`); };
const fail = (message) => { throw new Error(message); };

if (process.platform !== 'win32') fail('This smoke is for Windows.');

const root = await mkdtemp(join(tmpdir(), 'rough-cut-win-smoke-'));
try {
  let t = 0;
  const session = createRecordingSession({
    recordingsDir: root,
    markerPath: join(root, 'recording-recovery.json'),
    getDisplayInfo: () => ({ display: 'desktop+0,0', width, height, originX: 0, originY: 0, scaleFactor: 1 }),
    // A point orbiting the middle of the capture, so cursor telemetry has motion without a human.
    getCursorPoint: () => {
      t += 1;
      return { x: Math.round(width / 2 + (width / 4) * Math.cos(t / 8)), y: Math.round(height / 2 + (height / 4) * Math.sin(t / 8)) };
    },
    buttonListenerFactory: createNoopButtonListener,
  });

  setPhase('start');
  await session.start({});
  setPhase('recording');
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  setPhase('stop-and-save');
  const stopped = await stopRecordingAndCreateProject({
    recordingSession: session,
    assertReadableMp4,
    remuxMkvToMp4,
    saveProjectForRecording,
    formatProject: (project) => project,
    probeVideoTiming,
    probeVideoStreamsTiming,
    computeSyncedRecordingTiming,
  });
  if (stopped.state !== 'saved' || !stopped.project) fail(`Recording did not save a project (state=${stopped.state}).`);

  setPhase('reopen');
  const reopened = await openProjectFile(stopped.project.path);
  const asset = reopened.document.assets[0];
  const cursorEvents = asset?.metadata?.cursorEvents;
  if (!Array.isArray(cursorEvents) || cursorEvents.length < 3) fail(`Expected cursor events from the session; got ${cursorEvents?.length ?? 0}.`);

  setPhase('raw-export');
  const rawPath = join(root, 'raw-export.mp4');
  await exportProjectToMp4({ project: reopened.document, outputPath: rawPath, mode: EXPORT_MODES.RAW });
  await assertReadableMp4(rawPath);

  let styledOk = null;
  if (runStyled) {
    setPhase('styled-export');
    const styledPath = join(root, 'styled-export.mp4');
    await exportProjectToMp4({ project: reopened.document, outputPath: styledPath, mode: EXPORT_MODES.STYLED });
    await assertReadableMp4(styledPath);
    styledOk = true;
  }

  console.info(JSON.stringify({ ok: true, root: keep ? root : '(removed)', recordingPath: stopped.outputPath, cursorEvents: cursorEvents.length, rawExport: true, styledExport: styledOk }));
} catch (error) {
  console.error(`[win-smoke] FAILED in phase "${phase}": ${error instanceof Error ? error.message : error}`);
  console.error(`[win-smoke] artifacts kept at ${root}`);
  process.exit(1);
}
if (!keep) await rm(root, { recursive: true, force: true });
process.exit(0);
