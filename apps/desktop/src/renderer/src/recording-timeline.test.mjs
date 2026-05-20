import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createClip, createDefaultRecordingPresentation, createProject, createTrack } from '@rough-cut/project-model';
import {
  getRecordingTimelineClip,
  restoreRecordingSourceEdge,
  rippleDeleteRecordingRange,
  selectRecordingEditModel,
  syncRecordingTimelinePresentation,
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
