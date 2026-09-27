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
  linkedRecordingLaneBoundaryMismatches,
  percentToTime,
  timeToPercent,
} from './timeline-rail.mjs';
import { addCensorRegionAt } from './censor-markers.mjs';

/** Minimal recording project with one full-length screen clip. */
function recordingDocument(duration = 300) {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/recording.mp4', {
    duration,
    presentation: createDefaultRecordingPresentation(),
  });
  const track = {
    id: 'track-1',
    type: 'video',
    name: 'Video',
    index: 0,
    locked: false,
    visible: true,
    volume: 1,
    clips: [{
      id: 'clip-1',
      assetId: asset.id,
      trackId: 'track-1',
      enabled: true,
      timelineIn: 0,
      timelineOut: duration,
      sourceIn: 0,
      sourceOut: duration,
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
      effects: [],
      keyframes: [],
    }],
  };
  return createProject({ assets: [asset], composition: { ...base.composition, duration, tracks: [track] } });
}

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
  assert.equal(frameRangeToPlacement(0, 3, 30, 2001).width < 0.01, true);
});

test('linked recording lane gate rejects a hidden screen/audio boundary mismatch', () => {
  const screen = [
    { id: 'screen-1', left: 0, width: 25, timelineIn: 0, timelineOut: 30 },
    { id: 'screen-2', left: 25, width: 75, timelineIn: 30, timelineOut: 120 },
  ];
  const audio = [
    { id: 'audio:screen-1', left: 0, width: 25, timelineIn: 0, timelineOut: 30 },
    { id: 'audio:screen-2', left: 25, width: 75, timelineIn: 31, timelineOut: 120 },
  ];

  assert.deepEqual(linkedRecordingLaneBoundaryMismatches({ screen, audio }), [
    { kind: 'boundary', index: 1, differences: { timelineIn: { screen: 30, audio: 31 } } },
  ]);
});

test('linked recording lane gate pairs audio by linked clip id instead of array order', () => {
  const screen = [
    { id: 'screen-1', left: 0, width: 25, timelineIn: 0, timelineOut: 30 },
    { id: 'screen-2', left: 25, width: 75, timelineIn: 30, timelineOut: 120 },
  ];
  const audio = [
    { id: 'audio:screen-2', left: 25, width: 75, timelineIn: 30, timelineOut: 120 },
    { id: 'audio:screen-1', left: 0, width: 25, timelineIn: 0, timelineOut: 30 },
  ];

  assert.deepEqual(linkedRecordingLaneBoundaryMismatches({ screen, audio }), []);
});

test('buildTimelineModel reports no linked lane mismatch after a split', () => {
  const model = buildTimelineModel({
    document: recordingDocument(120),
    recording: { duration: 120, fps: 30, audio: { source: 'system' } },
    currentTimeSec: 0,
  });

  assert.deepEqual(model.linkedLaneBoundaryMismatches, []);
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

test('buildTimelineModel keeps linked recording audio visible without metadata audio', () => {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/recording.mp4', { duration: 300 });
  const track = { id: 'track-1', type: 'video', name: 'Video', index: 0, locked: false, visible: true, volume: 1, clips: [{ id: 'clip-1', assetId: asset.id, trackId: 'track-1', enabled: true, timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300, transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5, opacity: 1 }, effects: [], keyframes: [] }] };
  const document = createProject({
    assets: [asset],
    composition: { ...base.composition, duration: 300, tracks: [track] },
    timeline: { ...base.timeline, sources: [{ assetId: asset.id, mediaType: 'audio' }] },
  });
  const model = buildTimelineModel({ document, recording: { duration: 300, fps: 30 }, currentTimeSec: 0, cameraMediaUrl: null });

  assert.equal(model.lanes.audio.length, 1);
});

test('buildTimelineModel keeps a repaired canonical audio track visible without metadata audio', () => {
  const base = createProject();
  const asset = createAsset('recording', '/tmp/recording.mp4', { duration: 90 });
  const document = createProject({
    assets: [asset],
    composition: {
      ...base.composition,
      duration: 90,
      tracks: [
        { id: 'screen', type: 'video', clips: [{ id: 'screen-clip', assetId: asset.id, trackId: 'screen', timelineIn: 0, timelineOut: 90, sourceIn: 0, sourceOut: 90 }] },
        { id: 'audio', type: 'audio', clips: [{ id: 'audio-clip', assetId: asset.id, trackId: 'audio', timelineIn: 0, timelineOut: 90, sourceIn: 0, sourceOut: 90 }] },
      ],
    },
  });
  const model = buildTimelineModel({ document, recording: { fps: 30, duration: 90, audio: null }, currentTimeSec: 0 });
  assert.deepEqual(model.lanes.audio, [{ id: 'audio:screen-clip', left: 0, width: 100, timelineIn: 0, timelineOut: 90 }]);
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

test('buildTimelineModel keeps the original asset duration available for extending a trim', () => {
  const document = recordingDocument(300);
  const model = buildTimelineModel({ document, recording: { duration: 180, fps: 30 }, currentTimeSec: 1, cameraMediaUrl: null });

  assert.equal(model.durationSec, 10);
  assert.equal(model.sourceDurationSec, 10);
  assert.equal(model.trimEndFrame, 300);
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
  assert.match(source, /const renderedTrack = viewport\.querySelector<HTMLElement>\('\.screenLane \.laneTrack'\)\?\.getBoundingClientRect\(\)/);
  assert.doesNotMatch(source, /anchorFrame = frameAtClientX\(event\.clientX/);
  assert.match(styles, /\.timelineViewport\s*\{/);
  assert.match(styles, /\.timelineContent\s*\{/);
});

test('Recording edit timeline supports desktop-style zoom multi-select', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');
  const styles = await readFile(join(here, 'styles.css'), 'utf8');

  assert.match(source, /selectedZoomMarkerIds/);
  assert.match(source, /zoomSelectionPreview/);
  assert.match(source, /hadSelectionAtPointerDown/);
  assert.match(source, /tickEdgeScroll/);
  assert.match(source, /viewport\.scrollLeft \+=/);
  assert.match(source, /const maxStepPx = 14/);
  assert.match(source, /event\.shiftKey/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(source, /onZoomMarkersRemove/);
  assert.match(source, /function deleteZoomRegion\(regionId: string\)/);
  assert.match(source, /Delete selected zooms/);
  assert.match(source, /event\.key === 'Backspace'/);
  assert.match(styles, /\.zoomSelectionMarquee\s*\{/);
  assert.match(styles, /\.zoomEditorChip--multi\s*\{/);
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

test('Recording edit timeline deletes selected zoom markers from the timeline key handler', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');

  assert.match(source, /selectedZoomMarkerCount === 0 && !selectedZoomMarkerId/);
  assert.match(source, /event\.key === 'Delete' \|\| event\.key === 'Backspace'/);
  assert.match(source, /deleteSelectedZoomMarkers\(\)/);
  assert.match(source, /onZoomMarkersRemove\(selectedIds\)/);
  assert.match(source, /isTypingTarget\(event\.target\) \|\| event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey/);
});

test('Recording edit cut mode disables clip interactions so drags reach the lane', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');
  const styles = await readFile(join(here, 'styles.css'), 'utf8');

  assert.match(source, /if \(!region\.id \|\| cutModeActive\) return;/);
  assert.match(source, /if \(!onMoveClip \|\| !region\.id \|\| event\.button !== 0 \|\| cutModeActive\) return;/);
  assert.match(source, /tabIndex=\{cutModeActive \? -1 : 0\}/);
  assert.match(styles, /\.timelineLane\.cutModeActive \.clipBar,/);
  assert.match(styles, /\.timelineLane\.cutModeActive \.hiddenTrimRange,/);
  assert.match(styles, /\.timelineLane\.cutModeActive \.hiddenCutRange\s*\{/);
  assert.match(styles, /pointer-events: none;/);
});

test('censor lane places regions through the screen clips like zoom markers do', () => {
  const document = addCensorRegionAt(recordingDocument(), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 30,
    endFrame: 90,
  });

  const model = buildTimelineModel({
    document,
    recording: { duration: 300, fps: 30 },
    currentTimeSec: 0,
  });

  assert.equal(model.lanes.censor.length, 1);
  assert.equal(model.lanes.censor[0].id, 'c1');
  assert.equal(model.lanes.censor[0].startFrame, 30);
  assert.equal(model.lanes.censor[0].endFrame, 90);
  assert.ok(model.lanes.censor[0].width > 0);
});

test('censor lane exposes the mode so the chip can show solid vs pixelated', () => {
  const document = addCensorRegionAt(recordingDocument(), {
    id: 'c1',
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    startFrame: 0,
    mode: 'solid',
  });

  const model = buildTimelineModel({
    document,
    recording: { duration: 300, fps: 30 },
    currentTimeSec: 0,
  });

  assert.equal(model.lanes.censor[0].kind, 'solid');
  assert.match(model.lanes.censor[0].label, /Solid/);
});

test('censor lane is empty when the recording has no censors', () => {
  const model = buildTimelineModel({
    document: recordingDocument(),
    recording: { duration: 300, fps: 30 },
    currentTimeSec: 0,
  });
  assert.deepEqual(model.lanes.censor, []);
});

// 2026-09-27: lane clicks were scaled by the recording's full length, so on a
// trimmed recording a zoom landed away from the click, or in trimmed-away
// footage where it never showed.
test('a lane position maps back to the recording frame shown there', async () => {
  const { timelineFrameToSourceFrame, sourceRangeToTimelinePlacement } = await import('./timeline-rail.mjs');
  const headTrimmed = [{ timelineIn: 0, timelineOut: 2715, sourceIn: 409, sourceOut: 3124 }];
  assert.equal(timelineFrameToSourceFrame(headTrimmed, 0), 409);
  assert.equal(timelineFrameToSourceFrame(headTrimmed, 1357), 1766);
  const cut = [{ timelineIn: 0, timelineOut: 100, sourceIn: 0, sourceOut: 100 }, { timelineIn: 100, timelineOut: 200, sourceIn: 300, sourceOut: 400 }];
  assert.equal(timelineFrameToSourceFrame(cut, 150), 350);
  assert.equal(timelineFrameToSourceFrame(cut, 250), null);
  assert.equal(timelineFrameToSourceFrame(cut, 250, { clamp: true }), 399);
  const placement = sourceRangeToTimelinePlacement(headTrimmed, 1766, 1826, 30, 2715 / 30);
  assert.ok(Math.abs(placement.left - 50) < 0.1, `zoom drawn where it was added, got ${placement.left}%`);
});

// 2026-09-27: zoom drags were done in recording frames, so a zoom leapt by the
// length of any cut it crossed, shrank as it slid under a cut, and ran
// backwards once sections were reordered.
test('dragging a zoom follows the pointer across cuts and reordered sections', async () => {
  const { dragSourceRangeOnTimeline } = await import('./timeline-rail.mjs');
  const cut = [{ timelineIn: 0, timelineOut: 100, sourceIn: 0, sourceOut: 100 }, { timelineIn: 100, timelineOut: 200, sourceIn: 200, sourceOut: 300 }];
  const moved = dragSourceRangeOnTimeline(cut, { startFrame: 50, endFrame: 80 }, { mode: 'move', deltaFrames: 40, minSpan: 15 });
  assert.deepEqual(moved, { startFrame: 90, endFrame: 220, timelineStart: 90, timelineEnd: 120 });
  const pastCut = dragSourceRangeOnTimeline(cut, { startFrame: 50, endFrame: 80 }, { mode: 'move', deltaFrames: 100, minSpan: 15 });
  assert.deepEqual(pastCut, { startFrame: 250, endFrame: 280, timelineStart: 150, timelineEnd: 180 });
  const clampedAtEnd = dragSourceRangeOnTimeline(cut, { startFrame: 50, endFrame: 80 }, { mode: 'move', deltaFrames: 999, minSpan: 15 });
  assert.equal(clampedAtEnd.timelineEnd, 200);
  const endEdge = dragSourceRangeOnTimeline(cut, { startFrame: 50, endFrame: 80 }, { mode: 'end', pointerFrame: 130, minSpan: 15 });
  assert.deepEqual(endEdge, { startFrame: 50, endFrame: 230, timelineStart: 50, timelineEnd: 130 });
  const reordered = [{ timelineIn: 0, timelineOut: 100, sourceIn: 200, sourceOut: 300 }, { timelineIn: 100, timelineOut: 200, sourceIn: 0, sourceOut: 100 }];
  assert.equal(dragSourceRangeOnTimeline(reordered, { startFrame: 50, endFrame: 80 }, { mode: 'move', deltaFrames: -60, minSpan: 15 }), null, 'a drag that would straddle out-of-order sections is refused, not flipped');
});
