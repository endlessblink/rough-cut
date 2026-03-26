import { describe, it, expect } from 'vitest';
import { createTrack, createClip } from '@rough-cut/project-model';
import type { AssetId } from '@rough-cut/project-model';
import { snapToNearestEdge } from './snap.js';

const assetId = 'asset-1' as AssetId;

function makeClip(track: ReturnType<typeof createTrack>, timelineIn: number, timelineOut: number) {
  return createClip(assetId, track.id, {
    timelineIn,
    timelineOut,
    sourceIn: 0,
    sourceOut: timelineOut - timelineIn,
  });
}

describe('snapToNearestEdge', () => {
  it('returns original frame with snapped=false when no tracks', () => {
    const result = snapToNearestEdge(50, [], 5);
    expect(result.frame).toBe(50);
    expect(result.snapped).toBe(false);
    expect(result.snapTarget).toBeUndefined();
  });

  it('returns original frame with snapped=false when no clips', () => {
    const track = createTrack('video');
    const result = snapToNearestEdge(50, [track], 5);
    expect(result.frame).toBe(50);
    expect(result.snapped).toBe(false);
  });

  it('snaps to timelineIn when within threshold', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 30, 60);
    const populated = { ...track, clips: [clip] };
    // frame=32, timelineIn=30, distance=2, threshold=5 => should snap
    const result = snapToNearestEdge(32, [populated], 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(30);
    expect(result.snapTarget).toBe(30);
  });

  it('snaps to timelineOut when within threshold', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 30, 60);
    const populated = { ...track, clips: [clip] };
    // frame=57, timelineOut=60, distance=3, threshold=5 => should snap
    const result = snapToNearestEdge(57, [populated], 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(60);
    expect(result.snapTarget).toBe(60);
  });

  it('does not snap when frame is outside threshold', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 30, 60);
    const populated = { ...track, clips: [clip] };
    // frame=20, timelineIn=30, distance=10, threshold=5 => should not snap
    const result = snapToNearestEdge(20, [populated], 5);
    expect(result.snapped).toBe(false);
    expect(result.frame).toBe(20);
    expect(result.snapTarget).toBeUndefined();
  });

  it('snaps to nearest edge when two edges are both within threshold', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 30, 60);
    const clip2 = makeClip(track, 65, 90);
    const populated = { ...track, clips: [clip1, clip2] };
    // frame=62: distance to clip1.timelineOut(60)=2, distance to clip2.timelineIn(65)=3
    // Should snap to 60 (nearer)
    const result = snapToNearestEdge(62, [populated], 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(60);
  });

  it('snaps at exact threshold distance', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 30, 60);
    const populated = { ...track, clips: [clip] };
    // distance exactly equals threshold
    const result = snapToNearestEdge(25, [populated], 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(30);
  });

  it('does not snap to excluded clip edges', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 30, 60);
    const clip2 = makeClip(track, 80, 100);
    const populated = { ...track, clips: [clip1, clip2] };
    // frame=32, clip1.timelineIn=30 is within threshold=5 but clip1 is excluded
    // clip2.timelineIn=80 is far away
    const result = snapToNearestEdge(32, [populated], 5, clip1.id);
    expect(result.snapped).toBe(false);
    expect(result.frame).toBe(32);
  });

  it('snaps to non-excluded clip when excluded clip is also within threshold', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 30, 60);
    const clip2 = makeClip(track, 33, 50);
    const populated = { ...track, clips: [clip1, clip2] };
    // frame=32: clip1.timelineIn=30 (dist=2, excluded), clip2.timelineIn=33 (dist=1, not excluded)
    const result = snapToNearestEdge(32, [populated], 5, clip1.id);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(33);
  });

  it('works across multiple tracks', () => {
    const track1 = createTrack('video');
    const track2 = createTrack('audio');
    const clip1 = makeClip(track1, 0, 30);
    const clip2 = makeClip(track2, 100, 150);
    const t1 = { ...track1, clips: [clip1] };
    const t2 = { ...track2, clips: [clip2] };
    // frame=97: clip2.timelineIn=100, distance=3, threshold=5
    const result = snapToNearestEdge(97, [t1, t2], 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(100);
  });
});
