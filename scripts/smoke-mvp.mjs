import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRecordingSession } from '../apps/desktop/src/main/recording/recording-session.mjs';
import { listPulseAudioMicSources, listPulseAudioSystemAudioSources } from '../apps/desktop/src/main/recording/audio-sources.mjs';
import { stopRecordingAndCreateProject } from '../apps/desktop/src/main/recording-stop-handler.mjs';
import { remuxMkvToMp4 } from '../apps/desktop/src/main/remux-service.mjs';
import { assertReadableMp4 } from '../apps/desktop/src/main/media-probe.mjs';
import { openProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';

const width = Number(process.env.ROUGH_CUT_SMOKE_WIDTH || 320);
const height = Number(process.env.ROUGH_CUT_SMOKE_HEIGHT || 240);
const durationMs = Number(process.env.ROUGH_CUT_SMOKE_DURATION_MS || 1600);
const display = process.env.ROUGH_CUT_SMOKE_DISPLAY || `${process.env.DISPLAY || ':0'}+0,0`;
const shouldRecordMic = process.env.ROUGH_CUT_SMOKE_MIC === '1';
const shouldRecordSystemAudio = process.env.ROUGH_CUT_SMOKE_SYSTEM_AUDIO === '1';
const captureRegion = process.env.ROUGH_CUT_SMOKE_REGION === '1'
  ? {
      mode: 'region',
      x: numberFromEnv('ROUGH_CUT_SMOKE_REGION_X', 0),
      y: numberFromEnv('ROUGH_CUT_SMOKE_REGION_Y', 0),
      width: numberFromEnv('ROUGH_CUT_SMOKE_REGION_WIDTH', Math.min(width, 320)),
      height: numberFromEnv('ROUGH_CUT_SMOKE_REGION_HEIGHT', Math.min(height, 240)),
    }
  : null;

await assertPrerequisites();

const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-smoke-'));
const micSource = shouldRecordMic ? await pickMicSource() : null;
const systemAudioSource = shouldRecordSystemAudio ? await pickSystemAudioSource() : null;
const session = createRecordingSession({
  recordingsDir: root,
  markerPath: join(root, 'recording-recovery.json'),
  getDisplayInfo: () => ({ display, width, height }),
  getCursorPoint: () => ({ x: Math.floor(width / 2), y: Math.floor(height / 2) }),
});

console.info(`[smoke:mvp] recording ${width}x${height} from ${display} for ${durationMs}ms${captureRegion ? ` region ${captureRegion.width}x${captureRegion.height}+${captureRegion.x},${captureRegion.y}` : ''}${micSource ? ` with mic ${micSource}` : ''}${systemAudioSource ? ` with system audio ${systemAudioSource}` : ''}`);

await session.start({ micSource, systemAudioSource, captureRegion });
await new Promise((resolve) => setTimeout(resolve, durationMs));

const stopped = await stopRecordingAndCreateProject({
  recordingSession: session,
  assertReadableMp4,
  remuxMkvToMp4,
  saveProjectForRecording,
  formatProject: (project) => project,
});

if (stopped.state !== 'saved' || !stopped.project) {
  throw new Error('Recording did not produce a saved project.');
}
if (!stopped.diagnosticsPath) {
  throw new Error('Recording did not produce a diagnostics report.');
}
const diagnostics = JSON.parse(await readFile(stopped.diagnosticsPath, 'utf8'));
if (diagnostics.status !== 'ok' || diagnostics.media?.hasVideo !== true || diagnostics.cursor?.totalEvents < 1) {
  throw new Error(`Recording diagnostics report failed smoke assertions: ${JSON.stringify(diagnostics)}`);
}

const reopened = await openProjectFile(stopped.project.path);
const cursorEvents = reopened.document.assets[0]?.metadata?.cursorEvents;
if (!Array.isArray(cursorEvents) || cursorEvents.length === 0) {
  throw new Error('Recording did not persist cursor telemetry.');
}
if (micSource) {
  if (reopened.document.assets[0]?.metadata?.audio?.micSource !== micSource) {
    throw new Error('Recording did not persist microphone metadata.');
  }
  assertAudioStream(stopped.outputPath);
}
if (systemAudioSource) {
  if (reopened.document.assets[0]?.metadata?.audio?.systemAudioSource !== systemAudioSource) {
    throw new Error('Recording did not persist system audio metadata.');
  }
  assertAudioStream(stopped.outputPath);
}
if (captureRegion) {
  const metadata = reopened.document.assets[0]?.metadata;
  if (metadata?.capture?.mode !== 'region') throw new Error('Recording did not persist capture region metadata.');
  if (metadata.width !== captureRegion.width || metadata.height !== captureRegion.height) {
    throw new Error(`Expected project dimensions ${captureRegion.width}x${captureRegion.height}; got ${metadata.width}x${metadata.height}.`);
  }
  assertVideoSize(stopped.outputPath, captureRegion.width, captureRegion.height);
}
const exportPath = join(root, 'export.mp4');
const exported = await exportProjectToMp4({ project: reopened.document, outputPath: exportPath });
await assertReadableMp4(exportPath);

console.info(
  JSON.stringify(
    {
      ok: true,
      root,
      projectPath: stopped.project.path,
      recordingPath: stopped.outputPath,
      diagnosticsPath: stopped.diagnosticsPath,
      micSource,
      systemAudioSource,
      captureRegion,
      cursorEvents: cursorEvents.length,
      exportPath: exported.outputPath,
      bytes: exported.bytes,
    },
    null,
    2,
  ),
);

async function assertPrerequisites() {
  if (!process.env.DISPLAY && !process.env.ROUGH_CUT_SMOKE_DISPLAY) {
    throw new Error('X11 DISPLAY is not set. Run this smoke test from an X11 session.');
  }

  assertCommand('ffmpeg');
  assertCommand('ffprobe');

  if (process.env.DISPLAY) {
    const result = spawnSync('xdpyinfo', { stdio: 'ignore' });
    if (result.error && result.error.code === 'ENOENT') return;
    if (result.status !== 0) {
      throw new Error(`Cannot access X11 display ${process.env.DISPLAY}.`);
    }
  }

  await access(process.cwd());
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

async function pickMicSource() {
  const sources = await listPulseAudioMicSources().catch((err) => {
    console.warn(`[smoke:mvp] skipping mic capture: ${err?.message ?? err}`);
    return [];
  });
  if (sources.length === 0) {
    console.warn('[smoke:mvp] skipping mic capture: no microphone sources found.');
    return null;
  }
  return sources[0].name;
}

async function pickSystemAudioSource() {
  const sources = await listPulseAudioSystemAudioSources().catch((err) => {
    console.warn(`[smoke:mvp] skipping system audio capture: ${err?.message ?? err}`);
    return [];
  });
  if (sources.length === 0) {
    console.warn('[smoke:mvp] skipping system audio capture: no monitor sources found.');
    return null;
  }
  return sources[0].name;
}

function assertAudioStream(path) {
  const result = spawnSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_type',
    '-of',
    'csv=p=0',
    path,
  ], { encoding: 'utf8' });
  if (result.status !== 0 || result.stdout.trim() !== 'audio') {
    throw new Error(`Expected an audio stream in ${path}.`);
  }
}

function assertVideoSize(path, width, height) {
  const result = spawnSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    path,
  ], { encoding: 'utf8' });
  if (result.status !== 0 || result.stdout.trim() !== `${width}x${height}`) {
    throw new Error(`Expected video size ${width}x${height} in ${path}; got ${result.stdout.trim() || 'unknown'}.`);
  }
}

function assertCommand(command) {
  const result = spawnSync(command, ['-version'], { stdio: 'ignore' });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${command} is required for the MVP smoke test.`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} is installed but failed to run.`);
  }
}
