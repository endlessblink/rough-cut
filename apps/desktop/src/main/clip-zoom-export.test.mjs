// Zooms on an added clip in the export, and sound-only files in "Add clip" (Noam 2026-10-21).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildClipZoomArgs, buildClipZoomCommands, prerenderZoomedClipSegments } from './clip-zoom-export.mjs';
import { classifyInsertPick, describeInsertableVideo } from './dev-media-service.mjs';

const marker = { id: 'z', kind: 'manual', startFrame: 30, endFrame: 90, strength: 1, focalPoint: { x: 0.5, y: 0.5 }, zoomInDuration: 18, zoomOutDuration: 18, followCursor: false };

test('zoom commands: whole picture before the zoom, a centred window in the hold, one line per change', () => {
  const { content, first } = buildClipZoomCommands({ markers: [marker], sourceIn: 0, frames: 90, fps: 30, width: 640, height: 360 });
  assert.deepEqual(first, { x: 0, y: 0, w: 640, h: 360 });
  const lines = content.trim().split('\n');
  assert.ok(lines.length < 60, 'held stretches are not repeated');
  const hold = lines.find((line) => line.includes('crop w 256'));
  assert.ok(hold, 'full zoom (x2.5) is a 256x144 window');
  assert.match(hold, /crop x 192, crop y 108;/, 'centred on the focal point');
  // A command sent with frame i-1 takes effect on frame i (sendcmd sits after the crop).
  assert.match(lines[0], /^1\.000000 /, 'the first change is sent with frame 30, the frame before the zoom moves');
});

test('zoom commands follow the part of the file the clip shows', () => {
  const trimmed = buildClipZoomCommands({ markers: [marker], sourceIn: 50, frames: 20, fps: 30, width: 640, height: 360 });
  assert.equal(trimmed.first.w, 256, 'a clip trimmed to start inside the hold starts zoomed');
});

test('the zoom pass crops then drives the crop, and keeps the file size', () => {
  const args = buildClipZoomArgs({ inputPath: '/in.mp4', outputPath: '/out.mp4', commandsPath: '/z.cmd', first: { x: 0, y: 0, w: 640, h: 360 }, sourceIn: 15, frames: 60, fps: 30, width: 640, height: 360 });
  const vf = args[args.indexOf('-vf') + 1];
  assert.ok(vf.indexOf('crop=') < vf.indexOf('sendcmd='), 'crop comes before sendcmd');
  assert.match(vf, /scale=640:360/);
  assert.equal(args[args.indexOf('-ss') + 1], '0.5');
  assert.equal(args[args.indexOf('-frames:v') + 1], '60');
});

test('only added clips with zooms are re-rendered; the recording and plain clips are untouched', async () => {
  const document = { assets: [
    { id: 'a', metadata: { insertedMedia: { kind: 'clip' }, clipZooms: [marker] } },
    { id: 'b', metadata: { insertedMedia: { kind: 'clip' } } },
  ] };
  const segments = [
    { timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30 },
    { timelineIn: 30, timelineOut: 120, sourceIn: 0, sourceOut: 90, inputPath: '/a.mp4', assetId: 'a' },
    { timelineIn: 120, timelineOut: 150, sourceIn: 0, sourceOut: 30, inputPath: '/b.mp4', assetId: 'b' },
  ];
  const calls = [];
  const result = await prerenderZoomedClipSegments({
    segments, document, fps: 30,
    probeSize: async () => ({ width: 640, height: 360 }),
    run: async (command, args) => { calls.push(args); return { code: 0 }; },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.segments[0], segments[0]);
  assert.equal(result.segments[2], segments[2]);
  assert.match(result.segments[1].inputPath, /zoom-0\.mp4$/);
  assert.deepEqual([result.segments[1].sourceIn, result.segments[1].sourceOut, result.segments[1].timelineIn], [0, 90, 30]);
  await result.cleanup();
});

test('sound files are accepted by Add clip and described without a picture', async () => {
  for (const name of ['a.mp3', 'b.WAV', 'c.m4a', 'd.flac', 'e.ogg', 'f.opus', 'g.aac']) assert.equal(classifyInsertPick(name), 'audio', name);
  assert.equal(classifyInsertPick('v.mp4'), 'video');
  assert.equal(classifyInsertPick('p.roughcut'), 'project');
  assert.equal(classifyInsertPick('x.txt'), null);
  const described = await describeInsertableVideo('/tone.mp3', { projectFps: 30, kind: 'audio', probe: async () => ({ durationSeconds: 2.5 }) });
  assert.equal(described.durationFrames, 75);
  assert.equal(described.hasAudio, true);
  assert.equal(described.width, null);
});
