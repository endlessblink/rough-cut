/**
 * End-to-end proof that a styled program render is single-flight, with real ffmpeg.
 *
 * The unit tests stub the exporter, so they prove the guard logic but not that the
 * guard actually holds around a real render. This drives the real `freecut-host`
 * against the real `export-service` and counts live ffmpeg processes while nine
 * concurrent requests — the burst a <video> element makes — are in flight.
 *
 * Before the fix that burst produced nine full 1080p renders of one clip. The pass
 * condition here is that it never produces more than one at a time.
 *
 *   node scripts/verify-styled-export-single-flight.mjs
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createAsset, createClip, createProject, createTrack } from '../packages/project-model/dist/index.js';
import { createFreecutHost } from '../apps/desktop/src/main/freecut-host.mjs';
import { saveProjectFile } from '../apps/desktop/src/main/project-files.mjs';

const run = promisify(execFile);
const REQUESTS = 9;
const CLIP_SECONDS = 3;
const FPS = 30;

async function countFfmpeg() {
  try {
    const { stdout } = await run('pgrep', ['-c', '-x', 'ffmpeg']);
    return Number(stdout.trim()) || 0;
  } catch {
    return 0; // pgrep exits non-zero when nothing matches
  }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'styled-single-flight-'));
  let peak = 0;
  let samples = 0;

  try {
    // A real, tiny 1080p recording so the styled path does actual encoding work.
    const mediaPath = join(root, 'recording.mp4');
    await run('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `testsrc=size=1920x1080:rate=${FPS}:duration=${CLIP_SECONDS}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:duration=${CLIP_SECONDS}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-shortest', mediaPath,
    ]);

    const frames = CLIP_SECONDS * FPS;
    const asset = createAsset('recording', mediaPath, {
      duration: frames,
      metadata: { width: 1920, height: 1080, fps: FPS },
    });
    const track = createTrack('video', { name: 'Screen Recording', index: 0 });
    const clip = createClip(asset.id, track.id, {
      timelineIn: 0, timelineOut: frames, sourceIn: 0, sourceOut: frames,
    });
    const document = createProject({
      id: 'single-flight-check',
      name: 'Single flight check',
      assets: [asset],
      composition: { duration: frames, tracks: [{ ...track, clips: [clip] }], transitions: [] },
    });
    const projectPath = join(root, 'check.roughcut');
    await saveProjectFile(projectPath, document);

    // Baseline, so unrelated ffmpeg elsewhere on the box cannot be blamed on us.
    const baseline = await countFfmpeg();

    const host = createFreecutHost({ recordingsDir: root, allowedRoots: [root] });
    host.registerProjectPath(projectPath);

    const sampler = setInterval(async () => {
      const live = Math.max(0, (await countFfmpeg()) - baseline);
      samples += 1;
      if (live > peak) peak = live;
    }, 100);

    const programAssetId = `${asset.id}__program`;
    const beforeExport = await stat(mediaPath).catch(() => null);
    console.log(`source present at export time: ${Boolean(beforeExport)} (${beforeExport?.size ?? 0} bytes)`);
    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: REQUESTS }, () => host.resolveMedia(document.id, programAssetId)),
    );
    clearInterval(sampler);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    if (process.env.ROUGH_CUT_DEBUG_RESULTS) {
      console.log('asked for assetId:', programAssetId);
      console.log('first result     :', JSON.stringify(results[0]));
      const snapshot = await host.getSnapshot();
      console.log('snapshot media   :', JSON.stringify(snapshot.projects[0]?.media?.map((m) => m.id)));
    }
    const produced = results.filter((result) => result?.path);
    const paths = new Set(produced.map((result) => result.path));

    console.log(`requests:        ${REQUESTS}`);
    console.log(`took:            ${elapsed}s (${samples} samples of live ffmpeg)`);
    console.log(`peak concurrent: ${peak} ffmpeg`);
    console.log(`callers served:  ${produced.length}/${REQUESTS}, ${paths.size} distinct output(s)`);

    assert.ok(produced.length > 0, 'no caller received a rendered program');
    assert.equal(paths.size, 1, 'callers disagreed about the output path');
    assert.ok((await stat([...paths][0])).size > 0, 'rendered program is empty');
    assert.ok(peak <= 1, `expected at most 1 concurrent ffmpeg, saw ${peak}`);
    assert.ok(samples > 0, 'sampler never ran; the render finished too fast to prove anything');

    console.log('\nPASS: nine concurrent requests produced a single render.');
  } finally {
    if (process.env.ROUGH_CUT_KEEP_FIXTURE) console.log(`fixture kept at ${root}`);
    else await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\nFAIL: ${error?.message ?? error}`);
  process.exitCode = 1;
});
