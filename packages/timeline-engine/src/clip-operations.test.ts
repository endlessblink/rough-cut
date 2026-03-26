import { describe, it, expect } from 'vitest';
import { createTrack, createClip, createEffectInstance } from '@rough-cut/project-model';
import type { AssetId } from '@rough-cut/project-model';
import { splitClip, trimClipLeft, trimClipRight, moveClip, moveClipToTrack } from './clip-operations.js';
import type { TrackId } from '@rough-cut/project-model';

const assetId = 'asset-1' as AssetId;

function makeClip(trackIdVal: TrackId, timelineIn: number, timelineOut: number, sourceIn = 0) {
  const duration = timelineOut - timelineIn;
  return createClip(assetId, trackIdVal, {
    timelineIn,
    timelineOut,
    sourceIn,
    sourceOut: sourceIn + duration,
  });
}

describe('splitClip', () => {
  it('returns null when frame is at timelineIn', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    expect(splitClip(clip, 10)).toBeNull();
  });

  it('returns null when frame is at timelineOut', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    expect(splitClip(clip, 30)).toBeNull();
  });

  it('returns null when frame is before timelineIn', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    expect(splitClip(clip, 5)).toBeNull();
  });

  it('returns null when frame is after timelineOut', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    expect(splitClip(clip, 35)).toBeNull();
  });

  it('splits at midpoint with correct timeline bounds', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    const result = splitClip(clip, 15);
    expect(result).not.toBeNull();
    const [left, right] = result!;
    expect(left.timelineIn).toBe(0);
    expect(left.timelineOut).toBe(15);
    expect(right.timelineIn).toBe(15);
    expect(right.timelineOut).toBe(30);
  });

  it('adjusts sourceIn/Out proportionally at midpoint', () => {
    const track = createTrack('video');
    // clip spans frames 0-30 on timeline, source 0-30
    const clip = makeClip(track.id, 0, 30);
    const result = splitClip(clip, 15);
    expect(result).not.toBeNull();
    const [left, right] = result!;
    expect(left.sourceIn).toBe(0);
    expect(left.sourceOut).toBe(15);
    expect(right.sourceIn).toBe(15);
    expect(right.sourceOut).toBe(30);
  });

  it('adjusts sourceIn/Out correctly when sourceIn is non-zero', () => {
    const track = createTrack('video');
    // timelineIn=10, timelineOut=40 => 30 frames. sourceIn=5, sourceOut=35
    const clip = createClip(assetId, track.id, {
      timelineIn: 10,
      timelineOut: 40,
      sourceIn: 5,
      sourceOut: 35,
    });
    const result = splitClip(clip, 20); // 10 frames into the clip
    expect(result).not.toBeNull();
    const [left, right] = result!;
    expect(left.timelineIn).toBe(10);
    expect(left.timelineOut).toBe(20);
    expect(left.sourceIn).toBe(5);
    expect(left.sourceOut).toBe(15); // 5 + 10
    expect(right.timelineIn).toBe(20);
    expect(right.timelineOut).toBe(40);
    expect(right.sourceIn).toBe(15); // 5 + 10
    expect(right.sourceOut).toBe(35);
  });

  it('assigns new unique IDs to both clips', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    const result = splitClip(clip, 15);
    expect(result).not.toBeNull();
    const [left, right] = result!;
    expect(left.id).not.toBe(clip.id);
    expect(right.id).not.toBe(clip.id);
    expect(left.id).not.toBe(right.id);
  });

  it('preserves effects on both clips', () => {
    const track = createTrack('video');
    const effect = createEffectInstance('blur');
    const clip = createClip(assetId, track.id, {
      timelineIn: 0,
      timelineOut: 30,
      sourceIn: 0,
      sourceOut: 30,
      effects: [effect],
    });
    const result = splitClip(clip, 15);
    expect(result).not.toBeNull();
    const [left, right] = result!;
    expect(left.effects).toHaveLength(1);
    expect(right.effects).toHaveLength(1);
    expect(left.effects[0]!.id).toBe(effect.id);
    expect(right.effects[0]!.id).toBe(effect.id);
  });

  it('preserves transform on both clips', () => {
    const track = createTrack('video');
    const clip = createClip(assetId, track.id, {
      timelineIn: 0,
      timelineOut: 30,
      sourceIn: 0,
      sourceOut: 30,
      transform: { x: 10, y: 20, scaleX: 2, scaleY: 2, rotation: 45, anchorX: 0.5, anchorY: 0.5, opacity: 0.8 },
    });
    const result = splitClip(clip, 15);
    expect(result).not.toBeNull();
    const [left, right] = result!;
    expect(left.transform).toEqual(clip.transform);
    expect(right.transform).toEqual(clip.transform);
  });
});

describe('trimClipLeft', () => {
  it('returns null when newTimelineIn equals timelineOut (zero duration)', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    expect(trimClipLeft(clip, 30)).toBeNull();
  });

  it('returns null when newTimelineIn is past timelineOut', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    expect(trimClipLeft(clip, 35)).toBeNull();
  });

  it('moves timelineIn and adjusts sourceIn', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30); // sourceIn=0, sourceOut=30
    const trimmed = trimClipLeft(clip, 10);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.timelineIn).toBe(10);
    expect(trimmed!.timelineOut).toBe(30); // unchanged
    expect(trimmed!.sourceIn).toBe(10); // moved by same delta
    expect(trimmed!.sourceOut).toBe(30); // unchanged
  });

  it('handles trimming when sourceIn is non-zero', () => {
    const track = createTrack('video');
    const clip = createClip(assetId, track.id, {
      timelineIn: 5,
      timelineOut: 25,
      sourceIn: 10,
      sourceOut: 30,
    });
    const trimmed = trimClipLeft(clip, 10); // delta = 5
    expect(trimmed).not.toBeNull();
    expect(trimmed!.timelineIn).toBe(10);
    expect(trimmed!.sourceIn).toBe(15); // 10 + 5
    expect(trimmed!.sourceOut).toBe(30); // unchanged
  });

  it('allows trimming to a valid position', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    const trimmed = trimClipLeft(clip, 29);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.timelineIn).toBe(29);
    expect(trimmed!.timelineOut).toBe(30);
  });
});

describe('trimClipRight', () => {
  it('returns null when newTimelineOut equals timelineIn (zero duration)', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    expect(trimClipRight(clip, 10)).toBeNull();
  });

  it('returns null when newTimelineOut is before timelineIn', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    expect(trimClipRight(clip, 5)).toBeNull();
  });

  it('moves timelineOut and adjusts sourceOut', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30); // sourceOut=30
    const trimmed = trimClipRight(clip, 20);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.timelineIn).toBe(0); // unchanged
    expect(trimmed!.timelineOut).toBe(20);
    expect(trimmed!.sourceIn).toBe(0); // unchanged
    expect(trimmed!.sourceOut).toBe(20); // delta = 10, 30-10=20
  });

  it('handles trimming when sourceOut is non-zero offset', () => {
    const track = createTrack('video');
    const clip = createClip(assetId, track.id, {
      timelineIn: 5,
      timelineOut: 25,
      sourceIn: 10,
      sourceOut: 30,
    });
    const trimmed = trimClipRight(clip, 20); // delta = 5
    expect(trimmed).not.toBeNull();
    expect(trimmed!.timelineOut).toBe(20);
    expect(trimmed!.sourceOut).toBe(25); // 30 - 5
  });

  it('allows trimming to minimum duration', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    const trimmed = trimClipRight(clip, 1);
    expect(trimmed).not.toBeNull();
    expect(trimmed!.timelineOut).toBe(1);
    expect(trimmed!.timelineIn).toBe(0);
  });
});

describe('moveClip', () => {
  it('shifts both timelineIn and timelineOut', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30); // duration = 20
    const moved = moveClip(clip, 50);
    expect(moved.timelineIn).toBe(50);
    expect(moved.timelineOut).toBe(70);
  });

  it('preserves duration', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    const duration = clip.timelineOut - clip.timelineIn;
    const moved = moveClip(clip, 0);
    expect(moved.timelineOut - moved.timelineIn).toBe(duration);
  });

  it('does not change sourceIn/Out', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    const moved = moveClip(clip, 50);
    expect(moved.sourceIn).toBe(clip.sourceIn);
    expect(moved.sourceOut).toBe(clip.sourceOut);
  });

  it('can move to position 0', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    const moved = moveClip(clip, 0);
    expect(moved.timelineIn).toBe(0);
    expect(moved.timelineOut).toBe(20);
  });
});

describe('moveClipToTrack', () => {
  it('updates only trackId', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('video');
    const clip = makeClip(track1.id, 10, 30);
    const moved = moveClipToTrack(clip, track2.id);
    expect(moved.trackId).toBe(track2.id);
    expect(moved.id).toBe(clip.id);
    expect(moved.timelineIn).toBe(clip.timelineIn);
    expect(moved.timelineOut).toBe(clip.timelineOut);
    expect(moved.sourceIn).toBe(clip.sourceIn);
    expect(moved.sourceOut).toBe(clip.sourceOut);
    expect(moved.transform).toEqual(clip.transform);
    expect(moved.effects).toBe(clip.effects);
  });
});
