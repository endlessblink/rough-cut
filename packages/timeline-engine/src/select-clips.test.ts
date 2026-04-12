import { describe, it, expect } from 'vitest';
import { createTrack, createClip, createAsset } from '@rough-cut/project-model';
import type { AssetId, TrackId, ClipId } from '@rough-cut/project-model';
import {
  frameIntervalsOverlap,
  selectActiveClipsAtFrame,
  getClipsInFrameRange,
} from './select-clips.js';
import { findOverlappingClips, wouldOverlap } from './overlap.js';

const assetId = 'asset-1' as AssetId;

function makeClip(trackIdVal: TrackId, timelineIn: number, timelineOut: number) {
  return createClip(assetId, trackIdVal, { timelineIn, timelineOut, sourceIn: 0, sourceOut: timelineOut - timelineIn });
}

describe('frameIntervalsOverlap', () => {
  it('returns true for overlapping intervals', () => {
    expect(frameIntervalsOverlap(0, 10, 5, 15)).toBe(true);
  });

  it('returns false for adjacent intervals (touching edges)', () => {
    // [0, 10) and [10, 20) are adjacent, not overlapping
    expect(frameIntervalsOverlap(0, 10, 10, 20)).toBe(false);
  });

  it('returns false when b is entirely before a', () => {
    expect(frameIntervalsOverlap(10, 20, 0, 5)).toBe(false);
  });

  it('returns false when a is entirely before b', () => {
    expect(frameIntervalsOverlap(0, 5, 10, 20)).toBe(false);
  });

  it('returns true for fully contained intervals', () => {
    expect(frameIntervalsOverlap(0, 30, 5, 15)).toBe(true);
  });

  it('returns true for identical intervals', () => {
    expect(frameIntervalsOverlap(5, 15, 5, 15)).toBe(true);
  });
});

describe('selectActiveClipsAtFrame', () => {
  it('returns empty array for empty tracks', () => {
    const track = createTrack('video');
    expect(selectActiveClipsAtFrame([track], 0)).toEqual([]);
  });

  it('returns clip that is active at frame', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [clip] };
    const result = selectActiveClipsAtFrame([populated], 20);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(clip.id);
  });

  it('includes clip at timelineIn boundary', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [clip] };
    expect(selectActiveClipsAtFrame([populated], 10)).toHaveLength(1);
  });

  it('excludes clip at timelineOut boundary', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [clip] };
    expect(selectActiveClipsAtFrame([populated], 30)).toHaveLength(0);
  });

  it('excludes clips before frame', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 20);
    const populated = { ...track, clips: [clip] };
    expect(selectActiveClipsAtFrame([populated], 5)).toHaveLength(0);
  });

  it('excludes clips after frame', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 20);
    const populated = { ...track, clips: [clip] };
    expect(selectActiveClipsAtFrame([populated], 25)).toHaveLength(0);
  });

  it('returns clips from multiple tracks', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('audio');
    const clip1 = makeClip(track1.id, 0, 30);
    const clip2 = makeClip(track2.id, 10, 40);
    const t1 = { ...track1, clips: [clip1] };
    const t2 = { ...track2, clips: [clip2] };
    const result = selectActiveClipsAtFrame([t1, t2], 15);
    expect(result).toHaveLength(2);
  });

  it('skips clips on invisible tracks', () => {
    const track = createTrack('video', { visible: false });
    const clip = makeClip(track.id, 0, 30);
    const populated = { ...track, clips: [clip] };
    expect(selectActiveClipsAtFrame([populated], 10)).toHaveLength(0);
  });

  it('includes clips on visible tracks and skips invisible', () => {
    const visibleTrack = createTrack('video', { visible: true });
    const hiddenTrack = createTrack('video', { visible: false });
    const clip1 = makeClip(visibleTrack.id, 0, 30);
    const clip2 = makeClip(hiddenTrack.id, 0, 30);
    const t1 = { ...visibleTrack, clips: [clip1] };
    const t2 = { ...hiddenTrack, clips: [clip2] };
    const result = selectActiveClipsAtFrame([t1, t2], 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(clip1.id);
  });
});

describe('getClipsInFrameRange', () => {
  it('returns empty array for empty tracks', () => {
    const track = createTrack('video');
    expect(getClipsInFrameRange([track], 0, 100)).toEqual([]);
  });

  it('returns clip that fully overlaps range', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [clip] };
    const result = getClipsInFrameRange([populated], 5, 40);
    expect(result).toHaveLength(1);
  });

  it('returns clip that partially overlaps range from left', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 15);
    const populated = { ...track, clips: [clip] };
    expect(getClipsInFrameRange([populated], 10, 30)).toHaveLength(1);
  });

  it('returns clip that partially overlaps range from right', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 20, 40);
    const populated = { ...track, clips: [clip] };
    expect(getClipsInFrameRange([populated], 10, 30)).toHaveLength(1);
  });

  it('excludes adjacent clips (touching edges)', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 10);
    const populated = { ...track, clips: [clip] };
    // Range [10, 20) and clip [0, 10) share no frames
    expect(getClipsInFrameRange([populated], 10, 20)).toHaveLength(0);
  });

  it('returns clips from all tracks without visibility filter', () => {
    const track1 = createTrack('video', { visible: false });
    const clip1 = makeClip(track1.id, 0, 30);
    const t1 = { ...track1, clips: [clip1] };
    // getClipsInFrameRange does not filter by visibility
    expect(getClipsInFrameRange([t1], 5, 20)).toHaveLength(1);
  });

  it('filters to clips on specified tracks when trackIds provided', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('video');
    const c1 = makeClip(track1.id, 10, 40);
    const c2 = makeClip(track2.id, 15, 35);
    const t1 = { ...track1, clips: [c1] };
    const t2 = { ...track2, clips: [c2] };
    const only1 = getClipsInFrameRange([t1, t2], 0, 100, [track1.id]);
    expect(only1).toHaveLength(1);
    expect(only1[0]!.id).toBe(c1.id);
  });

  it('returns clips from all specified tracks', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('audio');
    const track3 = createTrack('video');
    const c1 = makeClip(track1.id, 10, 40);
    const c2 = makeClip(track2.id, 15, 35);
    const c3 = makeClip(track3.id, 20, 30);
    const t1 = { ...track1, clips: [c1] };
    const t2 = { ...track2, clips: [c2] };
    const t3 = { ...track3, clips: [c3] };
    const result = getClipsInFrameRange([t1, t2, t3], 0, 100, [track1.id, track3.id]);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id).sort()).toEqual([c1.id, c3.id].sort());
  });

  it('returns empty when trackIds is empty array', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 40);
    const populated = { ...track, clips: [clip] };
    expect(getClipsInFrameRange([populated], 0, 100, [])).toEqual([]);
  });

  it('returns empty when trackIds matches no track', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 10, 40);
    const populated = { ...track, clips: [clip] };
    const fakeTrackId = 'does-not-exist' as TrackId;
    expect(getClipsInFrameRange([populated], 0, 100, [fakeTrackId])).toEqual([]);
  });

  it('undefined trackIds means no filter (backwards-compat)', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('audio');
    const c1 = makeClip(track1.id, 10, 40);
    const c2 = makeClip(track2.id, 15, 35);
    const t1 = { ...track1, clips: [c1] };
    const t2 = { ...track2, clips: [c2] };
    expect(getClipsInFrameRange([t1, t2], 0, 100)).toHaveLength(2);
    expect(getClipsInFrameRange([t1, t2], 0, 100, undefined)).toHaveLength(2);
  });
});

describe('findOverlappingClips', () => {
  it('returns empty array when no other clips on track', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    const populated = { ...track, clips: [clip] };
    expect(findOverlappingClips(populated, clip)).toEqual([]);
  });

  it('returns overlapping clip', () => {
    const track = createTrack('video');
    const clipA = makeClip(track.id, 0, 20);
    const clipB = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [clipA, clipB] };
    const result = findOverlappingClips(populated, clipA);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(clipB.id);
  });

  it('excludes the target clip itself', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    const populated = { ...track, clips: [clip] };
    expect(findOverlappingClips(populated, clip)).toHaveLength(0);
  });

  it('respects excludeClipId parameter', () => {
    const track = createTrack('video');
    const clipA = makeClip(track.id, 0, 20);
    const clipB = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [clipA, clipB] };
    // excludeClipId = clipB.id, so clipB won't be returned even though it overlaps
    const result = findOverlappingClips(populated, clipA, clipB.id);
    expect(result).toHaveLength(0);
  });

  it('does not return non-overlapping clips', () => {
    const track = createTrack('video');
    const clipA = makeClip(track.id, 0, 10);
    const clipB = makeClip(track.id, 20, 30);
    const populated = { ...track, clips: [clipA, clipB] };
    expect(findOverlappingClips(populated, clipA)).toHaveLength(0);
  });
});

describe('wouldOverlap', () => {
  it('returns false when track is empty', () => {
    const track = createTrack('video');
    const clip = makeClip(track.id, 0, 30);
    expect(wouldOverlap(track, clip)).toBe(false);
  });

  it('returns true when clip overlaps another on track', () => {
    const track = createTrack('video');
    const existing = makeClip(track.id, 0, 20);
    const newClip = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [existing] };
    expect(wouldOverlap(populated, newClip)).toBe(true);
  });

  it('returns false for adjacent clips', () => {
    const track = createTrack('video');
    const existing = makeClip(track.id, 0, 10);
    const newClip = makeClip(track.id, 10, 20);
    const populated = { ...track, clips: [existing] };
    expect(wouldOverlap(populated, newClip)).toBe(false);
  });

  it('respects excludeClipId parameter', () => {
    const track = createTrack('video');
    const existing = makeClip(track.id, 0, 20);
    const newClip = makeClip(track.id, 10, 30);
    const populated = { ...track, clips: [existing] };
    expect(wouldOverlap(populated, newClip, existing.id)).toBe(false);
  });
});
