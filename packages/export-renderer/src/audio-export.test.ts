import { describe, expect, it } from 'vitest';
import { createProject, createAsset, createClip } from '@rough-cut/project-model';
import { collectAudioExportSegments } from './audio-export.js';

describe('collectAudioExportSegments', () => {
  it('includes the main recording clip and skips camera assets', () => {
    const project = createProject({ name: 'audio-export-test' });
    const videoTracks = project.composition.tracks.filter((track) => track.type === 'video');
    const videoTrack = videoTracks[0]!;
    const secondVideoTrack = videoTracks[1]!;

    const recordingAsset = createAsset('recording', '/tmp/screen.webm', { duration: 120 });
    const cameraAsset = createAsset('video', '/tmp/camera.mp4', {
      duration: 120,
      metadata: { isCamera: true },
    });

    const recordingClip = createClip(recordingAsset.id, videoTrack.id, {
      timelineIn: 0,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 120,
    });
    const cameraClip = createClip(cameraAsset.id, secondVideoTrack.id, {
      timelineIn: 0,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 120,
    });

    const nextProject = {
      ...project,
      assets: [recordingAsset, cameraAsset],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) => {
          if (track.id === videoTrack.id) {
            return { ...track, clips: [recordingClip] };
          }
          if (track.id === secondVideoTrack.id) {
            return { ...track, clips: [cameraClip] };
          }
          return track;
        }),
      },
    };

    const segments = collectAudioExportSegments(nextProject);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.asset.id).toBe(recordingAsset.id);
  });

  it('keeps overlapping clips so export can mix them', () => {
    const project = createProject({ name: 'audio-overlap-test' });
    const videoTrack = project.composition.tracks.find((track) => track.type === 'video')!;
    const assetA = createAsset('recording', '/tmp/a.webm', { duration: 120 });
    const assetB = createAsset('recording', '/tmp/b.webm', { duration: 120 });
    const clipA = createClip(assetA.id, videoTrack.id, {
      timelineIn: 0,
      timelineOut: 90,
      sourceIn: 0,
      sourceOut: 90,
    });
    const clipB = createClip(assetB.id, videoTrack.id, {
      timelineIn: 60,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 60,
    });

    const nextProject = {
      ...project,
      assets: [assetA, assetB],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) =>
          track.id === videoTrack.id ? { ...track, clips: [clipA, clipB] } : track,
        ),
      },
    };

    const segments = collectAudioExportSegments(nextProject);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.asset.id).toBe(assetA.id);
    expect(segments[1]?.asset.id).toBe(assetB.id);
  });
});
