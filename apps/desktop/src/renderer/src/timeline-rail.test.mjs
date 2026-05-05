import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAsset,
  createDefaultRecordingPresentation,
  createProject,
  createZoomMarker,
} from '@rough-cut/project-model';
import {
  buildTimelineModel,
  clampTimelineTime,
  frameRangeToPlacement,
  percentToTime,
  timeToPercent,
} from './timeline-rail.mjs';

test('time and percent helpers clamp to the source duration', () => {
  assert.equal(clampTimelineTime(-1, 10), 0);
  assert.equal(clampTimelineTime(12, 10), 10);
  assert.equal(timeToPercent(5, 10), 50);
  assert.equal(timeToPercent(12, 10), 100);
  assert.equal(percentToTime(25, 20), 5);
  assert.equal(percentToTime(140, 20), 20);
});

test('frameRangeToPlacement maps frame ranges deterministically', () => {
  assert.deepEqual(frameRangeToPlacement(30, 90, 30, 10), { left: 10, width: 20 });
});

test('buildTimelineModel renders zoom markers and click events from project metadata', () => {
  const base = createProject();
  const presentation = createDefaultRecordingPresentation();
  const asset = createAsset('recording', '/tmp/recording.mp4', {
    duration: 300,
    presentation: {
      ...presentation,
      zoom: {
        ...presentation.zoom,
        markers: [createZoomMarker(30, 90, { kind: 'manual' })],
      },
    },
    metadata: {
      cursorEvents: [
        { frame: 15, x: 10, y: 10, type: 'move', button: 'none' },
        { frame: 60, x: 20, y: 30, type: 'down', button: 'left' },
      ],
    },
  });
  const document = { ...base, assets: [asset] };
  const model = buildTimelineModel({
    document,
    recording: { duration: 300, fps: 30, camera: { filePath: '/tmp/camera.mp4' }, audio: { source: 'mic' } },
    currentTimeSec: 2,
    cameraMediaUrl: null,
  });

  assert.equal(model.durationSec, 10);
  assert.equal(model.playheadPercent, 20);
  assert.equal(model.ticks.length, 7);
  assert.deepEqual(model.lanes.screen[0], { id: 'screen', left: 0, width: 100 });
  assert.equal(model.lanes.zoom.length, 1);
  assert.equal(model.lanes.zoom[0].left, 10);
  assert.equal(model.lanes.zoom[0].width, 20);
  assert.equal(model.lanes.clicks.length, 1);
  assert.equal(model.lanes.clicks[0].left, 20);
  assert.equal(model.lanes.camera.length, 1);
  assert.equal(model.lanes.audio.length, 1);
});
