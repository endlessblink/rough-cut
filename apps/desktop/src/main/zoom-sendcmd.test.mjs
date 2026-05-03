import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZoomSendcmd } from './zoom-sendcmd.mjs';

function marker(overrides = {}) {
  return {
    id: 'test-marker',
    startFrame: 30,
    endFrame: 90,
    kind: 'manual',
    strength: 1,
    focalPoint: { x: 0.5, y: 0.5 },
    zoomInDuration: 9,
    zoomOutDuration: 9,
    ...overrides,
  };
}

test('buildZoomSendcmd returns no fragment when markers is empty', () => {
  const result = buildZoomSendcmd({
    markers: [],
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 60,
  });
  assert.equal(result.filterFragment, null);
  assert.equal(result.sendcmdContent, '');
  assert.equal(result.present, false);
  assert.equal(result.initialCrop, null);
});

test('buildZoomSendcmd throws on invalid source dimensions / fps / totalFrames', () => {
  assert.throws(() => buildZoomSendcmd({ markers: [marker()], sourceWidth: 0, sourceHeight: 720, fps: 30, totalFrames: 60 }));
  assert.throws(() => buildZoomSendcmd({ markers: [marker()], sourceWidth: 1280, sourceHeight: 720, fps: 0, totalFrames: 60 }));
  assert.throws(() => buildZoomSendcmd({ markers: [marker()], sourceWidth: 1280, sourceHeight: 720, fps: 30, totalFrames: 0 }));
});

test('single static marker emits one sendcmd line per frame with timestamps in seconds', () => {
  const result = buildZoomSendcmd({
    markers: [marker()],
    cursorEvents: [],
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 120,
  });
  assert.equal(result.present, true);
  // 120 frames -> 120 lines (no trailing blank line beyond a single \n).
  const lines = result.sendcmdContent.trim().split('\n');
  assert.equal(lines.length, 120);
  // First entry at t=0.000000, last at t=119/30.
  assert.match(lines[0], /^0\.000000 crop x /);
  assert.match(lines[119], /^3\.966667 crop x /);
});

test('initial crop on a frame-0 outside-marker frame covers the full source', () => {
  // Marker starts at frame 30, so frame 0 has scale=1 and the crop covers
  // the entire source.
  const result = buildZoomSendcmd({
    markers: [marker({ startFrame: 30, endFrame: 90 })],
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 120,
  });
  assert.equal(result.initialCrop.x, 0);
  assert.equal(result.initialCrop.y, 0);
  assert.equal(result.initialCrop.w, 1280);
  assert.equal(result.initialCrop.h, 720);
  assert.match(result.filterFragment, /^crop=w=1280:h=720:x=0:y=0$/);
});

test('hold-phase crop window is centered on the focal point at full zoom', () => {
  const result = buildZoomSendcmd({
    markers: [marker({ startFrame: 0, endFrame: 60, focalPoint: { x: 0.5, y: 0.5 } })],
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 60,
  });
  // Hold phase begins at zoomInDuration=9 frames from startFrame=0; check
  // a frame deep in the hold window. At scale=2.5 (strength=1) and focal
  // (0.5, 0.5), crop window is centered: x=0.3*1280=384, y=0.3*720=216,
  // w=512, h=288.
  const lines = result.sendcmdContent.trim().split('\n');
  // Frame 30 -> timestamp 1.000000. Find that line.
  const targetLine = lines.find((line) => line.startsWith('1 crop x ') || line.startsWith('1.000000 crop x '));
  assert.ok(targetLine, 'expected a sendcmd line at frame 30 / t=1s');
  assert.match(targetLine, /crop x 384/);
  assert.match(targetLine, /crop y 216/);
  assert.match(targetLine, /crop w 512/);
  assert.match(targetLine, /crop h 288/);
});

test('cursor-following auto marker pans the crop window during the hold phase', () => {
  // Engine uses a "leashed" follow: focal only shifts when cursor strays
  // beyond ~0.128 normalized units (visibleWidth * (0.5 - followPadding))
  // from the marker's focal. Cursor sweeps from x=200 to x=1100 — far
  // enough on both ends to drag the focal during the hold.
  const cursorEvents = [];
  for (let frame = 0; frame <= 60; frame += 1) {
    const t = frame / 60;
    cursorEvents.push({
      frame,
      timeMs: Math.round((frame / 30) * 1000),
      x: 200 + 900 * t,
      y: 360,
      type: 'move',
      button: 0,
    });
  }
  const result = buildZoomSendcmd({
    markers: [
      marker({
        kind: 'auto',
        startFrame: 0,
        endFrame: 60,
        focalPoint: { x: 0.5, y: 0.5 },
      }),
    ],
    cursorEvents,
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 60,
  });

  // Frames 12 and 36 are both deep inside the hold phase. With cursor-follow
  // on an auto marker, the focal pans with the cursor → crop x must differ.
  const lines = result.sendcmdContent.trim().split('\n');
  const xMatch = (line) => /crop x ([\-0-9.]+)/.exec(line);
  const xAt12 = Number(xMatch(lines[12])[1]);
  const xAt36 = Number(xMatch(lines[36])[1]);
  assert.notEqual(xAt12, xAt36, 'crop x should change between two hold-phase frames when an auto marker follows the cursor');
});

test('manual markers do not follow cursor (engine design: respect user-picked focal)', () => {
  // Same cursor sweep as above, but with a manual marker. Engine intentionally
  // skips cursor-follow for manual markers — user picked the focal, honor it.
  const cursorEvents = [];
  for (let frame = 0; frame <= 60; frame += 1) {
    const t = frame / 60;
    cursorEvents.push({
      frame,
      timeMs: Math.round((frame / 30) * 1000),
      x: 640 + 120 * t,
      y: 360 + 70 * t,
      type: 'move',
      button: 0,
    });
  }
  const result = buildZoomSendcmd({
    markers: [
      marker({
        kind: 'manual',
        startFrame: 0,
        endFrame: 60,
        focalPoint: { x: 0.5, y: 0.5 },
      }),
    ],
    cursorEvents,
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 60,
  });

  const lines = result.sendcmdContent.trim().split('\n');
  const xMatch = (line) => /crop x ([\-0-9.]+)/.exec(line);
  const xAt12 = Number(xMatch(lines[12])[1]);
  const xAt36 = Number(xMatch(lines[36])[1]);
  assert.equal(xAt12, xAt36, 'manual markers must not follow the cursor; focal stays at user-picked position');
});

test('disabled followCursor produces a static crop window even with cursor data', () => {
  const cursorEvents = [
    { frame: 0, timeMs: 0, x: 100, y: 100, type: 'move', button: 0 },
    { frame: 60, timeMs: 2000, x: 1100, y: 600, type: 'move', button: 0 },
  ];
  const result = buildZoomSendcmd({
    markers: [marker({ startFrame: 0, endFrame: 60, focalPoint: { x: 0.5, y: 0.5 } })],
    cursorEvents,
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 60,
    presentationOptions: { followCursor: false },
  });
  const lines = result.sendcmdContent.trim().split('\n');
  const xs = new Set();
  for (let i = 12; i < 48; i += 1) {
    const match = /crop x ([\-0-9.]+)/.exec(lines[i]);
    if (match) xs.add(match[1]);
  }
  // During hold (full zoom, static focal), x should be a single value.
  assert.equal(xs.size, 1);
});

test('emitted sendcmd content ends with a newline and has no leading blank line', () => {
  const result = buildZoomSendcmd({
    markers: [marker()],
    sourceWidth: 1280,
    sourceHeight: 720,
    fps: 30,
    totalFrames: 30,
  });
  assert.match(result.sendcmdContent, /^[0-9]/);
  assert.match(result.sendcmdContent, /\n$/);
});
