import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createClip, createDefaultRecordingPresentation, createProject, createTrack } from '@rough-cut/project-model';
import {
  getRecordingTimelineClip,
  restoreRecordingSourceEdge,
  restoreRecordingOriginalState,
  rippleDeleteRecordingRange,
  selectRecordingEditModel,
  splitRecordingAtFrame,
  syncRecordingTimelinePresentation,
  trimRecordingClipEdge,
  updateRecordingTimelineTrim,
} from './recording-timeline.mjs';

function projectWithRecordingAndCamera() {
  const recording = createAsset('recording', '/tmp/screen.mp4', { duration: 300, cameraAssetId: 'camera-asset', presentation: createDefaultRecordingPresentation() });
  const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset', duration: 330, metadata: { isCamera: true, sourceInFrames: 30 } });
  const screenTrack = createTrack('video', { name: 'Screen', index: 0 });
  const cameraTrack = createTrack('video', { name: 'Camera', index: 1 });
  const screenClip = createClip(recording.id, screenTrack.id, { timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300 });
  const cameraClip = createClip(camera.id, cameraTrack.id, { timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300 });

  return createProject({
    assets: [recording, camera],
    composition: {
      duration: 300,
      tracks: [{ ...screenTrack, clips: [screenClip] }, { ...cameraTrack, clips: [cameraClip] }],
      transitions: [],
    },
  });
}

function projectWithAllLinkedRecordingLanes() {
  const recording = createAsset('recording', '/tmp/screen.mp4', { duration: 360, cameraAssetId: 'camera-asset', presentation: createDefaultRecordingPresentation() });
  const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset', duration: 420, metadata: { isCamera: true, sourceInFrames: 23 } });
  const lanes = [
    { kind: 'video', name: 'Screen', index: 0, mediaId: `source:${recording.id}:screen`, sourceIn: 11 },
    { kind: 'video', name: 'Camera', index: 1, mediaId: `source:${recording.id}:camera`, sourceIn: 23 },
    { kind: 'audio', name: 'System audio', index: 2, mediaId: `source:${recording.id}:system-audio`, sourceIn: 37 },
    { kind: 'audio', name: 'Mic', index: 3, mediaId: `source:${recording.id}:mic-audio`, sourceIn: 41 },
  ];
  const tracks = lanes.map((lane) => {
    const track = createTrack(lane.kind, { name: lane.name, index: lane.index });
    return {
      ...track,
      clips: [
        {
          ...createClip(recording.id, track.id, { timelineIn: 0, timelineOut: 300, sourceIn: lane.sourceIn, sourceOut: lane.sourceIn + 300 }),
          mediaId: lane.mediaId,
          linkGroupId: `linked:${recording.id}`,
        },
      ],
    };
  });
  return createProject({
    assets: [recording, camera],
    composition: { duration: 300, tracks, transitions: [] },
  });
}

function recordingLaneClips(document, assetId) {
  const sourcePrefix = `source:${assetId}:`;
  return document.timeline.tracks
    .map((track) => ({ track, clips: track.clips.filter((clip) => clip.mediaId.startsWith(sourcePrefix)) }))
    .filter(({ clips }) => clips.length > 0);
}

function assertLinkedRecordingLanes(document, assetId, expectedRanges, expectedSourceStarts, expectedSourceGaps = []) {
  const lanes = recordingLaneClips(document, assetId);
  assert.equal(lanes.length, 4, 'all linked recording lanes remain present');
  const seenLaneRanges = new Set();
  for (const { track, clips } of lanes) {
    const sorted = [...clips].sort((left, right) => left.timelineIn - right.timelineIn);
    assert.deepEqual(sorted.map((clip) => [clip.timelineIn, clip.timelineOut]), expectedRanges, `${track.label} timeline ranges`);
    const ranges = sorted.map((clip) => `${clip.timelineIn}:${clip.timelineOut}`);
    assert.equal(new Set(ranges).size, ranges.length, `${track.label} has no duplicate ranges`);
    assert.ok(sorted.every((clip) => clip.timelineOut > clip.timelineIn), `${track.label} has no zero-width clips`);
    for (let index = 1; index < sorted.length; index += 1) {
      assert.equal(sorted[index - 1].timelineOut, sorted[index].timelineIn, `${track.label} timeline is contiguous`);
      assert.equal(sorted[index].sourceIn - sorted[index - 1].sourceOut, expectedSourceGaps[index - 1] ?? 0, `${track.label} source gap`);
    }
    assert.equal(sorted[0]?.sourceIn, expectedSourceStarts[track.label], `${track.label} source start`);
    seenLaneRanges.add(JSON.stringify(sorted.map((clip) => [clip.timelineIn, clip.timelineOut])));
  }
  assert.equal(seenLaneRanges.size, 1, 'linked recording lanes share timeline ranges');
}

test('splitRecordingAtFrame splits the linked recording exactly at the requested timeline frame', () => {
  const project = projectWithRecordingAndCamera();
  const next = splitRecordingAtFrame(project, { assetId: project.assets[0].id, frame: 123 });
  const model = selectRecordingEditModel({ document: next, recordingAssetId: project.assets[0].id });
  assert.deepEqual(model.screenClips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 123], [123, 300]]);
});

test('splitRecordingAtFrame splits every linked audio and video lane at the same frame', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const audioTrack = createTrack('audio', { name: 'System audio', index: 2 });
  const audioClip = createClip(recording.id, audioTrack.id, { timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300 });
  const linkedAudioClip = {
    ...audioClip,
    mediaId: `source:${recording.id}:system-audio`,
    linkGroupId: `linked:${recording.id}`,
  };
  const withAudio = {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: [...project.timeline.tracks, { ...audioTrack, clips: [linkedAudioClip] }],
    },
  };
  const next = splitRecordingAtFrame(withAudio, { assetId: recording.id, frame: 123 });
  for (const track of next.timeline.tracks) {
    if (!track.clips.some((clip) => clip.mediaId.startsWith(`source:${recording.id}:`))) continue;
    assert.deepEqual(track.clips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 123], [123, 300]]);
  }
});

test('splitRecordingAtFrame reconciles pre-existing audio boundary drift before cutting', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const audioTrack = createTrack('audio', { name: 'Mic', index: 2 });
  const audioClip = createClip(recording.id, audioTrack.id, { timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300 });
  const withDrift = {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: [...project.timeline.tracks, {
        ...audioTrack,
        clips: [
          { ...audioClip, id: 'audio-left', mediaId: `source:${recording.id}:mic-audio`, linkGroupId: `linked:${recording.id}`, timelineOut: 120, sourceOut: 120 },
          { ...audioClip, id: 'audio-right', mediaId: `source:${recording.id}:mic-audio`, linkGroupId: `linked:${recording.id}`, timelineIn: 120, sourceIn: 120 },
        ],
      }],
    },
  };

  const next = splitRecordingAtFrame(withDrift, { assetId: recording.id, frame: 123 });
  const model = selectRecordingEditModel({ document: next, recordingAssetId: recording.id });
  const boundaries = (clips) => clips.flatMap((clip) => [clip.timelineIn, clip.timelineOut]).sort((left, right) => left - right);
  assert.deepEqual(boundaries(model.screenClips), boundaries(model.document.timeline.tracks.find((track) => track.kind === 'audio').clips));
  assert.ok(model.screenClips.some((clip) => clip.timelineIn === 123));
});

test('rippleDeleteRecordingRange reconciles pre-existing linked audio boundaries before deleting', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const audioTrack = createTrack('audio', { name: 'Mic', index: 2 });
  const audioClip = createClip(recording.id, audioTrack.id, { timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300 });
  const withDrift = {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: [...project.timeline.tracks, {
        ...audioTrack,
        clips: [
          { ...audioClip, id: 'audio-left', mediaId: `source:${recording.id}:mic-audio`, linkGroupId: `linked:${recording.id}`, timelineOut: 120, sourceOut: 120 },
          { ...audioClip, id: 'audio-right', mediaId: `source:${recording.id}:mic-audio`, linkGroupId: `linked:${recording.id}`, timelineIn: 120, sourceIn: 120 },
        ],
      }],
    },
  };

  const next = rippleDeleteRecordingRange(withDrift, { assetId: recording.id, startFrame: 90, endFrame: 150 });
  const model = selectRecordingEditModel({ document: next, recordingAssetId: recording.id });
  const audio = model.document.timeline.tracks.find((track) => track.kind === 'audio');
  assert.deepEqual(model.screenClips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [[0, 90, 0, 90], [90, 240, 150, 300]]);
  assert.deepEqual(audio.clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [[0, 90, 0, 90], [90, 240, 150, 300]]);
});

test('getRecordingTimelineClip reads the shared timeline before legacy composition tracks', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const legacyChanged = {
    ...project,
    composition: {
      ...project.composition,
      tracks: project.composition.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => clip.assetId === recording.id ? { ...clip, sourceIn: 99, sourceOut: 199 } : clip),
      })),
    },
  };

  const clip = getRecordingTimelineClip(legacyChanged, recording.id);

  assert.equal(clip.sourceIn, 0);
  assert.equal(clip.sourceOut, 300);
});

test('selectRecordingEditModel derives leading-gap view state from the canonical timeline', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const withGap = {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          timelineIn: clip.timelineIn + 45,
          timelineOut: clip.timelineOut + 45,
        })),
      })),
    },
  };

  const model = selectRecordingEditModel({ document: withGap, recordingAssetId: recording.id });

  assert.equal(model.viewStartFrame, 45);
  assert.equal(model.viewEndFrame, 345);
  assert.equal(model.viewDurationFrames, 300);
  assert.equal(model.primaryClip.id, project.timeline.tracks[0].clips[0].id);
});

test('selectRecordingEditModel returns multiple canonical screen clips after splits', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const original = project.timeline.tracks[0].clips[0];
  const split = {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track, index) => index === 0
        ? {
            ...track,
            clips: [
              { ...original, id: 'screen-a', timelineOut: 120, sourceOut: 120 },
              { ...original, id: 'screen-b', timelineIn: 120, timelineOut: 300, sourceIn: 120, sourceOut: 300 },
            ],
          }
        : track),
    },
  };

  const model = selectRecordingEditModel({ document: split, recordingAssetId: recording.id });

  assert.deepEqual(model.screenClips.map((clip) => clip.id), ['screen-a', 'screen-b']);
});

test('selectRecordingEditModel removes duplicate linked screen ranges before rendering audio', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const original = project.timeline.tracks[0].clips[0];
  const duplicated = {
    ...project,
    timeline: {
      ...project.timeline,
      tracks: [
        { ...project.timeline.tracks[0], clips: [original] },
        { ...project.timeline.tracks[0], id: 'duplicate-track', clips: [{ ...original, id: 'duplicate-screen-range', trackId: 'duplicate-track' }] },
        ...project.timeline.tracks.slice(1),
      ],
    },
  };

  const model = selectRecordingEditModel({ document: duplicated, recordingAssetId: recording.id });

  assert.equal(model.screenClips.length, 1);
  assert.deepEqual(model.screenClips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 300]]);
});

test('selectRecordingEditModel warns for extra unsupported video clips', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const extra = createAsset('video', '/tmp/overlay.mp4', { id: 'overlay-asset', duration: 60 });
  const withOverlay = createProject({
    assets: [...project.assets, extra],
    timeline: {
      ...project.timeline,
      sources: [...project.timeline.sources, { id: 'source:overlay', kind: 'project-asset', mediaType: 'video', assetId: extra.id, label: 'Overlay', duration: 60 }],
      linkedGroups: [...project.timeline.linkedGroups, { id: 'linked:overlay', kind: 'manual-sync', sourceIds: ['source:overlay'], primarySourceId: 'source:overlay', syncPolicy: 'manual-offset' }],
      tracks: [
        ...project.timeline.tracks,
        { id: 'overlay-track', kind: 'video', index: 9, label: 'Overlay', enabled: true, locked: false, muted: false, clips: [{ id: 'overlay-clip', mediaId: 'source:overlay', trackId: 'overlay-track', linkGroupId: 'linked:overlay', timelineIn: 10, timelineOut: 50, sourceIn: 0, sourceOut: 40 }] },
      ],
    },
  });

  const model = selectRecordingEditModel({ document: withOverlay, recordingAssetId: recording.id });

  assert.match(model.warning, /Complex timeline/);
  assert.equal(model.screenClips.length, 1);
});

test('updateRecordingTimelineTrim writes canonical timeline clips only', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const camera = project.assets[1];

  const next = updateRecordingTimelineTrim(project, {
    assetId: recording.id,
    cameraAssetId: camera.id,
    cameraOffset: 30,
    startFrame: 45,
    endFrame: 240,
  });

  assert.equal(next.composition.duration, 300);
  assert.deepEqual(next.composition.tracks[0].clips[0], project.composition.tracks[0].clips[0]);
  assert.deepEqual(next.timeline.tracks[0].clips[0], { ...project.timeline.tracks[0].clips[0], timelineIn: 45, timelineOut: 240, sourceIn: 45, sourceOut: 240 });
  assert.deepEqual(next.timeline.tracks[1].clips[0], { ...project.timeline.tracks[1].clips[0], timelineIn: 45, timelineOut: 240, sourceIn: 45, sourceOut: 240 });
});

test('restoreRecordingSourceEdge maps restore UI to the command service', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const trimmed = updateRecordingTimelineTrim(project, {
    assetId: recording.id,
    startFrame: 45,
    endFrame: 240,
  });

  const next = restoreRecordingSourceEdge(trimmed, { assetId: recording.id, edge: 'head' });

  assert.equal(next.timeline.tracks[0].clips[0].timelineIn, 0);
  assert.equal(next.timeline.tracks[0].clips[0].sourceIn, 0);
});

test('restoreRecordingOriginalState returns screen and camera to one full take', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const edited = {
    ...project,
    settings: { ...project.settings, aspectRatio: '9:16' },
    assets: project.assets.map((asset) => asset.id === recording.id
      ? { ...asset, metadata: { ...asset.metadata, recordingEditOriginalAspectRatio: '16:9' } }
      : asset),
    assets: project.assets.map((asset) => asset.id === recording.id
      ? { ...asset, metadata: { ...asset.metadata, recordingEditOriginalAspectRatio: '16:9' }, presentation: { ...asset.presentation, zoom: { ...asset.presentation.zoom, markers: [{ id: 'zoom-1' }] }, censorRegions: [{ id: 'censor-1' }] } }
      : asset),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({ ...track, clips: [{ ...track.clips[0], timelineIn: 20, timelineOut: 80, sourceIn: 20, sourceOut: 80 }, { ...track.clips[0], id: `${track.id}-split`, timelineIn: 80, timelineOut: 300, sourceIn: 80, sourceOut: 300 }] })),
      markers: [{ id: 'cut-1' }],
      effects: [{ id: 'graphic:g1', kind: 'graphic', ownerId: 'timeline', ownerType: 'timeline', startFrame: 10, endFrame: 60, enabled: true, params: { html: '<div></div>' } }],
    },
  };

  const next = restoreRecordingOriginalState(edited, { assetId: recording.id });

  assert.equal(next.timeline.markers.length, 0);
  assert.equal(next.settings.aspectRatio, '16:9');
  assert.equal(next.timeline.effects.length, 4);
  assert.ok(next.timeline.effects.some((effect) => effect.id === 'graphic:g1'), 'graphics survive a restore');
  // The camera keeps its capture-time head offset (30 frames) so it stays lip-synced.
  assert.deepEqual(next.timeline.tracks.map((track) => track.clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut])), [[[0, 300, 0, 300]], [[0, 300, 30, 330]]]);
  assert.deepEqual(next.composition.tracks.map((track) => track.clips.map((clip) => [clip.sourceIn, clip.sourceOut])), [[[0, 300]], [[30, 330]]]);
  assert.equal(next.assets[0].presentation.zoom.markers.length, 0);
   assert.deepEqual(next.assets[0].presentation.censorRegions, [{ id: 'censor-1' }]);
});

test('restoreRecordingOriginalState infers the original canvas ratio when an older recording lacks the baseline metadata', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const edited = {
    ...project,
    settings: { ...project.settings, aspectRatio: '4:5' },
    assets: project.assets.map((asset) => asset.id === recording.id
      ? { ...asset, metadata: { ...asset.metadata, width: 1920, height: 1080 } }
      : asset),
  };

  const next = restoreRecordingOriginalState(edited, { assetId: recording.id });

  assert.equal(next.settings.aspectRatio, '16:9');
});

test('rippleDeleteRecordingRange splits boundaries and removes a middle range', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  let id = 0;

  const next = rippleDeleteRecordingRange(project, {
    assetId: recording.id,
    startFrame: 90,
    endFrame: 150,
    idFactory: (prefix) => `${prefix}-${id += 1}`,
  });

  assert.deepEqual(next.timeline.tracks[0].clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [
    [0, 90, 0, 90],
    [90, 240, 150, 300],
  ]);
});

test('rippleDeleteRecordingRange keeps a one-frame cut at the timeline start linked', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  let id = 0;

  const next = rippleDeleteRecordingRange(project, {
    assetId: recording.id,
    startFrame: 1,
    endFrame: 3,
    idFactory: (prefix) => `${prefix}-${id += 1}`,
  });

  for (const track of next.timeline.tracks.slice(0, 2)) {
    assert.deepEqual(track.clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [
      [0, 1, 0, 1],
      [1, 298, 3, 300],
    ]);
  }
});

test('rippleDeleteRecordingRange removes a direct range from the true timeline head', () => {
  const project = projectWithAllLinkedRecordingLanes();
  const recording = project.assets[0];

  const next = rippleDeleteRecordingRange(project, { assetId: recording.id, startFrame: 0, endFrame: 3 });

  assertLinkedRecordingLanes(next, recording.id, [[0, 297]], { Screen: 14, Camera: 26, 'System audio': 40, Mic: 44 });
  assert.equal(selectRecordingEditModel({ document: next, recordingAssetId: recording.id }).viewDurationFrames, 297);
});

test('rippleDeleteRecordingRange preserves linked lanes across repeated small head batches', () => {
  const project = projectWithAllLinkedRecordingLanes();
  const recording = project.assets[0];
  let next = project;
  let removed = 0;
  for (const endFrame of [1, 1, 2]) {
    next = rippleDeleteRecordingRange(next, { assetId: recording.id, startFrame: 0, endFrame });
    removed += endFrame;
    assertLinkedRecordingLanes(next, recording.id, [[0, 300 - removed]], {
      Screen: 11 + removed,
      Camera: 23 + removed,
      'System audio': 37 + removed,
      Mic: 41 + removed,
    });
  }
});

test('splitRecordingAtFrame cuts the moving head with real interior frames on every linked lane', () => {
  const project = projectWithAllLinkedRecordingLanes();
  const recording = project.assets[0];
  let next = splitRecordingAtFrame(project, { assetId: recording.id, frame: 10 });
  next = splitRecordingAtFrame(next, { assetId: recording.id, frame: 4 });
  next = splitRecordingAtFrame(next, { assetId: recording.id, frame: 2 });

  assertLinkedRecordingLanes(next, recording.id, [[0, 2], [2, 4], [4, 10], [10, 300]], {
    Screen: 11,
    Camera: 23,
    'System audio': 37,
    Mic: 41,
  });
});

test('rippleDeleteRecordingRange covers cross-boundary, reversed, full, and one-frame-tail cuts', () => {
  const crossBoundary = projectWithAllLinkedRecordingLanes();
  const recording = crossBoundary.assets[0];
  const afterCrossBoundary = rippleDeleteRecordingRange(crossBoundary, { assetId: recording.id, startFrame: 8, endFrame: 12 });
  assertLinkedRecordingLanes(afterCrossBoundary, recording.id, [[0, 8], [8, 296]], {
    Screen: 11,
    Camera: 23,
    'System audio': 37,
    Mic: 41,
  }, [4]);

  const reversedProject = projectWithAllLinkedRecordingLanes();
  const reversed = rippleDeleteRecordingRange(reversedProject, { assetId: reversedProject.assets[0].id, startFrame: 4, endFrame: 1 });
  assertLinkedRecordingLanes(reversed, reversedProject.assets[0].id, [[0, 1], [1, 297]], {
    Screen: 11,
    Camera: 23,
    'System audio': 37,
    Mic: 41,
  }, [3]);

  const oneFrameTailProject = projectWithAllLinkedRecordingLanes();
  const oneFrameTail = rippleDeleteRecordingRange(oneFrameTailProject, { assetId: oneFrameTailProject.assets[0].id, startFrame: 0, endFrame: 299 });
  assertLinkedRecordingLanes(oneFrameTail, oneFrameTailProject.assets[0].id, [[0, 1]], {
    Screen: 310,
    Camera: 322,
    'System audio': 336,
    Mic: 340,
  });

  const fullyDeletedProject = projectWithAllLinkedRecordingLanes();
  const fullyDeleted = rippleDeleteRecordingRange(fullyDeletedProject, { assetId: fullyDeletedProject.assets[0].id, startFrame: 0, endFrame: 300 });
  assert.equal(recordingLaneClips(fullyDeleted, fullyDeletedProject.assets[0].id).length, 0, 'full recording delete removes every linked lane');
});

test('updateRecordingTimelineTrim keeps a one-frame head trim identical on linked tracks', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];

  const next = updateRecordingTimelineTrim(project, {
    assetId: recording.id,
    startFrame: 1,
    endFrame: 299,
  });

  for (const track of next.timeline.tracks.slice(0, 2)) {
    assert.deepEqual(track.clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn, clip.sourceOut]), [[1, 299, 1, 299]]);
  }
});

test('Recording edit trim no longer mutates legacy top-level tracks', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const camera = project.assets[1];
  const document = updateRecordingTimelineTrim(project, {
    assetId: recording.id,
    cameraAssetId: camera.id,
    cameraOffset: 30,
    startFrame: 30,
    endFrame: 180,
  });

  assert.deepEqual(document.tracks, project.tracks);
  assert.deepEqual(document.composition.tracks, project.composition.tracks);
});

test('syncRecordingTimelinePresentation mirrors cursor and camera presentation into shared timeline effects', () => {
  const project = projectWithRecordingAndCamera();
  const recording = project.assets[0];
  const document = {
    ...project,
    assets: project.assets.map((asset) => asset.id === recording.id
      ? {
          ...asset,
          presentation: {
            ...asset.presentation,
            cursor: { style: 'spotlight', clickEffect: 'ring', sizePercent: 120, clickSoundEnabled: true },
            camera: { shape: 'circle', aspectRatio: '1:1', position: 'corner-tl', roundness: 100, size: 80, visible: true, padding: 8, inset: 2, insetColor: '#ffffff', shadowEnabled: true, shadowBlur: 12, shadowOpacity: 0.3 },
          },
        }
      : asset),
  };

  const next = syncRecordingTimelinePresentation(document, recording.id);

  assert.equal(next.timeline.effects.find((effect) => effect.id === `effect:${recording.id}:cursor`)?.params.style, 'spotlight');
  assert.equal(next.timeline.effects.find((effect) => effect.id === `effect:${recording.id}:click`)?.params.clickEffect, 'ring');
  assert.equal(next.timeline.effects.find((effect) => effect.id === `effect:${recording.id}:camera-pip`)?.params.position, 'corner-tl');
});

// 2026-09-26: the split id counter restarted at every launch, so a project cut
// across two sessions held two clips named `clip-l-1` in every lane. Clicking
// clip 2 selected clip 1 too, and trimming clip 2 edited clip 1.
function projectWithCrossSessionDuplicateIds() {
  const project = projectWithRecordingAndCamera();
  const assetId = project.assets[0].id;
  let document = splitRecordingAtFrame(project, { assetId, frame: 100 });
  document = splitRecordingAtFrame(document, { assetId, frame: 200 });
  return {
    assetId,
    document: {
      ...document,
      timeline: {
        ...document.timeline,
        tracks: document.timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip, index) => (index === 1 ? { ...clip, id: track.clips[0].id } : clip)),
        })),
      },
    },
  };
}

test('a project with clips sharing an id opens with one id per clip, the same way every time', () => {
  const { document, assetId } = projectWithCrossSessionDuplicateIds();
  const rawIds = document.timeline.tracks[0].clips.map((clip) => clip.id);
  assert.equal(new Set(rawIds).size, rawIds.length - 1, 'fixture reproduces the saved duplicate');

  const model = selectRecordingEditModel({ document, recordingAssetId: assetId });
  const ids = model.screenClips.map((clip) => clip.id);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(selectRecordingEditModel({ document, recordingAssetId: assetId }).screenClips.map((clip) => clip.id), ids);
  assert.deepEqual(model.screenClips.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 100], [100, 200], [200, 300]]);
});

test('splitting again after a restart never reuses an existing clip id', () => {
  const { document, assetId } = projectWithCrossSessionDuplicateIds();
  const next = splitRecordingAtFrame(document, { assetId, frame: 250 });
  const ids = next.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id));
  assert.equal(new Set(ids).size, ids.length);
});

// 2026-09-27: trimming a section's end left an empty stretch before the next
// section; the playhead landed in it and the preview went black.
function threeSectionProject() {
  const project = projectWithRecordingAndCamera();
  const assetId = project.assets[0].id;
  let document = splitRecordingAtFrame(project, { assetId, frame: 100 });
  document = splitRecordingAtFrame(document, { assetId, frame: 200 });
  return { assetId, document };
}

function laneRanges(document) {
  return document.timeline.tracks
    .filter((track) => track.clips.length > 0)
    .map((track) => track.clips.map((clip) => [clip.timelineIn, clip.timelineOut, clip.sourceIn]));
}

test('shortening a middle section from its end closes the gap on every lane', () => {
  const { document, assetId } = threeSectionProject();
  const middle = selectRecordingEditModel({ document, recordingAssetId: assetId }).screenClips[1];
  const trimmed = trimRecordingClipEdge(document, { assetId, clipId: middle.id, edge: 'tail', frame: 160 });
  for (const lane of laneRanges(trimmed)) {
    assert.deepEqual(lane.map(([timelineIn, timelineOut]) => [timelineIn, timelineOut]), [[0, 100], [100, 160], [160, 260]]);
  }
  const screen = selectRecordingEditModel({ document: trimmed, recordingAssetId: assetId }).screenClips;
  assert.equal(screen[2].sourceIn, 200, 'the next section still starts on its own first frame');
});

test('shortening a middle section from its start closes the gap and keeps its position', () => {
  const { document, assetId } = threeSectionProject();
  const middle = selectRecordingEditModel({ document, recordingAssetId: assetId }).screenClips[1];
  const trimmed = trimRecordingClipEdge(document, { assetId, clipId: middle.id, edge: 'head', frame: 130 });
  const screen = selectRecordingEditModel({ document: trimmed, recordingAssetId: assetId }).screenClips;
  assert.deepEqual(screen.map((clip) => [clip.timelineIn, clip.timelineOut]), [[0, 100], [100, 170], [170, 270]]);
  assert.equal(screen[1].sourceIn, 130, 'the section now begins 30 frames later in the recording');
});

test('only the trimmed section changes; earlier sections keep their frames', () => {
  const { document, assetId } = threeSectionProject();
  const [first, , last] = selectRecordingEditModel({ document, recordingAssetId: assetId }).screenClips;
  const trimmed = trimRecordingClipEdge(document, { assetId, clipId: last.id, edge: 'tail', frame: 280 });
  const screen = selectRecordingEditModel({ document: trimmed, recordingAssetId: assetId }).screenClips;
  assert.deepEqual([screen[0].timelineIn, screen[0].timelineOut, screen[0].sourceIn], [first.timelineIn, first.timelineOut, first.sourceIn]);
  assert.equal(screen[2].timelineOut, 280);
});

test('deleting an empty space closes it on every lane', () => {
  const { document, assetId } = threeSectionProject();
  // Leave a gap: drop the middle section without rippling.
  const gapped = {
    ...document,
    timeline: {
      ...document.timeline,
      tracks: document.timeline.tracks.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.timelineIn !== 100) })),
    },
  };
  const closed = rippleDeleteRecordingRange(gapped, { assetId, startFrame: 100, endFrame: 200 });
  for (const lane of laneRanges(closed)) {
    assert.deepEqual(lane.map(([timelineIn, timelineOut, sourceIn]) => [timelineIn, timelineOut, sourceIn]).map(([a, b]) => [a, b]), [[0, 100], [100, 200]]);
  }
});

test('lengthening a section from its end pushes the later sections along on every lane', () => {
  const { document, assetId } = threeSectionProject();
  const shortened = trimRecordingClipEdge(document, {
    assetId,
    clipId: selectRecordingEditModel({ document, recordingAssetId: assetId }).screenClips[1].id,
    edge: 'tail',
    frame: 160,
  });
  const middle = selectRecordingEditModel({ document: shortened, recordingAssetId: assetId }).screenClips[1];
  const restored = trimRecordingClipEdge(shortened, { assetId, clipId: middle.id, edge: 'tail', frame: 180 });
  for (const lane of laneRanges(restored)) {
    assert.deepEqual(lane.map(([timelineIn, timelineOut]) => [timelineIn, timelineOut]), [[0, 100], [100, 180], [180, 280]]);
  }
});

// 2026-09-27: with an empty space after a section, dragging its end outward
// pushed the next section (and its audio) along instead of filling the space.
test('lengthening a section into empty space fills the space and leaves the next section where it is', () => {
  const { document, assetId } = threeSectionProject();
  const middleId = selectRecordingEditModel({ document, recordingAssetId: assetId }).screenClips[1].id;
  // Leave a gap after the middle section (ripple off), then drag its end back out.
  const gapped = {
    ...document,
    timeline: {
      ...document.timeline,
      tracks: document.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (clip.timelineIn === 100 ? { ...clip, timelineOut: 150, sourceOut: clip.sourceIn + 50 } : clip)),
      })),
    },
  };
  const middle = selectRecordingEditModel({ document: gapped, recordingAssetId: assetId }).screenClips.find((clip) => clip.timelineIn === 100);
  const filled = trimRecordingClipEdge(gapped, { assetId, clipId: middle?.id ?? middleId, edge: 'tail', frame: 190 });
  for (const lane of laneRanges(filled)) {
    assert.deepEqual(lane.map(([timelineIn, timelineOut]) => [timelineIn, timelineOut]), [[0, 100], [100, 190], [200, 300]]);
  }
});

// 2026-09-27: a start edge could not be dragged left past the previous
// section, so trimmed-away footage at a section's start could not come back.
test('lengthening a section from its start reveals hidden footage and pushes later sections along', () => {
  const { document, assetId } = threeSectionProject();
  const last = selectRecordingEditModel({ document, recordingAssetId: assetId }).screenClips[2];
  // Hide 30 frames at the start of the last section (ripple), then reveal 20 again.
  const trimmed = trimRecordingClipEdge(document, { assetId, clipId: last.id, edge: 'head', frame: 230 });
  const shortened = selectRecordingEditModel({ document: trimmed, recordingAssetId: assetId }).screenClips[2];
  assert.deepEqual([shortened.timelineIn, shortened.timelineOut, shortened.sourceIn], [200, 270, 230]);
  const revealed = trimRecordingClipEdge(trimmed, { assetId, clipId: shortened.id, edge: 'head', frame: 180 });
  for (const lane of laneRanges(revealed)) {
    assert.deepEqual(lane.map(([timelineIn, timelineOut]) => [timelineIn, timelineOut]), [[0, 100], [100, 200], [200, 290]]);
  }
  const screen = selectRecordingEditModel({ document: revealed, recordingAssetId: assetId }).screenClips;
  assert.equal(screen[2].sourceIn, 210, 'the section starts 20 frames earlier in the recording');
});
