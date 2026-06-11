import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const here = dirname(fileURLToPath(import.meta.url));

test('time and percent helpers clamp to the timeline duration', () => {
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
  // A real recording always has a screen clip spanning the full duration; include
  // it so the timeline length comes from actual content (300f / 10s), not padding.
  const track = { id: 'track-1', type: 'video', name: 'Video', index: 0, locked: false, visible: true, volume: 1, clips: [{ id: 'clip-1', assetId: asset.id, trackId: 'track-1', enabled: true, timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1 }, effects: [], keyframes: [] }] };
  const document = createProject({ assets: [asset], composition: { ...base.composition, duration: 300, tracks: [track] } });
  const model = buildTimelineModel({
    document,
    recording: { duration: 300, fps: 30, camera: { filePath: '/tmp/camera.mp4' }, audio: { source: 'mic' } },
    currentTimeSec: 2,
    cameraMediaUrl: null,
  });

  assert.equal(model.durationSec, 10);
  assert.equal(model.sourceDurationSec, 10);
  assert.equal(model.visibleDurationSec, 10);
  assert.equal(model.playheadPercent, 20);
  assert.equal(model.ticks.length, 7);
  assert.equal(model.lanes.screen[0].left, 0);
  assert.equal(model.lanes.screen[0].width, 100);
  assert.equal(model.lanes.zoom.length, 1);
  assert.equal(model.lanes.zoom[0].left, 10);
  assert.equal(model.lanes.zoom[0].width, 20);
  assert.equal(model.lanes.clicks.length, 1);
  assert.equal(model.lanes.clicks[0].left, 20);
  assert.equal(model.lanes.camera.length, 1);
  assert.equal(model.lanes.audio.length, 1);
});

test('buildTimelineModel maps recording lanes to canonical timeline time', () => {
  const base = createProject();
  const presentation = createDefaultRecordingPresentation();
  const asset = createAsset('recording', '/tmp/recording.mp4', {
    duration: 300,
    presentation: {
      ...presentation,
      zoom: {
        ...presentation.zoom,
        markers: [createZoomMarker(60, 120, { kind: 'manual' })],
      },
    },
    metadata: {
      cursorEvents: [
        { frame: 20, x: 5, y: 5, type: 'down', button: 'left' },
        { frame: 90, x: 10, y: 10, type: 'down', button: 'left' },
      ],
    },
  });
  const track = { id: 'track-1', type: 'video', name: 'Video', index: 0, locked: false, visible: true, volume: 1, clips: [{ id: 'clip-1', assetId: asset.id, trackId: 'track-1', enabled: true, timelineIn: 0, timelineOut: 180, sourceIn: 30, sourceOut: 210, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1 }, effects: [], keyframes: [] }] };
  const document = createProject({ assets: [asset], composition: { ...base.composition, duration: 180, tracks: [track] } });
  const model = buildTimelineModel({ document, recording: { duration: 300, fps: 30 }, currentTimeSec: 1, cameraMediaUrl: null });

  assert.equal(model.durationSec, 6);
  assert.equal(model.sourceDurationSec, 10);
  assert.equal(model.visibleDurationSec, 6);
  assert.equal(model.lanes.screen[0].left, 0);
  assert.equal(model.lanes.screen[0].width, 100);
  assert.equal(Math.round(model.playheadPercent), 17);
  assert.equal(Math.round(model.lanes.zoom[0].left), 17);
  assert.equal(Math.round(model.lanes.zoom[0].width), 33);
  assert.equal(model.lanes.clicks.length, 1);
  assert.equal(Math.round(model.lanes.clicks[0].left), 33);
});

test('buildTimelineModel preserves canonical gap and source offset placement', () => {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/recording.mp4', { duration: 180 });
  const track = { id: 'track-1', type: 'video', name: 'Video', index: 0, locked: false, visible: true, volume: 1, clips: [{ id: 'clip-1', assetId: asset.id, trackId: 'track-1', enabled: true, timelineIn: 30, timelineOut: 120, sourceIn: 60, sourceOut: 150, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1 }, effects: [], keyframes: [] }] };
  const document = createProject({ assets: [asset], composition: { ...base.composition, duration: 150, tracks: [track] } });
  const model = buildTimelineModel({ document, recording: { duration: 180, fps: 30 }, currentTimeSec: 1, cameraMediaUrl: null });

  // Timeline ends at actual content (clip timelineOut 120 = 4s), not the stale
  // composition.duration of 150 (5s) — no trailing empty space.
  assert.equal(model.durationSec, 4);
  assert.equal(model.sourceDurationSec, 6);
  assert.equal(model.trimStartFrame, 60);
  assert.equal(model.trimEndFrame, 150);
  assert.equal(model.lanes.screen[0].left, 25);
  assert.equal(model.lanes.screen[0].width, 75);
  assert.equal(model.playheadPercent, 25);
});

test('buildTimelineModel assigns overlapping zoom markers to separate layers with longer marker first', () => {
  const base = createProject();
  const presentation = createDefaultRecordingPresentation();
  const shorter = createZoomMarker(30, 90, { kind: 'manual' });
  const longer = createZoomMarker(0, 150, { kind: 'manual' });
  const asset = createAsset('recording', '/tmp/recording.mp4', {
    duration: 300,
    presentation: {
      ...presentation,
      zoom: {
        ...presentation.zoom,
        markers: [shorter, longer],
      },
    },
  });
  const document = { ...base, assets: [asset] };

  const model = buildTimelineModel({ document, recording: { duration: 300, fps: 30 }, currentTimeSec: 1, cameraMediaUrl: null });
  const longerRegion = model.lanes.zoom.find((region) => region.id === longer.id);
  const shorterRegion = model.lanes.zoom.find((region) => region.id === shorter.id);

  assert.equal(model.zoomLayerCount, 2);
  assert.equal(longerRegion.layer, 0);
  assert.equal(shorterRegion.layer, 1);
});

test('Recording edit timeline exposes zoom controls and +/- shortcuts', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');
  const styles = await readFile(join(here, 'styles.css'), 'utf8');

  assert.match(source, /aria-label="Zoom timeline out"/);
  assert.match(source, /aria-label="Zoom timeline in"/);
  assert.match(source, /aria-label="Fit timeline"/);
  assert.match(source, /event\.key !== '\+'/);
  assert.match(source, /event\.key !== '-'/);
  assert.match(source, /isTypingTarget\(event\.target\)/);
  assert.match(source, /viewport\.addEventListener\('wheel', handleWheel, \{ passive: false \}\)/);
  assert.match(source, /!event\.ctrlKey && !event\.metaKey/);
  assert.match(source, /frameAtClientX\(event\.clientX, frameAreaLeft, pixelsPerFrame, timelineDurationFrames\)/);
  assert.match(styles, /\.timelineViewport\s*\{/);
  assert.match(styles, /\.timelineContent\s*\{/);
});

test('Recording edit timeline supports middle-button drag panning', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');
  const styles = await readFile(join(here, 'styles.css'), 'utf8');

  assert.match(source, /function beginTimelinePan\(event: React\.PointerEvent<HTMLDivElement>\)/);
  assert.match(source, /if \(event\.button !== 1\) return;/);
  assert.match(source, /viewport\.scrollLeft = startScrollLeft - \(moveEvent\.clientX - startClientX\);/);
  assert.match(source, /onPointerDownCapture=\{beginTimelinePan\}/);
  assert.match(source, /function preventMiddleTimelineAuxClick\(event: React\.MouseEvent<HTMLDivElement>\)/);
  assert.match(source, /onAuxClick=\{preventMiddleTimelineAuxClick\}/);
  assert.match(styles, /\.timelineViewport\.panning,/);
  assert.match(styles, /cursor: grabbing;/);
  assert.match(styles, /user-select: none;/);
});

test('Recording edit timeline deletes the selected zoom marker from the timeline key handler', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');

  assert.match(source, /if \(!selectedZoomMarkerId\) return;/);
  assert.match(source, /event\.key === 'Delete' \|\| event\.key === 'Backspace'/);
  assert.match(source, /onZoomMarkerRemove\(selectedZoomMarkerId\)/);
  assert.match(source, /isTypingTarget\(event\.target\) \|\| event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey/);
});
