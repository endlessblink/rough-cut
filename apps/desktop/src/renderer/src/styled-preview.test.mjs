import test from 'node:test';
import assert from 'node:assert/strict';
import { activeClickEmphasisAtFrame, cameraCoversSourceTime, clampedCameraTime, coverSourceRect, cursorAtFrame, cursorAtTimeMs, cursorForResizeHandle, decideTimelineVideoSync, drawClickEmphasis, drawCursorPath, frameResizeHandles, getCursorBoundsStatus, moveRectFromPointer, resizeHandleAtPoint, resizeRectFromPointer } from './styled-preview.mjs';

test('cursorAtFrame returns null for empty events', () => {
  assert.equal(cursorAtFrame([], 0), null);
  assert.equal(cursorAtFrame(undefined, 0), null);
  assert.equal(cursorAtFrame(null, 0), null);
});

test('cursorAtFrame returns null when currentFrame is non-finite', () => {
  assert.equal(cursorAtFrame([{ frame: 0, x: 100, y: 200 }], Number.NaN), null);
});

test('cursorAtFrame returns the only event for a single-event array', () => {
  const events = [{ frame: 30, x: 640, y: 360 }];
  assert.deepEqual(cursorAtFrame(events, 0), { x: 640, y: 360 });
  assert.deepEqual(cursorAtFrame(events, 30), { x: 640, y: 360 });
  assert.deepEqual(cursorAtFrame(events, 9999), { x: 640, y: 360 });
});

test('cursorAtFrame returns the first event for frames before the first', () => {
  const events = [
    { frame: 10, x: 100, y: 200 },
    { frame: 50, x: 500, y: 600 },
  ];
  assert.deepEqual(cursorAtFrame(events, 5), { x: 100, y: 200 });
  assert.deepEqual(cursorAtFrame(events, 10), { x: 100, y: 200 });
});

test('cursorAtFrame returns the last event for frames after the last', () => {
  const events = [
    { frame: 10, x: 100, y: 200 },
    { frame: 50, x: 500, y: 600 },
  ];
  assert.deepEqual(cursorAtFrame(events, 50), { x: 500, y: 600 });
  assert.deepEqual(cursorAtFrame(events, 999), { x: 500, y: 600 });
});

test('cursorAtFrame interpolates linearly between bracketing events', () => {
  const events = [
    { frame: 10, x: 100, y: 200 },
    { frame: 50, x: 500, y: 600 },
  ];
  // Halfway between the two events: linear interpolation of 100→500 and 200→600.
  assert.deepEqual(cursorAtFrame(events, 30), { x: 300, y: 400 });
  // Quarter of the way through.
  assert.deepEqual(cursorAtFrame(events, 20), { x: 200, y: 300 });
});

test('cursorAtFrame interpolates across off-screen positions (multi-monitor)', () => {
  // Cursor sweeps from on-screen to off-screen and back; interpolation must
  // pass through off-screen values without clamping.
  const events = [
    { frame: 0, x: 1900, y: 500 },
    { frame: 30, x: 2400, y: 500 },
    { frame: 60, x: 1800, y: 500 },
  ];
  assert.deepEqual(cursorAtFrame(events, 15), { x: 2150, y: 500 });
  assert.deepEqual(cursorAtFrame(events, 30), { x: 2400, y: 500 });
  assert.deepEqual(cursorAtFrame(events, 45), { x: 2100, y: 500 });
});

test('cursorAtFrame sorts events that arrive out of order', () => {
  const events = [
    { frame: 50, x: 500, y: 600 },
    { frame: 10, x: 100, y: 200 },
  ];
  assert.deepEqual(cursorAtFrame(events, 30), { x: 300, y: 400 });
});

test('cursorAtFrame skips events with non-finite or non-move types', () => {
  const events = [
    { frame: 10, x: 100, y: 200, type: 'move' },
    { frame: 30, x: Number.NaN, y: 400, type: 'move' },
    { frame: 50, x: 500, y: 600, type: 'down' },
    { frame: 70, x: 700, y: 800, type: 'move' },
  ];
  // Only frame 10 and 70 are valid move events. Frame 40 should interpolate
  // between them: 100 + (700-100)*(40-10)/(70-10) = 100 + 300 = 400. y similar.
  assert.deepEqual(cursorAtFrame(events, 40), { x: 400, y: 500 });
});

test('cursorAtTimeMs prefers telemetry time over frame numbers', () => {
  const events = [
    { frame: 0, timeMs: 0, x: 100, y: 200, type: 'move' },
    { frame: 60, timeMs: 1000, x: 500, y: 600, type: 'move' },
  ];

  assert.deepEqual(cursorAtTimeMs(events, 500, 24), { x: 300, y: 400 });
});

test('cursorAtTimeMs falls back to frame timing when timeMs is missing', () => {
  const events = [
    { frame: 0, x: 100, y: 200, type: 'move' },
    { frame: 30, x: 500, y: 600, type: 'move' },
  ];

  assert.deepEqual(cursorAtTimeMs(events, 500, 30), { x: 300, y: 400 });
});

test('getCursorBoundsStatus reports offscreen side without clamping', () => {
  assert.deepEqual(getCursorBoundsStatus({ x: 1311, y: 484 }, 1920, 1080), { inside: true, side: 'inside', distance: 0 });
  assert.deepEqual(getCursorBoundsStatus({ x: 2524, y: 178 }, 1920, 1080), { inside: false, side: 'right', distance: 604 });
  assert.deepEqual(getCursorBoundsStatus({ x: 200, y: -48 }, 1920, 1080), { inside: false, side: 'top', distance: 48 });
});

test('drawCursorPath issues canvas operations at the given anchor', () => {
  const calls = [];
  const ctx = {
    beginPath: () => calls.push(['beginPath']),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push(['closePath']),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    set fillStyle(value) {
      calls.push(['fillStyle', value]);
    },
    set strokeStyle(value) {
      calls.push(['strokeStyle', value]);
    },
    set lineWidth(value) {
      calls.push(['lineWidth', value]);
    },
  };

  drawCursorPath(ctx, 100, 200);

  // Find the polygon ops starting with moveTo at the anchor.
  const moveToIdx = calls.findIndex((c) => c[0] === 'moveTo' && c[1] === 100 && c[2] === 200);
  assert.ok(moveToIdx >= 0, 'moveTo at anchor present');
  // Polygon vertices anchored at (100, 200): m 0 0 l 0 26 l 7 20 l 12 33 l 18 31 l 13 19 l 24 19
  assert.deepEqual(calls[moveToIdx + 1], ['lineTo', 100, 226]);
  assert.deepEqual(calls[moveToIdx + 2], ['lineTo', 107, 220]);
  assert.deepEqual(calls[moveToIdx + 3], ['lineTo', 112, 233]);
  assert.deepEqual(calls[moveToIdx + 4], ['lineTo', 118, 231]);
  assert.deepEqual(calls[moveToIdx + 5], ['lineTo', 113, 219]);
  assert.deepEqual(calls[moveToIdx + 6], ['lineTo', 124, 219]);
  assert.deepEqual(calls[moveToIdx + 7], ['closePath']);
  assert.ok(calls.some((c) => c[0] === 'fill'));
  assert.ok(calls.some((c) => c[0] === 'stroke'));
});

test('drawCursorPath scales the polygon by sizePercent', () => {
  const calls = [];
  const ctx = {
    beginPath: () => calls.push(['beginPath']),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push(['closePath']),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    set fillStyle(_value) {},
    set strokeStyle(_value) {},
    set lineWidth(_value) {},
  };

  drawCursorPath(ctx, 0, 0, { style: 'default', sizePercent: 150 });

  // Last polygon vertex (24, 19) at scale 1.5 should land at (36, 28.5).
  const lastLineTo = [...calls].reverse().find((c) => c[0] === 'lineTo');
  assert.deepEqual(lastLineTo, ['lineTo', 36, 28.5]);
});

test('drawCursorPath spotlight style draws a glow halo before the cursor', () => {
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']),
    moveTo: (x, y) => calls.push(['moveTo', x, y]),
    lineTo: (x, y) => calls.push(['lineTo', x, y]),
    closePath: () => calls.push(['closePath']),
    arc: (x, y, r) => calls.push(['arc', x, y, r]),
    fill: () => calls.push(['fill']),
    stroke: () => calls.push(['stroke']),
    set fillStyle(_value) {},
    set strokeStyle(_value) {},
    set lineWidth(_value) {},
    set globalAlpha(_value) {},
  };

  drawCursorPath(ctx, 50, 50, { style: 'spotlight', sizePercent: 100 });

  const glow = calls.find((c) => c[0] === 'arc');
  assert.ok(glow, 'spotlight halo draws an arc');
  const cursorMoveTo = calls.find((c) => c[0] === 'moveTo' && c[1] === 50 && c[2] === 50);
  assert.ok(cursorMoveTo, 'cursor polygon still drawn after halo');
});

test('activeClickEmphasisAtFrame returns fading click rings during the click window', () => {
  const events = [{ frame: 30, x: 320, y: 180, type: 'down', button: 0 }];

  assert.deepEqual(activeClickEmphasisAtFrame(events, 29), []);
  const rings = activeClickEmphasisAtFrame(events, 36);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].x, 320);
  assert.equal(rings[0].y, 180);
  assert.equal(rings[0].progress, 0.5);
  assert(rings[0].radius > 14);
  assert(rings[0].alpha < 0.72);
  assert.deepEqual(activeClickEmphasisAtFrame(events, 43), []);
});

test('drawClickEmphasis issues circle stroke operations for active clicks', () => {
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']),
    arc: (x, y, radius) => calls.push(['arc', x, y, radius]),
    stroke: () => calls.push(['stroke']),
    set globalAlpha(value) {
      calls.push(['globalAlpha', value]);
    },
    set strokeStyle(value) {
      calls.push(['strokeStyle', value]);
    },
    set lineWidth(value) {
      calls.push(['lineWidth', value]);
    },
  };

  drawClickEmphasis(ctx, [{ frame: 10, x: 100, y: 200, type: 'down' }], 10);

  assert.deepEqual(calls[0], ['save']);
  assert(calls.some((call) => call[0] === 'arc' && call[1] === 100 && call[2] === 200));
  assert(calls.some((call) => call[0] === 'stroke'));
});

test('drawClickEmphasis is a no-op when clickEffect is none', () => {
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']),
    arc: (x, y, radius) => calls.push(['arc', x, y, radius]),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    set globalAlpha(_value) {},
    set strokeStyle(_value) {},
    set fillStyle(_value) {},
    set lineWidth(_value) {},
  };

  drawClickEmphasis(ctx, [{ frame: 10, x: 100, y: 200, type: 'down' }], 10, 'none');

  assert.equal(calls.length, 0);
});

test('drawClickEmphasis ripple effect fills instead of stroking', () => {
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    beginPath: () => calls.push(['beginPath']),
    arc: (x, y, radius) => calls.push(['arc', x, y, radius]),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    set globalAlpha(_value) {},
    set strokeStyle(_value) {},
    set fillStyle(_value) {},
    set lineWidth(_value) {},
  };

  drawClickEmphasis(ctx, [{ frame: 10, x: 100, y: 200, type: 'down' }], 10, 'ripple');

  assert.ok(calls.some((c) => c[0] === 'fill'));
  assert.ok(!calls.some((c) => c[0] === 'stroke'));
});

test('coverSourceRect crops wide camera sources instead of stretching to square', () => {
  assert.deepEqual(coverSourceRect(1280, 720, 180, 180), {
    sx: 280,
    sy: 0,
    sw: 720,
    sh: 720,
  });
});

test('coverSourceRect crops tall camera sources instead of stretching to square', () => {
  assert.deepEqual(coverSourceRect(720, 1280, 180, 180), {
    sx: 0,
    sy: 280,
    sw: 720,
    sh: 720,
  });
});

test('coverSourceRect returns null for invalid dimensions', () => {
  assert.equal(coverSourceRect(0, 720, 180, 180), null);
  assert.equal(coverSourceRect(1280, 720, 0, 180), null);
});

test('clampedCameraTime keeps camera seeks inside the loaded media duration', () => {
  assert.equal(clampedCameraTime(1, 0.5, 4, 30), 1.5);
  assert.equal(clampedCameraTime(2.3, 2.5, 4.4, 30), 4.4 - 1 / 30);
  assert.equal(clampedCameraTime(1, 0.5, Number.NaN, 30), 1.5);
});

test('cameraCoversSourceTime returns false once the camera tail is exhausted', () => {
  assert.equal(cameraCoversSourceTime(1, 2.5, 4.4, 30), true);
  assert.equal(cameraCoversSourceTime(2.3, 2.5, 4.4, 30), false);
  assert.equal(cameraCoversSourceTime(2.3, 2.5, Number.NaN, 30), true);
});

test('frame resize handles cover every corner and edge midpoint', () => {
  const handles = frameResizeHandles({ x: 100, y: 50, w: 400, h: 200 });

  assert.deepEqual(handles.map((handle) => handle.handle), ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
  assert.deepEqual(handles.find((handle) => handle.handle === 'nw'), { handle: 'nw', x: 100, y: 50 });
  assert.deepEqual(handles.find((handle) => handle.handle === 'n'), { handle: 'n', x: 300, y: 50 });
  assert.deepEqual(handles.find((handle) => handle.handle === 'e'), { handle: 'e', x: 500, y: 150 });
  assert.deepEqual(handles.find((handle) => handle.handle === 'se'), { handle: 'se', x: 500, y: 250 });
});

test('resizeHandleAtPoint resolves nearest handle and cursor shape', () => {
  const rect = { x: 100, y: 50, w: 400, h: 200 };

  assert.equal(resizeHandleAtPoint(100, 50, rect), 'nw');
  assert.equal(resizeHandleAtPoint(300, 50, rect), 'n');
  assert.equal(resizeHandleAtPoint(500, 150, rect), 'e');
  assert.equal(resizeHandleAtPoint(500, 250, rect), 'se');
  assert.equal(resizeHandleAtPoint(340, 150, rect), null);
  assert.equal(cursorForResizeHandle('n'), 'ns-resize');
  assert.equal(cursorForResizeHandle('e'), 'ew-resize');
  assert.equal(cursorForResizeHandle('ne'), 'nesw-resize');
  assert.equal(cursorForResizeHandle('se'), 'nwse-resize');
});

test('moveRectFromPointer preserves size and clamps inside canvas', () => {
  const origin = { offsetX: 20, offsetY: 30, width: 400, height: 200 };

  assert.deepEqual(moveRectFromPointer(origin, 420, 230, 1000, 500), { x: 0.4, y: 0.4, w: 0.4, h: 0.4 });
  assert.deepEqual(moveRectFromPointer(origin, 9999, 9999, 1000, 500), { x: 0.6, y: 0.6, w: 0.4, h: 0.4 });
  assert.deepEqual(moveRectFromPointer(origin, -9999, -9999, 1000, 500), { x: 0, y: 0, w: 0.4, h: 0.4 });
});

test('resizeRectFromPointer preserves aspect ratio for all handles', () => {
  const base = { pointerId: 1, mode: 'resize', offsetX: 0, offsetY: 0, startX: 200, startY: 100, width: 400, height: 200, aspect: 2 };
  const cases = [
    ['nw', 100, 0],
    ['n', 400, 50],
    ['ne', 700, 0],
    ['e', 700, 200],
    ['se', 700, 400],
    ['s', 400, 400],
    ['sw', 100, 400],
    ['w', 100, 200],
  ];

  for (const [handle, x, y] of cases) {
    const resized = resizeRectFromPointer({ ...base, handle }, x, y, 1000, 500);
    assert.equal(Number((resized.w / resized.h).toFixed(6)), 1);
    assert(resized.x >= 0 && resized.y >= 0, `${handle} should stay within top-left bounds`);
    assert(resized.x + resized.w <= 1.000001, `${handle} should stay within right bounds`);
    assert(resized.y + resized.h <= 1.000001, `${handle} should stay within bottom bounds`);
  }
});

test('resizeRectFromPointer anchors opposite side for edge and corner handles', () => {
  const base = { pointerId: 1, mode: 'resize', offsetX: 0, offsetY: 0, startX: 200, startY: 100, width: 400, height: 200, aspect: 2 };

  assert.deepEqual(resizeRectFromPointer({ ...base, handle: 'se' }, 700, 400, 1000, 500), { x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  assert.deepEqual(resizeRectFromPointer({ ...base, handle: 'nw' }, 100, 0, 1000, 500), { x: 0, y: 0, w: 0.6, h: 0.6 });
  assert.deepEqual(resizeRectFromPointer({ ...base, handle: 'n' }, 400, 50, 1000, 500), { x: 0.15, y: 0.1, w: 0.5, h: 0.5 });
  assert.deepEqual(resizeRectFromPointer({ ...base, handle: 'e' }, 700, 200, 1000, 500), { x: 0.2, y: 0.15, w: 0.5, h: 0.5 });
});

test('resizeRectFromPointer clamps oversized and undersized resizes', () => {
  const base = { pointerId: 1, mode: 'resize', offsetX: 0, offsetY: 0, startX: 200, startY: 100, width: 400, height: 200, aspect: 2 };

  assert.deepEqual(resizeRectFromPointer({ ...base, handle: 'se' }, 9999, 9999, 1000, 500), { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
  assert.deepEqual(resizeRectFromPointer({ ...base, handle: 'se' }, 201, 101, 1000, 500), { x: 0.2, y: 0.2, w: 0.05, h: 0.05 });
});

// --- decideTimelineVideoSync: timeline playback drift correction ---
// Regression guard for the smooth-playback fix: playing forward through one
// clip nudges playbackRate instead of hard-seeking (the seek-stepping froze
// frames then jumped, which zoom magnified into stutter).

test('decideTimelineVideoSync: small drift within deadband holds the canonical rate', () => {
  const d = decideTimelineVideoSync({ drift: 0.01, playing: true, contiguous: true, baseRate: 1, fps: 30 });
  assert.deepEqual(d, { action: 'rate', playbackRate: 1 });
});

test('decideTimelineVideoSync: video ahead nudges playbackRate down (slow to let clock catch up)', () => {
  const d = decideTimelineVideoSync({ drift: 0.05, playing: true, contiguous: true, baseRate: 1, fps: 30 });
  assert.equal(d.action, 'rate');
  assert.ok(d.playbackRate < 1 && d.playbackRate >= 0.9, `expected slowdown, got ${d.playbackRate}`);
  assert.ok(Math.abs(d.playbackRate - 0.95) < 1e-9);
});

test('decideTimelineVideoSync: video behind nudges playbackRate up (speed up to catch the clock)', () => {
  const d = decideTimelineVideoSync({ drift: -0.05, playing: true, contiguous: true, baseRate: 1, fps: 30 });
  assert.equal(d.action, 'rate');
  assert.ok(Math.abs(d.playbackRate - 1.05) < 1e-9);
});

test('decideTimelineVideoSync: nudge is clamped to +/-25% of the base rate', () => {
  const ahead = decideTimelineVideoSync({ drift: 0.3, playing: true, contiguous: true, baseRate: 1, fps: 30 });
  assert.ok(Math.abs(ahead.playbackRate - 0.75) < 1e-9, `expected 0.75 clamp, got ${ahead.playbackRate}`);
  const behind = decideTimelineVideoSync({ drift: -0.3, playing: true, contiguous: true, baseRate: 1, fps: 30 });
  assert.ok(Math.abs(behind.playbackRate - 1.25) < 1e-9, `expected 1.25 clamp, got ${behind.playbackRate}`);
});

test('decideTimelineVideoSync: nudge clamps relative to a jog/shuttle base rate', () => {
  const d = decideTimelineVideoSync({ drift: 0.05, playing: true, contiguous: true, baseRate: 2, fps: 30 });
  assert.ok(Math.abs(d.playbackRate - 1.9) < 1e-9, `expected 1.9 (2*0.95), got ${d.playbackRate}`);
});

test('decideTimelineVideoSync: large contiguous drift still rate-corrects instead of seek-stepping', () => {
  const d = decideTimelineVideoSync({ drift: 0.5, playing: true, contiguous: true, baseRate: 1, fps: 30 });
  assert.deepEqual(d, { action: 'rate', playbackRate: 0.75 });
});

test('decideTimelineVideoSync: huge drift hard-seeks even while playing contiguously', () => {
  const d = decideTimelineVideoSync({ drift: 2.5, playing: true, contiguous: true, baseRate: 1, fps: 30 });
  assert.deepEqual(d, { action: 'seek' });
});

test('decideTimelineVideoSync: a cut/transition (non-contiguous) hard-seeks', () => {
  const d = decideTimelineVideoSync({ drift: 0.1, playing: true, contiguous: false, baseRate: 1, fps: 30 });
  assert.deepEqual(d, { action: 'seek' });
});

test('decideTimelineVideoSync: paused/scrub seeks to the frame when off, holds when aligned', () => {
  assert.deepEqual(decideTimelineVideoSync({ drift: 0.1, playing: false, contiguous: true, baseRate: 1, fps: 30 }), { action: 'seek' });
  // Within the paused hard-seek tolerance (~33ms at 30fps) → leave the exact frame.
  assert.deepEqual(decideTimelineVideoSync({ drift: 0.01, playing: false, contiguous: true, baseRate: 1, fps: 30 }), { action: 'hold' });
});

test('decideTimelineVideoSync: tolerates non-finite drift/baseRate without throwing', () => {
  assert.deepEqual(decideTimelineVideoSync({ drift: Number.NaN, playing: true, contiguous: true, baseRate: 1, fps: 30 }), { action: 'rate', playbackRate: 1 });
  const d = decideTimelineVideoSync({ drift: 0.05, playing: true, contiguous: true, baseRate: 0, fps: 30 });
  assert.ok(Math.abs(d.playbackRate - 0.95) < 1e-9);
});
