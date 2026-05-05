import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZoomSendcmd } from './zoom-sendcmd.mjs';
import { resolveFrame } from '@rough-cut/frame-resolver';
import { createAsset, createClip, createDefaultCameraPresentation, createDefaultRecordingBackgroundStyle, createProject, createTrack, createZoomMarker } from '@rough-cut/project-model';

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

function parseCropWindows(sendcmdContent) {
  return sendcmdContent.trim().split('\n').map((line) => {
    const match = /crop x ([\-0-9.]+), crop y ([\-0-9.]+), crop w ([\-0-9.]+), crop h ([\-0-9.]+)/.exec(line);
    assert.ok(match, `expected crop command: ${line}`);
    return {
      x: Number(match[1]),
      y: Number(match[2]),
      w: Number(match[3]),
      h: Number(match[4]),
    };
  });
}

function cropFromCameraTransform(cameraTransform, sourceWidth, sourceHeight) {
  const scale = cameraTransform.scale;
  const w = sourceWidth / scale;
  const h = sourceHeight / scale;
  return {
    x: sourceWidth / 2 - sourceWidth / (2 * scale) - cameraTransform.offsetX / scale,
    y: sourceHeight / 2 - sourceHeight / (2 * scale) - cameraTransform.offsetY / scale,
    w,
    h,
  };
}

function parityProject() {
  const recording = createAsset('recording', '/tmp/parity-source.mp4', {
    duration: 120,
    metadata: { width: 1280, height: 720, fps: 30 },
    presentation: {
      zoom: {
        autoIntensity: 0.5,
        followCursor: true,
        followAnimation: 'focused',
        followPadding: 0.25,
        markers: [
          createZoomMarker(10, 80, {
            kind: 'auto',
            strength: 1,
            focalPoint: { x: 0.5, y: 0.5 },
            zoomInDuration: 10,
            zoomOutDuration: 12,
          }),
        ],
      },
      cursor: { style: 'default', clickEffect: 'none', sizePercent: 100, clickSoundEnabled: false },
      camera: createDefaultCameraPresentation(),
      background: { ...createDefaultRecordingBackgroundStyle(), bgPadding: 128, bgCornerRadius: 36, bgShadowBlur: 64 },
    },
  });
  const trackId = 'parity-track';
  const clip = createClip(recording.id, trackId, { timelineIn: 0, timelineOut: 120, sourceIn: 0, sourceOut: 120 });
  return createProject({
    settings: {
      resolution: { width: 1280, height: 720 },
      frameRate: 30,
      backgroundColor: '#111111',
      sampleRate: 48000,
      destinationPresetId: null,
      aspectRatio: '16:9',
    },
    assets: [recording],
    composition: { duration: 120, tracks: [createTrack('video', { id: trackId, clips: [clip], index: 0 })], transitions: [] },
  });
}

function interpolatedCursorAtFrame(events, frame, sourceWidth, sourceHeight) {
  if (frame <= events[0].frame) return { x: events[0].x / sourceWidth, y: events[0].y / sourceHeight };
  const last = events[events.length - 1];
  if (frame >= last.frame) return { x: last.x / sourceWidth, y: last.y / sourceHeight };
  const nextIndex = events.findIndex((event) => event.frame > frame);
  const before = events[nextIndex - 1];
  const after = events[nextIndex];
  const t = (frame - before.frame) / (after.frame - before.frame);
  return {
    x: (before.x + (after.x - before.x) * t) / sourceWidth,
    y: (before.y + (after.y - before.y) * t) / sourceHeight,
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

test('manual markers follow the cursor when followCursor is enabled', () => {
  // Manual markers used to be gated out of cursor-follow, but the engine now
  // applies cursor-follow uniformly so the user can rely on the same behavior
  // for any marker kind. Sweep cursor across the full frame to clear the
  // followPadding leash and force the focal to move.
  const cursorEvents = [];
  for (let frame = 0; frame <= 60; frame += 1) {
    const t = frame / 60;
    cursorEvents.push({
      frame,
      timeMs: Math.round((frame / 30) * 1000),
      x: 200 + 800 * t,
      y: 200 + 400 * t,
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
  assert.notEqual(xAt12, xAt36, 'manual markers must follow the cursor when followCursor is enabled');
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

test('cursor-follow regression fixture keeps crop windows finite, bounded, and smooth', () => {
  const sourceWidth = 1280;
  const sourceHeight = 720;
  const cursorEvents = [];
  for (let frame = 0; frame < 90; frame += 1) {
    const pausePoint = 34 / 56;
    const pausedT = frame < 34
      ? frame / 56
      : frame < 56
        ? pausePoint
        : pausePoint + ((frame - 56) / 33) * (1 - pausePoint);
    cursorEvents.push({
      frame,
      timeMs: Math.round((frame / 30) * 1000),
      x: 220 + (1120 - 220) * pausedT,
      y: 160 + (620 - 160) * pausedT,
      type: 'move',
      button: 0,
    });
  }
  const result = buildZoomSendcmd({
    markers: [marker({ kind: 'auto', startFrame: 0, endFrame: 90, zoomInDuration: 0, zoomOutDuration: 0 })],
    cursorEvents,
    sourceWidth,
    sourceHeight,
    fps: 30,
    totalFrames: 90,
    presentationOptions: { followCursor: true, followAnimation: 'focused', followPadding: 0.25 },
  });

  const windows = parseCropWindows(result.sendcmdContent);
  for (const window of windows) {
    assert(Number.isFinite(window.x));
    assert(Number.isFinite(window.y));
    assert(Number.isFinite(window.w));
    assert(Number.isFinite(window.h));
    assert(window.x >= 0);
    assert(window.y >= 0);
    assert(window.w > 0 && window.w <= sourceWidth);
    assert(window.h > 0 && window.h <= sourceHeight);
    assert(window.x + window.w <= sourceWidth + 0.01);
    assert(window.y + window.h <= sourceHeight + 0.01);
  }
  for (let index = 1; index < windows.length; index += 1) {
    assert(Math.abs(windows[index].x - windows[index - 1].x) < 96, `large x jump at frame ${index}`);
    assert(Math.abs(windows[index].y - windows[index - 1].y) < 96, `large y jump at frame ${index}`);
  }
});

test('export sendcmd crop windows match preview resolver camera transform', () => {
  const sourceWidth = 1280;
  const sourceHeight = 720;
  const project = parityProject();
  const recording = project.assets[0];
  const cursorEvents = [
    { frame: 0, timeMs: 0, x: 358.4, y: 273.6, type: 'move', button: 0 },
    { frame: 35, timeMs: 1167, x: 998.4, y: 273.6, type: 'move', button: 0 },
    { frame: 50, timeMs: 1667, x: 998.4, y: 489.6, type: 'move', button: 0 },
    { frame: 119, timeMs: 3967, x: 998.4, y: 489.6, type: 'move', button: 0 },
  ];
  const result = buildZoomSendcmd({
    markers: recording.presentation.zoom.markers,
    cursorEvents,
    sourceWidth,
    sourceHeight,
    fps: 30,
    totalFrames: 120,
    presentationOptions: recording.presentation.zoom,
  });
  const windows = parseCropWindows(result.sendcmdContent);

  for (const frame of [0, 10, 15, 35, 67, 80]) {
    const resolved = resolveFrame(project, frame, {
      getCursorPosition: (_assetId, sourceFrame) => interpolatedCursorAtFrame(cursorEvents, sourceFrame, sourceWidth, sourceHeight),
    });
    const expected = cropFromCameraTransform(resolved.cameraTransform, sourceWidth, sourceHeight);
    const actual = windows[frame];
    assert.ok(Math.abs(actual.x - expected.x) < 0.01, `x mismatch at frame ${frame}`);
    assert.ok(Math.abs(actual.y - expected.y) < 0.01, `y mismatch at frame ${frame}`);
    assert.ok(Math.abs(actual.w - expected.w) < 0.01, `w mismatch at frame ${frame}`);
    assert.ok(Math.abs(actual.h - expected.h) < 0.01, `h mismatch at frame ${frame}`);
  }
});
