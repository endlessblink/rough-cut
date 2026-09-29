import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalizeProjectDocument, createAsset, createProject } from '@rough-cut/project-model';

import { addGraphic } from '../shared/motion-graphics.mjs';
import { buildGraphicsOverlayArgs, graphicFramePattern, planGraphicsOverlay } from './graphics-export.mjs';

function projectWithGraphics() {
  let doc = canonicalizeProjectDocument(createProject({ assets: [createAsset('recording', '/tmp/s.mp4', { duration: 300 })] }));
  doc = addGraphic(doc, { id: 'late', html: '<div>late</div>', startFrame: 280, endFrame: 400 });
  doc = addGraphic(doc, { id: 'early', html: '<div>early</div>', startFrame: 30, endFrame: 90 });
  return doc;
}

test('the plan keeps layer order and clips graphics to the exported length', () => {
  const plan = planGraphicsOverlay({ document: projectWithGraphics(), fps: 30, durationFrames: 300 });
  assert.deepEqual(plan.map((item) => [item.id, item.startFrame, item.frameCount]), [['late', 280, 20], ['early', 30, 60]]);
});

test('a project without graphics plans nothing, so export is untouched', () => {
  const doc = canonicalizeProjectDocument(createProject());
  assert.deepEqual(planGraphicsOverlay({ document: doc, fps: 30, durationFrames: 300 }), []);
});

test('each graphic is shifted to its start and overlaid once, audio copied', () => {
  const args = buildGraphicsOverlayArgs({
    inputPath: 'in.mp4',
    outputPath: 'out.mp4',
    framesRoot: '/w',
    fps: 30,
    items: [{ id: 'a', startFrame: 30, frameCount: 10 }, { id: 'b:2', startFrame: 0, frameCount: 5 }],
  });
  const graph = args[args.indexOf('-filter_complex') + 1];
  assert.match(graph, /\[1:v\]format=rgba,setpts=PTS-STARTPTS\+1\.000000\/TB\[g1\]/);
  assert.equal((graph.match(/overlay=/g) ?? []).length, 2);
  assert.ok(args.includes('/w/b_2/%06d.png'));
  assert.deepEqual(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 2), ['-c:a', 'copy']);
  assert.equal(args.at(-1), 'out.mp4');
});

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function pixelAt(videoPath, seconds, x, y) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(seconds), '-i', videoPath, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1024 });
  return [...result.stdout];
}

test('the overlay really lands only inside the graphic\'s time range (real ffmpeg)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'graphics-overlay-'));
  const base = join(dir, 'base.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=30:d=3', '-pix_fmt', 'yuv420p', base]);
  // A 1 s transparent PNG sequence with an opaque white box in the top-left corner.
  const framesDir = join(dir, 'g');
  mkdirSync(framesDir);
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=white@1.0:s=40x40:r=30:d=1,format=rgba', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=160x90:r=30:d=1,format=rgba',
    '-filter_complex', '[1:v][0:v]overlay=0:0:format=auto,format=rgba', '-start_number', '0', join(framesDir, '%06d.png')]);
  const out = join(dir, 'out.mp4');
  const args = buildGraphicsOverlayArgs({ inputPath: base, outputPath: out, framesRoot: dir, fps: 30, items: [{ id: 'g', startFrame: 30, frameCount: 30 }] });
  const run = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);

  const before = pixelAt(out, 0.5, 10, 10);
  const during = pixelAt(out, 1.5, 10, 10);
  const after = pixelAt(out, 2.5, 10, 10);
  const outside = pixelAt(out, 1.5, 120, 70);
  assert.ok(before.every((c) => c < 40), `before start stays black: ${before}`);
  assert.ok(during.every((c) => c > 200), `inside the range the graphic shows: ${during}`);
  assert.ok(after.every((c) => c < 40), `after the end stays black: ${after}`);
  assert.ok(outside.every((c) => c < 40), `transparent areas show the video: ${outside}`);
  assert.ok(graphicFramePattern(dir, 'g').endsWith('/g/%06d.png'));
});
