/**
 * Peak-memory proof for multi-segment styled exports.
 *
 * The old graph fanned one decoded input into parallel `trim` branches feeding `concat`.
 * ffmpeg has no cross-branch backpressure, so the branches that concat is not yet draining
 * queue every frame handed to them. Measured 2026-08-01 on a 33-minute project: one render
 * passed 63GB and left a 78GB machine with 2GB available.
 *
 * This renders a project whose segments are deliberately spread across the whole source —
 * the shape that maximises buffering — and samples the live ffmpeg's RSS throughout.
 *
 *   node scripts/verify-segment-export-memory.mjs [--module <path-to-export-service.mjs>]
 *
 * --module lets the same measurement run against an older copy of the export service, so
 * the before/after numbers come from one harness rather than two.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SOURCE_SECONDS = 60;
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
// Spread across the whole source and out of order, exactly like the project that died.
const SEGMENTS = [
  { timelineIn: 0, timelineOut: 60, sourceIn: 30, sourceOut: 90 },
  { timelineIn: 60, timelineOut: 360, sourceIn: 900, sourceOut: 1200 },
  { timelineIn: 360, timelineOut: 660, sourceIn: 1500, sourceOut: 1800 },
];
const PEAK_BUDGET_GB = 4;

function moduleArg() {
  const index = process.argv.indexOf('--module');
  return index === -1 ? new URL('../apps/desktop/src/main/export-service.mjs', import.meta.url).pathname
    : process.argv[index + 1];
}

async function ffmpegPids() {
  try {
    const { stdout } = await run('pgrep', ['-x', 'ffmpeg']);
    return stdout.trim().split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

async function rssGb(pid) {
  try {
    const { readFile } = await import('node:fs/promises');
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/VmRSS:\s+(\d+) kB/);
    return match ? Number(match[1]) / 1024 / 1024 : 0;
  } catch {
    return 0;
  }
}

async function main() {
  const modulePath = moduleArg();
  const { exportProjectToMp4, EXPORT_MODES } = await import(modulePath);
  const { createAsset, createClip, createProject, createTrack } =
    await import('../packages/project-model/dist/index.js');

  const root = await mkdtemp(join(tmpdir(), 'segment-export-memory-'));
  let peak = 0;
  let samples = 0;

  try {
    const mediaPath = join(root, 'recording.mp4');
    console.log(`rendering a ${SOURCE_SECONDS}s ${WIDTH}x${HEIGHT} source...`);
    await run('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `testsrc=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=${SOURCE_SECONDS}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${SOURCE_SECONDS}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-shortest', mediaPath,
    ], { maxBuffer: 1 << 26 });

    const totalFrames = SOURCE_SECONDS * FPS;
    const asset = createAsset('recording', mediaPath, {
      duration: totalFrames,
      metadata: { width: WIDTH, height: HEIGHT, fps: FPS },
    });
    const track = createTrack('video', { name: 'Screen Recording', index: 0 });
    const clips = SEGMENTS.map((segment) => createClip(asset.id, track.id, {
      timelineIn: segment.timelineIn,
      timelineOut: segment.timelineOut,
      sourceIn: segment.sourceIn,
      sourceOut: segment.sourceOut,
    }));
    const timelineFrames = SEGMENTS.at(-1).timelineOut;
    const project = createProject({
      id: 'segment-memory-check',
      name: 'Segment memory check',
      assets: [asset],
      composition: { duration: timelineFrames, tracks: [{ ...track, clips }], transitions: [] },
    });

    const outputPath = join(root, 'out.mp4');
    const sampler = setInterval(async () => {
      for (const pid of await ffmpegPids()) {
        const gb = await rssGb(pid);
        samples += 1;
        if (gb > peak) peak = gb;
      }
    }, 200);

    const started = Date.now();
    await exportProjectToMp4({ project, outputPath, mode: EXPORT_MODES.STYLED });
    clearInterval(sampler);

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`module:     ${modulePath}`);
    console.log(`segments:   ${SEGMENTS.length}, spread across ${SOURCE_SECONDS}s of source`);
    console.log(`took:       ${elapsed}s (${samples} RSS samples)`);
    console.log(`peak RSS:   ${peak.toFixed(2)} GB`);

    assert.ok(samples > 0, 'never sampled a live ffmpeg; measurement proves nothing');
    assert.ok(
      peak < PEAK_BUDGET_GB,
      `peak ${peak.toFixed(2)}GB exceeds the ${PEAK_BUDGET_GB}GB budget — branches are still buffering`,
    );
    console.log(`\nPASS: peak stayed under ${PEAK_BUDGET_GB}GB.`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\nFAIL: ${error?.message ?? error}`);
  process.exitCode = 1;
});
