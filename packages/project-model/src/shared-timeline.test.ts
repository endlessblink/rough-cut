import { describe, expect, it } from 'vitest';
import { createAsset, createDefaultRecordingPresentation, createProject, createZoomMarker } from './factories.js';
import { SharedTimelineSchema } from './schemas.js';
import {
  collectTimelineInvariantIssues,
  computeTimelineDuration,
  type SharedTimeline,
  type TimelineClip,
  type TimelineTrack,
} from './shared-timeline.js';

function timelineClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip-1',
    mediaId: 'media-screen',
    trackId: 'video-1',
    linkGroupId: 'group-1',
    timelineIn: 0,
    timelineOut: 100,
    sourceIn: 20,
    sourceOut: 120,
    ...overrides,
  };
}

function timelineTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'video-1',
    kind: 'video',
    index: 0,
    label: 'Video 1',
    enabled: true,
    locked: false,
    muted: false,
    clips: [timelineClip()],
    ...overrides,
  };
}

function timeline(overrides: Partial<SharedTimeline> = {}): SharedTimeline {
  return {
    sources: [
      {
        id: 'media-screen',
        kind: 'screen',
        mediaType: 'video',
        label: 'Screen',
        duration: 300,
      },
    ],
    linkedGroups: [
      {
        id: 'group-1',
        kind: 'recording',
        sourceIds: ['media-screen'],
        primarySourceId: 'media-screen',
        syncPolicy: 'frame-locked',
      },
    ],
    tracks: [timelineTrack()],
    markers: [],
    effects: [],
    exportSettings: {
      format: 'mp4',
      codec: 'h264',
      bitrate: 15_000_000,
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      keepClickSounds: true,
    },
    ...overrides,
  };
}

describe('shared timeline canonical contract', () => {
  it('canonicalizes imported NLE tracks into mediaId/trackId/linkGroupId clips sorted by timelineIn', () => {
    const recording = createAsset('recording', '/tmp/recording.webm', { duration: 300 });
    const project = createProject({
      assets: [recording],
      tracks: [
        {
          id: 'video-1' as never,
          kind: 'video',
          index: 0,
          label: 'Video 1',
          enabled: true,
          locked: false,
          muted: false,
          clips: [
            {
              id: 'later' as never,
              source: { kind: 'project-asset', id: recording.id },
              timelineIn: 120,
              timelineOut: 220,
              sourceIn: 120,
              sourceOut: 220,
            },
            {
              id: 'earlier' as never,
              source: { kind: 'project-asset', id: recording.id },
              timelineIn: 0,
              timelineOut: 100,
              sourceIn: 0,
              sourceOut: 100,
            },
          ],
        },
      ],
    });

    expect(project.timeline.tracks[0]?.clips.map((clip) => clip.id)).toEqual(['earlier', 'later']);
    expect(project.timeline.tracks[0]?.clips[0]).toMatchObject({
      mediaId: `source:${recording.id}:screen`,
      trackId: 'video-1',
      linkGroupId: `linked:${recording.id}`,
      source: { kind: 'project-asset', id: recording.id },
    });
    expect(SharedTimelineSchema.safeParse(project.timeline).success).toBe(true);
  });

  it('allows cross-track overlaps while forbidding same-track overlaps', () => {
    const overlappingAcrossTracks = timeline({
      tracks: [
        timelineTrack({ id: 'video-1', clips: [timelineClip({ trackId: 'video-1', timelineIn: 0, timelineOut: 100, sourceIn: 0, sourceOut: 100 })] }),
        timelineTrack({ id: 'video-2', index: 1, clips: [timelineClip({ id: 'clip-2', trackId: 'video-2', timelineIn: 50, timelineOut: 150, sourceIn: 50, sourceOut: 150 })] }),
      ],
    });
    const overlappingOnSameTrack = timeline({
      tracks: [
        timelineTrack({
          clips: [
            timelineClip({ id: 'clip-1', timelineIn: 0, timelineOut: 100, sourceIn: 0, sourceOut: 100 }),
            timelineClip({ id: 'clip-2', timelineIn: 50, timelineOut: 150, sourceIn: 50, sourceOut: 150 }),
          ],
        }),
      ],
    });

    expect(SharedTimelineSchema.safeParse(overlappingAcrossTracks).success).toBe(true);
    expect(SharedTimelineSchema.safeParse(overlappingOnSameTrack).success).toBe(false);
  });

  it('allows persisted compact track height within editor bounds', () => {
    expect(SharedTimelineSchema.safeParse(timeline({ tracks: [timelineTrack({ height: 84 })] }))).toMatchObject({ success: true });
    expect(SharedTimelineSchema.safeParse(timeline({ tracks: [timelineTrack({ height: 12 })] }))).toMatchObject({ success: false });
  });

  it('rejects retiming, missing media, missing link groups, and source bounds overflow', () => {
    const invalid = timeline({
      tracks: [
        timelineTrack({
          clips: [
            timelineClip({ id: 'retimed', timelineIn: 0, timelineOut: 100, sourceIn: 0, sourceOut: 90 }),
            timelineClip({ id: 'missing-media', mediaId: 'missing', timelineIn: 110, timelineOut: 120, sourceIn: 0, sourceOut: 10 }),
            timelineClip({ id: 'missing-group', linkGroupId: 'missing', timelineIn: 130, timelineOut: 140, sourceIn: 0, sourceOut: 10 }),
            timelineClip({ id: 'overflow', timelineIn: 150, timelineOut: 170, sourceIn: 290, sourceOut: 310 }),
          ],
        }),
      ],
    });

    const messages = collectTimelineInvariantIssues(invalid).map((issue) => issue.message);
    expect(messages).toContain('Clip duration must match source duration until retiming exists');
    expect(messages).toContain('Clip mediaId must reference a media reference');
    expect(messages).toContain('Clip linkGroupId must reference a linked group');
    expect(messages).toContain('Clip sourceOut must not exceed media duration');
    expect(SharedTimelineSchema.safeParse(invalid).success).toBe(false);
  });

  it('computes duration from the last clip, marker, or temporal effect end frame', () => {
    const presentation = createDefaultRecordingPresentation();
    const recording = createAsset('recording', '/tmp/recording.webm', {
      duration: 500,
      presentation: {
        ...presentation,
        zoom: { ...presentation.zoom, markers: [createZoomMarker(300, 420)] },
      },
    });
    const project = createProject({
      assets: [recording],
      tracks: [
        {
          id: 'video-1' as never,
          kind: 'video',
          index: 0,
          label: 'Video 1',
          enabled: true,
          locked: false,
          muted: false,
          clips: [
            {
              id: 'clip-1' as never,
              source: { kind: 'project-asset', id: recording.id },
              timelineIn: 0,
              timelineOut: 240,
              sourceIn: 0,
              sourceOut: 240,
            },
          ],
        },
      ],
    });

    expect(computeTimelineDuration({
      ...project.timeline,
      effects: [
        ...project.timeline.effects,
        {
          id: 'effect-temporal',
          kind: 'annotation',
          ownerId: 'timeline',
          ownerType: 'timeline',
          startFrame: 440,
          endFrame: 480,
          enabled: true,
          params: {},
        },
      ],
    })).toBe(480);
  });
});
