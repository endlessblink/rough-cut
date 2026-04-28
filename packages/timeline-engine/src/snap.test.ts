import { describe, it, expect } from 'vitest';
import { createTrack, createClip } from '@rough-cut/project-model';
import type { AssetId } from '@rough-cut/project-model';
import { snapToNearestEdge, snapToPlayhead, snapToGrid } from './snap.js';

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

describe('snapToPlayhead', () => {
  it('snaps when within threshold', () => {
    const result = snapToPlayhead(97, 100, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(100);
    expect(result.snapTarget).toBe(100);
  });

  it('does not snap when outside threshold', () => {
    const result = snapToPlayhead(90, 100, 5);
    expect(result.snapped).toBe(false);
    expect(result.frame).toBe(90);
    expect(result.snapTarget).toBeUndefined();
  });

  it('snaps at exact threshold distance', () => {
    const result = snapToPlayhead(95, 100, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(100);
  });

  it('snaps when already at playhead', () => {
    const result = snapToPlayhead(100, 100, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(100);
  });

  it('handles playhead at frame 0', () => {
    const result = snapToPlayhead(2, 0, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(0);
  });
});

describe('snapToGrid', () => {
  it('snaps to nearest grid multiple when within threshold', () => {
    // grid=30, frame=32, nearest=30, distance=2, threshold=5 → snap to 30
    const result = snapToGrid(32, 30, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(30);
    expect(result.snapTarget).toBe(30);
  });

  it('snaps up to the next multiple when closer', () => {
    // grid=30, frame=58, nearest=60, distance=2, threshold=5 → snap to 60
    const result = snapToGrid(58, 30, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(60);
  });

  it('does not snap when outside threshold', () => {
    // grid=30, frame=40, nearest=30, distance=10, threshold=5 → no snap
    const result = snapToGrid(40, 30, 5);
    expect(result.snapped).toBe(false);
    expect(result.frame).toBe(40);
  });

  it('snaps to 0 when close', () => {
    const result = snapToGrid(3, 30, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(0);
  });

  it('returns original frame when gridFrames is zero', () => {
    const result = snapToGrid(50, 0, 5);
    expect(result.snapped).toBe(false);
    expect(result.frame).toBe(50);
  });

  it('returns original frame when gridFrames is negative', () => {
    const result = snapToGrid(50, -10, 5);
    expect(result.snapped).toBe(false);
    expect(result.frame).toBe(50);
  });

  it('snaps at exact threshold distance', () => {
    const result = snapToGrid(35, 30, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(30);
  });

  it('snaps exactly on grid point', () => {
    const result = snapToGrid(60, 30, 5);
    expect(result.snapped).toBe(true);
    expect(result.frame).toBe(60);
  });
});
