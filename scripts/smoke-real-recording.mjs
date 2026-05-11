import { readFileSync, statSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRecordingSession } from '../apps/desktop/src/main/recording/recording-session.mjs';
import { listPulseAudioSystemAudioSources } from '../apps/desktop/src/main/recording/audio-sources.mjs';
import { isXinputAvailable } from '../apps/desktop/src/main/recording/xinput-button-listener.mjs';
import { isXdotoolAvailable, readCursorViaXdotool } from '../apps/desktop/src/main/recording/xdotool-cursor.mjs';
import { stopRecordingAndCreateProject } from '../apps/desktop/src/main/recording-stop-handler.mjs';
import { remuxMkvToMp4 } from '../apps/desktop/src/main/remux-service.mjs';
import { assertReadableMp4, computeSyncedRecordingTiming, probeVideoStreamsTiming, probeVideoTiming } from '../apps/desktop/src/main/media-probe.mjs';
import { openProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { EXPORT_MODES, exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';

const width = numberFromEnv('ROUGH_CUT_REAL_SMOKE_WIDTH', 640);
const height = numberFromEnv('ROUGH_CUT_REAL_SMOKE_HEIGHT', 360);
const originX = integerFromEnv('ROUGH_CUT_REAL_SMOKE_X', 0);
const originY = integerFromEnv('ROUGH_CUT_REAL_SMOKE_Y', 0);
const durationMs = numberFromEnv('ROUGH_CUT_REAL_SMOKE_DURATION_MS', 3500);
const minDurationMs = numberFromEnv('ROUGH_CUT_REAL_SMOKE_MIN_DURATION_MS', 0);
const expectedFps = numberFromEnv('ROUGH_CUT_REAL_SMOKE_EXPECT_FPS', 0);
const expectAudio = process.env.ROUGH_CUT_REAL_SMOKE_EXPECT_AUDIO === '1';
const shouldRecordSystemAudio = process.env.ROUGH_CUT_REAL_SMOKE_SYSTEM_AUDIO === '1';
const cameraDevicePath = normalizeCameraDevicePath(process.env.ROUGH_CUT_REAL_SMOKE_CAMERA_DEVICE_PATH);
const displayName = process.env.DISPLAY || ':0';
const display = process.env.ROUGH_CUT_REAL_SMOKE_DISPLAY || `${displayName}${formatX11Offset(originX)},${originY}`;
const runUiSmoke = process.env.ROUGH_CUT_REAL_SMOKE_UI !== '0';
const runStyledExport = process.env.ROUGH_CUT_REAL_SMOKE_STYLED_EXPORT !== '0';
const expectButtonEventsOverride = process.env.ROUGH_CUT_REAL_SMOKE_EXPECT_BUTTON_EVENTS;
let currentPhase = 'init';
const artifacts = {};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.error(`[smoke:real-recording] interrupted signal=${signal} phase=${currentPhase} artifacts=${JSON.stringify(artifacts)}`);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

process.once('uncaughtException', (err) => {
  console.error(`[smoke:real-recording] failed phase=${currentPhase} artifacts=${JSON.stringify(artifacts)}`);
  throw err;
});
process.once('unhandledRejection', (reason) => {
  console.error(`[smoke:real-recording] failed phase=${currentPhase} artifacts=${JSON.stringify(artifacts)}`);
  throw reason;
});

setPhase('prerequisites');
await assertPrerequisites();

const root = await mkdtemp(join(tmpdir(), 'rough-cut-real-recording-smoke-'));
artifacts.root = root;
const session = createRecordingSession({
  recordingsDir: root,
  markerPath: join(root, 'recording-recovery.json'),
  getDisplayInfo: () => ({ display, width, height, originX, originY, scaleFactor: 1 }),
  getCursorPoint: readCursorViaXdotool,
});

const expectButtonEvents = expectButtonEventsOverride === '0' ? false : isXinputAvailable();
const systemAudioSource = shouldRecordSystemAudio ? await pickSystemAudioSource() : null;
console.info(`[smoke:real-recording] recording ${width}x${height} from ${display} for ${durationMs}ms${systemAudioSource ? ` with system audio ${systemAudioSource}` : ''}${cameraDevicePath ? ` with camera ${cameraDevicePath}` : ''}`);
console.info(`[smoke:real-recording] artifacts: ${root}`);

setPhase('recording-start');
await session.start({ systemAudioSource, cameraDevicePath });
setPhase('recording-active');
const recordingStartedAt = Date.now();
await wait(300);
performScriptedPointerActivity({ originX, originY, width, height });
await wait(Math.max(0, durationMs - (Date.now() - recordingStartedAt)));

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
artifacts.recordingPath = stopped.outputPath ?? null;
artifacts.projectPath = stopped.project?.path ?? null;
artifacts.diagnosticsPath = stopped.diagnosticsPath ?? null;

setPhase('assert-saved-recording');
if (stopped.state !== 'saved' || !stopped.project) {
  throw new Error('Real recording did not produce a saved project.');
}
if (!stopped.diagnosticsPath) {
  throw new Error('Real recording did not produce a diagnostics report.');
}
setPhase('assert-diagnostics');
const diagnostics = JSON.parse(readFileSync(stopped.diagnosticsPath, 'utf8'));
assertDiagnostics(diagnostics);

setPhase('reopen-project');
const reopened = await openProjectFile(stopped.project.path);
const recordingAsset = reopened.document.assets[0];
const cursorEvents = recordingAsset?.metadata?.cursorEvents;
if (!Array.isArray(cursorEvents) || cursorEvents.length < 3) {
  throw new Error(`Expected cursor telemetry from real recording; got ${cursorEvents?.length ?? 0}.`);
}
if (systemAudioSource && recordingAsset?.metadata?.audio?.systemAudioSource !== systemAudioSource) {
  throw new Error('Real recording did not persist system audio metadata.');
}
if (cameraDevicePath) {
  assertCameraLinked(reopened.document, cameraDevicePath);
}

const moveEvents = cursorEvents.filter((event) => event?.type === 'move');
const buttonEvents = cursorEvents.filter((event) => event?.type === 'down' || event?.type === 'up');
if (moveEvents.length < 3) {
  throw new Error(`Expected multiple cursor move events; got ${moveEvents.length}.`);
}
if (expectButtonEvents && buttonEvents.length < 2) {
  throw new Error(`Expected xinput button events from scripted click; got ${buttonEvents.length}.`);
}

const rawExportPath = join(root, 'real-recording-raw-export.mp4');
const styledExportPath = join(root, 'real-recording-styled-export.mp4');
if (!cameraDevicePath) artifacts.rawExportPath = rawExportPath;
if (runStyledExport) artifacts.styledExportPath = styledExportPath;
let rawExport = null;
if (!cameraDevicePath) {
  setPhase('raw-export');
  rawExport = await exportProjectToMp4({ project: reopened.document, outputPath: rawExportPath, mode: EXPORT_MODES.RAW });
  setPhase('raw-export-verify');
  await assertReadableMp4(rawExportPath);
}
let styledExport = null;
if (runStyledExport) {
  setPhase('styled-export');
  styledExport = await exportProjectToMp4({ project: reopened.document, outputPath: styledExportPath, mode: EXPORT_MODES.STYLED });
  setPhase('styled-export-verify');
  await assertReadableMp4(styledExportPath);
}

let uiReport = null;
if (runUiSmoke) {
  setPhase('ui-smoke');
  uiReport = runRendererSmoke({ root, projectPath: stopped.project.path });
}

setPhase('report');
console.info(
  JSON.stringify(
    {
      ok: true,
      root,
      display,
      projectPath: stopped.project.path,
      recordingPath: stopped.outputPath,
      diagnosticsPath: stopped.diagnosticsPath,
      cursorEvents: cursorEvents.length,
      moveEvents: moveEvents.length,
      buttonEvents: buttonEvents.length,
      buttonEventsExpected: expectButtonEvents,
      mediaDurationMs: diagnostics.recording?.mediaDurationMs ?? null,
      durationDeltaMs: diagnostics.recording?.durationDeltaMs ?? null,
      avgFrameRate: diagnostics.media?.video?.avgFrameRate ?? null,
      expectedAudio: expectAudio,
      hasAudio: diagnostics.media?.hasAudio ?? false,
      systemAudioSource,
      cameraDevicePath,
      rawExportPath: rawExport?.outputPath ?? null,
      styledExportPath: styledExport?.outputPath ?? null,
      uiReport,
    },
    null,
    2,
  ),
);
setPhase('complete');

function setPhase(phase) {
  currentPhase = phase;
  console.info(`[smoke:real-recording] phase=${phase} artifacts=${JSON.stringify(artifacts)}`);
}

function assertCameraLinked(document, expectedDevicePath) {
  const recordingAsset = document.assets.find((asset) => asset.type === 'recording');
  const cameraAsset = document.assets.find((asset) => asset.type === 'video' && asset.metadata?.isCamera === true);
  if (!recordingAsset?.cameraAssetId) {
    throw new Error('Real recording did not persist cameraAssetId metadata.');
  }
  if (!cameraAsset) {
    throw new Error('Real recording did not create a linked camera asset.');
  }
  if (recordingAsset.cameraAssetId !== cameraAsset.id) {
    throw new Error('Real recording cameraAssetId does not point at the linked camera asset.');
  }
  if (cameraAsset.metadata?.devicePath !== expectedDevicePath) {
    throw new Error(`Real recording did not persist camera device path; expected ${expectedDevicePath}, got ${cameraAsset.metadata?.devicePath ?? 'missing'}.`);
  }
}

function normalizeCameraDevicePath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (!/^\/dev\/video\d+$/u.test(trimmed)) {
    throw new Error(`Invalid ROUGH_CUT_REAL_SMOKE_CAMERA_DEVICE_PATH: ${trimmed}`);
  }
  return trimmed;
}

function assertDiagnostics(diagnostics) {
  if (diagnostics.status !== 'ok' || diagnostics.media?.hasVideo !== true || diagnostics.cursor?.totalEvents < 3) {
    throw new Error(`Real recording diagnostics report failed smoke assertions: ${JSON.stringify(diagnostics)}`);
  }

  if (minDurationMs > 0) {
    const mediaDurationMs = diagnostics.recording?.mediaDurationMs;
    if (!Number.isFinite(mediaDurationMs) || mediaDurationMs < minDurationMs) {
      throw new Error(`Expected media duration >= ${minDurationMs}ms; got ${mediaDurationMs ?? 'unknown'}ms.`);
    }
  }

  if (expectedFps > 0) {
    const actualFps = frameRateFromString(diagnostics.media?.video?.avgFrameRate);
    if (!Number.isFinite(actualFps) || Math.abs(actualFps - expectedFps) > 1) {
      throw new Error(`Expected video fps near ${expectedFps}; got ${diagnostics.media?.video?.avgFrameRate ?? 'unknown'}.`);
    }
  }

  if (expectAudio && diagnostics.media?.hasAudio !== true) {
    throw new Error('Expected an audio stream but diagnostics reported none.');
  }
}

function frameRateFromString(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const [numerator, denominator = '1'] = value.split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

async function pickSystemAudioSource() {
  const sources = await listPulseAudioSystemAudioSources().catch((err) => {
    console.warn(`[smoke:real-recording] skipping system audio capture: ${err?.message ?? err}`);
    return [];
  });
  if (sources.length === 0) {
    console.warn('[smoke:real-recording] skipping system audio capture: no monitor sources found.');
    return null;
  }
  return sources[0].name;
}

function performScriptedPointerActivity({ originX, originY, width, height }) {
  const points = [
    [Math.round(originX + width * 0.2), Math.round(originY + height * 0.35)],
    [Math.round(originX + width * 0.55), Math.round(originY + height * 0.5)],
    [Math.round(originX + width * 0.78), Math.round(originY + height * 0.72)],
  ];
  run('xdotool', ['mousemove', '--sync', String(points[0][0]), String(points[0][1])]);
  run('xdotool', ['mousemove', '--sync', String(points[1][0]), String(points[1][1])]);
  run('xdotool', ['click', '1']);
  run('xdotool', ['mousemove', '--sync', String(points[2][0]), String(points[2][1])]);
  run('xdotool', ['mousedown', '1']);
  run('xdotool', ['mousemove', '--sync', String(points[0][0]), String(points[0][1])]);
  run('xdotool', ['mouseup', '1']);
}

function runRendererSmoke({ root, projectPath }) {
  const electron = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
  const exportPath = join(root, 'real-recording-ui-export.mp4');
  const resultPath = join(root, 'real-recording-ui-smoke-result.json');
  const screenshotPath = join(root, 'real-recording-ui-smoke.png');
  const result = spawnSync(electron, ['--no-sandbox', '--force-color-profile=srgb', '.'], {
    cwd: join(process.cwd(), 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
      ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
      ROUGH_CUT_UI_SMOKE_RESULT_PATH: resultPath,
      ROUGH_CUT_UI_SMOKE_SCREENSHOT_PATH: screenshotPath,
    },
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Real recording UI smoke failed with exit code ${result.status}. Artifacts: ${root}`);
  const report = JSON.parse(readFileSync(resultPath, 'utf8'));
  const screenshotBytes = statSync(screenshotPath).size;
  if (!report.ok || !report.hasPlaybackButton || !report.hasExportResult || !report.hasStyledPreviewCanvas || !(screenshotBytes > 1000)) {
    throw new Error(`Real recording UI smoke assertions failed: ${JSON.stringify(report)}`);
  }
  return { ...report, exportPath, screenshotPath, screenshotBytes };
}

async function assertPrerequisites() {
  if (!process.env.DISPLAY && !process.env.ROUGH_CUT_REAL_SMOKE_DISPLAY) {
    throw new Error('X11 DISPLAY is not set. Run this smoke test from an X11 session.');
  }
  assertCommand('ffmpeg', ['-version']);
  assertCommand('ffprobe', ['-version']);
  if (!isXdotoolAvailable()) throw new Error('xdotool is required for real-recording smoke.');
  if (!isXinputAvailable()) {
    console.warn('[smoke:real-recording] xinput is unavailable; click telemetry assertion will be skipped.');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function assertCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  if (result.error?.code === 'ENOENT') throw new Error(`${command} is required for real-recording smoke.`);
  if (result.status !== 0) throw new Error(`${command} is installed but failed to run.`);
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function integerFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

function formatX11Offset(value) {
  return value >= 0 ? `+${value}` : String(value);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
