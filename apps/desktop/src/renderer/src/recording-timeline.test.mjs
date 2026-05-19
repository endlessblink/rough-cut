import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsset, createClip, createDefaultRecordingPresentation, createProject, createTrack } from '@rough-cut/project-model';
import { buildTimelineTracks } from './nle/timeline-clips.mjs';
import { getRecordingTimelineClip, syncRecordingTimelinePresentation, updateRecordingTimelineTrim } from './recording-timeline.mjs';

function projectWithRecordingAndCamera() {
  const recording = createAsset('recording', '/tmp/screen.mp4', { duration: 300, cameraAssetId: 'camera-asset', presentation: createDefaultRecordingPresentation() });
  const camera = createAsset('video', '/tmp/camera.mp4', { id: 'camera-asset', duration: 330, metadata: { isCamera: true, sourceInFrames: 30 } });
  const screenTrack = createTrack('video', { name: 'Screen', index: 0 });
  const cameraTrack = createTrack('video', { name: 'Camera', index: 1 });
  const screenClip = createClip(recording.id, screenTrack.id, { timelineIn: 0, timelineOut: 300, sourceIn: 0, sourceOut: 300 });
  const cameraClip = createClip(camera.id, cameraTrack.id, { timelineIn: 0, timelineOut: 300, sourceIn: 30, sourceOut: 330 });

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

test('updateRecordingTimelineTrim syncs legacy, top-level, and shared timeline tracks', () => {
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

  assert.equal(next.composition.duration, 195);
  assert.deepEqual(next.composition.tracks[0].clips[0], { ...project.composition.tracks[0].clips[0], timelineIn: 0, timelineOut: 195, sourceIn: 45, sourceOut: 240 });
  assert.deepEqual(next.tracks[0].clips[0], { ...project.tracks[0].clips[0], timelineIn: 0, timelineOut: 195, sourceIn: 45, sourceOut: 240 });
  assert.deepEqual(next.timeline.tracks[0].clips[0], { ...project.timeline.tracks[0].clips[0], timelineIn: 0, timelineOut: 195, sourceIn: 45, sourceOut: 240 });
  assert.deepEqual(next.timeline.tracks[1].clips[0], { ...project.timeline.tracks[1].clips[0], timelineIn: 0, timelineOut: 195, sourceIn: 75, sourceOut: 270 });
});

test('Recording edit trims appear in NLE rows without reload through synced top-level tracks', () => {
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

  const rows = buildTimelineTracks({ document });

  assert.equal(rows[0].blocks[0].widthPct, 100);
  assert.equal(rows[1].blocks[0].widthPct, 100);
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
