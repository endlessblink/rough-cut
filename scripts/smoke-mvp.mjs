import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRecordingSession } from '../apps/desktop/src/main/recording/recording-session.mjs';
import { stopRecordingAndCreateProject } from '../apps/desktop/src/main/recording-stop-handler.mjs';
import { remuxMkvToMp4 } from '../apps/desktop/src/main/remux-service.mjs';
import { assertReadableMp4 } from '../apps/desktop/src/main/media-probe.mjs';
import { openProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { exportProjectToMp4 } from '../apps/desktop/src/main/export-service.mjs';

const width = Number(process.env.ROUGH_CUT_SMOKE_WIDTH || 320);
const height = Number(process.env.ROUGH_CUT_SMOKE_HEIGHT || 240);
const durationMs = Number(process.env.ROUGH_CUT_SMOKE_DURATION_MS || 1600);
const display = process.env.ROUGH_CUT_SMOKE_DISPLAY || `${process.env.DISPLAY || ':0'}+0,0`;

await assertPrerequisites();

const root = await mkdtemp(join(tmpdir(), 'rough-cut-mvp-smoke-'));
const session = createRecordingSession({
  recordingsDir: root,
  markerPath: join(root, 'recording-recovery.json'),
  getDisplayInfo: () => ({ display, width, height }),
});

console.info(`[smoke:mvp] recording ${width}x${height} from ${display} for ${durationMs}ms`);

await session.start();
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

const reopened = await openProjectFile(stopped.project.path);
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

function assertCommand(command) {
  const result = spawnSync(command, ['-version'], { stdio: 'ignore' });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${command} is required for the MVP smoke test.`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} is installed but failed to run.`);
  }
}
