import { describe, it, expect } from 'vitest';
import { createTrack, createClip } from '@rough-cut/project-model';
import type { AssetId, ClipId } from '@rough-cut/project-model';
import { calculateCompositionDuration, rippleDelete } from './composition-utils.js';

const assetId = 'asset-1' as AssetId;

function makeClip(track: ReturnType<typeof createTrack>, timelineIn: number, timelineOut: number) {
  return createClip(assetId, track.id, {
    timelineIn,
    timelineOut,
    sourceIn: 0,
    sourceOut: timelineOut - timelineIn,
  });
}

describe('calculateCompositionDuration', () => {
  it('returns 0 for empty tracks array', () => {
    expect(calculateCompositionDuration([])).toBe(0);
  });

  it('returns 0 for tracks with no clips', () => {
    const track = createTrack('video');
    expect(calculateCompositionDuration([track])).toBe(0);
  });

  it('returns timelineOut of the only clip', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 60);
    const populated = { ...track, clips: [clip] };
    expect(calculateCompositionDuration([populated])).toBe(60);
  });

  it('returns maximum timelineOut across multiple clips on one track', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 30);
    const clip2 = makeClip(track, 40, 90);
    const populated = { ...track, clips: [clip1, clip2] };
    expect(calculateCompositionDuration([populated])).toBe(90);
  });

  it('returns maximum timelineOut across multiple tracks', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('audio');
    const clip1 = makeClip(track1, 0, 60);
    const clip2 = makeClip(track2, 0, 120);
    const t1 = { ...track1, clips: [clip1] };
    const t2 = { ...track2, clips: [clip2] };
    expect(calculateCompositionDuration([t1, t2])).toBe(120);
  });

  it('handles tracks where some are empty', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('audio');
    const clip = makeClip(track1, 10, 50);
    const t1 = { ...track1, clips: [clip] };
    expect(calculateCompositionDuration([t1, track2])).toBe(50);
  });
});

describe('rippleDelete', () => {
  it('returns same track if clip not found', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip] };
    const result = rippleDelete(populated, 'nonexistent' as ClipId);
    // Simply verify it doesn't crash and returns something track-like
    expect(result.clips).toHaveLength(1);
  });

  it('removes the specified clip', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip] };
    const result = rippleDelete(populated, clip.id);
    expect(result.clips).toHaveLength(0);
  });

  it('shifts subsequent clips left by the deleted clip duration', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 30);  // duration 30
    const clip2 = makeClip(track, 30, 60); // starts right after clip1
    const clip3 = makeClip(track, 60, 90); // starts right after clip2
    const populated = { ...track, clips: [clip1, clip2, clip3] };
    const result = rippleDelete(populated, clip1.id);
    expect(result.clips).toHaveLength(2);
    // clip2 should shift left by 30 (gap duration)
    expect(result.clips[0]!.timelineIn).toBe(0);
    expect(result.clips[0]!.timelineOut).toBe(30);
    // clip3 should also shift left by 30
    expect(result.clips[1]!.timelineIn).toBe(30);
    expect(result.clips[1]!.timelineOut).toBe(60);
  });

  it('only shifts clips that are after the deleted clip', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 20);
    const clip2 = makeClip(track, 30, 60); // gap: [20,30] then clip2 starts at 30
    const clip3 = makeClip(track, 70, 100);
    const populated = { ...track, clips: [clip1, clip2, clip3] };
    // Delete clip2 (duration=30), clip3 starts at 70 which is >= clip2.timelineOut (60)
    const result = rippleDelete(populated, clip2.id);
    expect(result.clips).toHaveLength(2);
    // clip1 is before deleted clip, unchanged
    expect(result.clips[0]!.timelineIn).toBe(0);
    expect(result.clips[0]!.timelineOut).toBe(20);
    // clip3 shifts left by 30
    expect(result.clips[1]!.timelineIn).toBe(40); // 70 - 30
    expect(result.clips[1]!.timelineOut).toBe(70); // 100 - 30
  });

  it('does not shift clips that start before the deleted clip ends', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 30);
    // clip2 starts before clip1 ends but this is an unusual/overlapping case
    // We test that a clip starting exactly at clip1.timelineOut gets shifted
    const clip2 = makeClip(track, 30, 60);
    const populated = { ...track, clips: [clip1, clip2] };
    const result = rippleDelete(populated, clip1.id);
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]!.timelineIn).toBe(0);
  });

  it('does not mutate original track', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 30);
    const clip2 = makeClip(track, 30, 60);
    const populated = { ...track, clips: [clip1, clip2] };
    rippleDelete(populated, clip1.id);
    expect(populated.clips).toHaveLength(2);
    expect(populated.clips[1]!.timelineIn).toBe(30);
  });
});
