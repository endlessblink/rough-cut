import { describe, expect, it } from 'vitest';
import { resolveNleFrame, type NleTrack, type NleTrackClip } from './track.js';

function clip(id: string, timelineIn: number, timelineOut: number): NleTrackClip {
  return {
    id: id as never,
    source: { kind: 'project-asset', id: `asset-${id}` },
    timelineIn,
    timelineOut,
    sourceIn: 0,
    sourceOut: timelineOut - timelineIn,
  };
}

function track(overrides: Partial<NleTrack>): NleTrack {
  return {
    id: 'track' as never,
    kind: 'video',
    index: 0,
    label: 'Track',
    enabled: true,
    locked: false,
    muted: false,
    clips: [],
    ...overrides,
  };
}

describe('resolveNleFrame', () => {
  it('selects the highest-index active video clip', () => {
    const result = resolveNleFrame(
      [
        track({ id: 'v1' as never, index: 1, clips: [clip('bottom', 0, 100)] }),
        track({ id: 'v2' as never, index: 3, clips: [clip('top', 0, 100)] }),
      ],
      30,
    );

    expect(result.video?.track.id).toBe('v2');
    expect(result.video?.clip.id).toBe('top');
  });

  it('excludes disabled video tracks while locked tracks remain playable', () => {
    const result = resolveNleFrame(
      [
        track({ id: 'disabled' as never, index: 5, enabled: false, clips: [clip('disabled', 0, 100)] }),
        track({ id: 'locked' as never, index: 4, locked: true, clips: [clip('locked', 0, 100)] }),
        track({ id: 'visible' as never, index: 1, clips: [clip('visible', 0, 100)] }),
      ],
      30,
    );

    expect(result.video?.track.id).toBe('locked');
  });

  it('returns all enabled unmuted active audio clips for later mixing', () => {
    const result = resolveNleFrame(
      [
        track({ id: 'a1' as never, kind: 'audio', index: 1, clips: [clip('voice', 0, 100)] }),
        track({ id: 'a2' as never, kind: 'audio', index: 2, clips: [clip('music', 20, 120)] }),
        track({ id: 'muted' as never, kind: 'audio', index: 3, muted: true, clips: [clip('muted', 0, 100)] }),
        track({ id: 'locked' as never, kind: 'audio', index: 4, locked: true, clips: [clip('locked-audio', 0, 100)] }),
      ],
      30,
    );

    expect(result.audio.map((entry) => entry.clip.id)).toEqual(['locked-audio', 'music', 'voice']);
  });

  it('uses half-open intervals for clip boundaries', () => {
    const tracks = [track({ clips: [clip('first', 0, 10), clip('second', 10, 20)] })];

    expect(resolveNleFrame(tracks, 9).video?.clip.id).toBe('first');
    expect(resolveNleFrame(tracks, 10).video?.clip.id).toBe('second');
    expect(resolveNleFrame(tracks, 20).video).toBeNull();
  });

  it('returns no active clips for invalid or empty input', () => {
    expect(resolveNleFrame(undefined, 0)).toEqual({ video: null, audio: [] });
    expect(resolveNleFrame([], 0)).toEqual({ video: null, audio: [] });
    expect(resolveNleFrame([track({ clips: [clip('bad', 0, 10)] })], Number.NaN)).toEqual({
      video: null,
      audio: [],
    });
  });
});
