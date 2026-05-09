#!/usr/bin/env node
// Smoke for TASK-088 (Lane B / Don't lose user data) — exercises the recovery
// flow end-to-end with real ffmpeg + ffprobe instead of mocks. Simulates a
// crashed recording by leaving an .mkv on disk plus a recovery marker, then
// calls recoverFromMarker against the real remux + assertReadableMp4 +
// saveProjectForRecording chain. Asserts a .roughcut project lands on disk
// and the marker is cleared.
//
// Run with: node scripts/smoke-recovery.mjs
// Exits 0 on success, throws otherwise.

import { mkdtemp, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recoverFromMarker, getRecoveryState } from '../apps/desktop/src/main/recording-recovery.mjs';
import { remuxMkvToMp4 } from '../apps/desktop/src/main/remux-service.mjs';
import { assertReadableMp4 } from '../apps/desktop/src/main/media-probe.mjs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-smoke-'));
const rawPath = join(root, 'rough-cut-recovered.mkv');
const outputPath = join(root, 'rough-cut-recovered.mp4');
const markerPath = join(root, 'recording-recovery.json');

// Simulate a recording that was killed mid-write: a small but valid .mkv left
// behind. Using libx264 in a 2-second matroska container — same shape as a
// real ffmpeg-capture leaves.
const ffmpegResult = spawnSync('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', 'testsrc=size=320x240:rate=30',
  '-t', '2',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  rawPath,
], { stdio: ['ignore', 'ignore', 'pipe'] });
if (ffmpegResult.status !== 0) {
  throw new Error(`Failed to synthesize fixture .mkv: ${ffmpegResult.stderr?.toString().slice(-500)}`);
}

await writeFile(markerPath, JSON.stringify({
  version: 1,
  startedAt: new Date().toISOString(),
  rawPath,
  outputPath,
  width: 320,
  height: 240,
  fps: 30,
  display: ':0+0,0',
  captureRegion: null,
  cursorTelemetryPath: join(root, 'rough-cut-recovered.cursor.json'),
  systemAudioSource: null,
}, null, 2), 'utf8');

const state = await getRecoveryState({ markerPath });
if (!state.available) throw new Error('Pre-recover: recovery state should be available with a real fixture in place.');

const result = await recoverFromMarker({
  markerPath,
  remuxMkvToMp4,
  assertReadableMp4,
  saveProjectForRecording,
  formatProject: (project) => project,
  onLog: () => undefined,
});

if (result.state !== 'recovered') throw new Error(`Expected state=recovered, got ${result.state}`);
if (!result.project?.path?.endsWith('.roughcut')) throw new Error(`Expected .roughcut project, got ${result.project?.path}`);
if (!existsSync(result.project.path)) throw new Error(`Recovered project file missing on disk: ${result.project.path}`);
if (existsSync(markerPath)) throw new Error('Marker should be cleared after a successful recovery.');
if (!existsSync(outputPath)) throw new Error(`Remuxed MP4 missing: ${outputPath}`);

const mp4Stat = await stat(outputPath);
if (mp4Stat.size <= 0) throw new Error(`Remuxed MP4 is empty: ${outputPath}`);

console.info(JSON.stringify({
  ok: true,
  root,
  rawPath,
  outputPath,
  projectPath: result.project.path,
  markerCleared: !existsSync(markerPath),
  remuxBytes: mp4Stat.size,
  remuxWarnings: result.remuxWarnings,
}, null, 2));
