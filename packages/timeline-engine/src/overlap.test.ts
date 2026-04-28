import { describe, it, expect } from 'vitest';
import { createTrack, createClip } from '@rough-cut/project-model';
import type { AssetId, TrackId } from '@rough-cut/project-model';
import { resolveOverlaps } from './overlap.js';

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

describe('resolveOverlaps', () => {
  const track = createTrack('video');

  it('returns clips unchanged when there are no overlaps', () => {
    const clips = [
      makeClip(track.id, 0, 10),
      makeClip(track.id, 20, 30),
    ];
    const result = resolveOverlaps(clips, 10, 20);
    expect(result).toHaveLength(2);
    expect(result[0].timelineIn).toBe(0);
    expect(result[0].timelineOut).toBe(10);
    expect(result[1].timelineIn).toBe(20);
    expect(result[1].timelineOut).toBe(30);
  });

  it('removes a fully covered clip', () => {
    const clips = [makeClip(track.id, 10, 20)];
    const result = resolveOverlaps(clips, 5, 25);
    expect(result).toHaveLength(0);
  });

  it('trims right side when drop overlaps the right edge', () => {
    const clip = makeClip(track.id, 0, 30, 0);
    const result = resolveOverlaps([clip], 20, 40);
    expect(result).toHaveLength(1);
    expect(result[0].timelineIn).toBe(0);
    expect(result[0].timelineOut).toBe(20);
    expect(result[0].sourceIn).toBe(0);
    expect(result[0].sourceOut).toBe(20);
  });

  it('trims left side when drop overlaps the left edge', () => {
    const clip = makeClip(track.id, 10, 40, 0);
    const result = resolveOverlaps([clip], 0, 20);
    expect(result).toHaveLength(1);
    expect(result[0].timelineIn).toBe(20);
    expect(result[0].timelineOut).toBe(40);
    expect(result[0].sourceIn).toBe(10);
    expect(result[0].sourceOut).toBe(30);
  });

  it('splits a clip into two pieces when drop lands in the middle', () => {
    const clip = makeClip(track.id, 0, 60, 0);
    const result = resolveOverlaps([clip], 20, 40);
    expect(result).toHaveLength(2);

    const left = result[0];
    expect(left.timelineIn).toBe(0);
    expect(left.timelineOut).toBe(20);
    expect(left.sourceIn).toBe(0);
    expect(left.sourceOut).toBe(20);

    const right = result[1];
    expect(right.timelineIn).toBe(40);
    expect(right.timelineOut).toBe(60);
    expect(right.sourceIn).toBe(40);
    expect(right.sourceOut).toBe(60);
  });

  it('handles multiple overlaps at once', () => {
    const clips = [
      makeClip(track.id, 0, 20, 0),
      makeClip(track.id, 25, 35, 0),
      makeClip(track.id, 40, 60, 0),
    ];
    const result = resolveOverlaps(clips, 10, 50);

    expect(result).toHaveLength(2);

    expect(result[0].timelineIn).toBe(0);
    expect(result[0].timelineOut).toBe(10);

    expect(result[1].timelineIn).toBe(50);
    expect(result[1].timelineOut).toBe(60);
  });

  it('removes a clip when drop zone exactly matches it', () => {
    const clip = makeClip(track.id, 10, 30);
    const result = resolveOverlaps([clip], 10, 30);
    expect(result).toHaveLength(0);
  });

  it('leaves adjacent (touching) clips unchanged', () => {
    const clips = [
      makeClip(track.id, 0, 10),
      makeClip(track.id, 20, 30),
    ];
    const result = resolveOverlaps(clips, 10, 20);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(clips[0].id);
    expect(result[1].id).toBe(clips[1].id);
  });

  it('preserves sourceIn offset when trimming right side', () => {
    const clip = makeClip(track.id, 100, 200, 50);
    const result = resolveOverlaps([clip], 150, 250);
    expect(result).toHaveLength(1);
    expect(result[0].timelineIn).toBe(100);
    expect(result[0].timelineOut).toBe(150);
    expect(result[0].sourceIn).toBe(50);
    expect(result[0].sourceOut).toBe(100);
  });

  it('preserves sourceIn offset when trimming left side', () => {
    const clip = makeClip(track.id, 100, 200, 50);
    const result = resolveOverlaps([clip], 50, 150);
    expect(result).toHaveLength(1);
    expect(result[0].timelineIn).toBe(150);
    expect(result[0].timelineOut).toBe(200);
    expect(result[0].sourceIn).toBe(100);
    expect(result[0].sourceOut).toBe(150);
  });

  it('preserves sourceIn offset when splitting in the middle', () => {
    const clip = makeClip(track.id, 100, 200, 50);
    const result = resolveOverlaps([clip], 130, 170);
    expect(result).toHaveLength(2);

    const left = result[0];
    expect(left.timelineIn).toBe(100);
    expect(left.timelineOut).toBe(130);
    expect(left.sourceIn).toBe(50);
    expect(left.sourceOut).toBe(80);

    const right = result[1];
    expect(right.timelineIn).toBe(170);
    expect(right.timelineOut).toBe(200);
    expect(right.sourceIn).toBe(120);
    expect(right.sourceOut).toBe(150);
  });

  it('generates new IDs for split pieces', () => {
    const clip = makeClip(track.id, 0, 60);
    const result = resolveOverlaps([clip], 20, 40);
    expect(result[0].id).not.toBe(clip.id);
    expect(result[1].id).not.toBe(clip.id);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('returns empty array when all clips are fully covered', () => {
    const clips = [
      makeClip(track.id, 5, 10),
      makeClip(track.id, 12, 18),
    ];
    const result = resolveOverlaps(clips, 0, 20);
    expect(result).toHaveLength(0);
  });
});
