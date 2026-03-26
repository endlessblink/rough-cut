import { describe, it, expect } from 'vitest';
import { createTrack, createClip } from '@rough-cut/project-model';
import type { AssetId, ClipId } from '@rough-cut/project-model';
import {
  addClipToTrack,
  removeClipFromTrack,
  replaceClipOnTrack,
  getTrackEndFrame,
} from './track-operations.js';

const assetId = 'asset-1' as AssetId;

function makeClip(track: ReturnType<typeof createTrack>, timelineIn: number, timelineOut: number) {
  return createClip(assetId, track.id, {
    timelineIn,
    timelineOut,
    sourceIn: 0,
    sourceOut: timelineOut - timelineIn,
  });
}

describe('addClipToTrack', () => {
  it('adds clip to an empty track', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const result = addClipToTrack(track, clip);
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]!.id).toBe(clip.id);
  });

  it('appends clip to existing clips', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 30);
    const clip2 = makeClip(track, 30, 60);
    const populated = addClipToTrack(track, clip1);
    const result = addClipToTrack(populated, clip2);
    expect(result.clips).toHaveLength(2);
    expect(result.clips[1]!.id).toBe(clip2.id);
  });

  it('does not mutate the original track', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    addClipToTrack(track, clip);
    expect(track.clips).toHaveLength(0);
  });

  it('preserves all other track properties', () => {
    const track = createTrack('video', { name: 'My Track', locked: true, volume: 0.5 });
    const clip = makeClip(track, 0, 30);
    const result = addClipToTrack(track, clip);
    expect(result.name).toBe('My Track');
    expect(result.locked).toBe(true);
    expect(result.volume).toBe(0.5);
    expect(result.id).toBe(track.id);
  });
});

describe('removeClipFromTrack', () => {
  it('removes a clip by ID', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip] };
    const result = removeClipFromTrack(populated, clip.id);
    expect(result.clips).toHaveLength(0);
  });

  it('only removes the specified clip', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 30);
    const clip2 = makeClip(track, 30, 60);
    const populated = { ...track, clips: [clip1, clip2] };
    const result = removeClipFromTrack(populated, clip1.id);
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]!.id).toBe(clip2.id);
  });

  it('returns same track if clip ID not found', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip] };
    const result = removeClipFromTrack(populated, 'nonexistent-id' as ClipId);
    expect(result.clips).toHaveLength(1);
  });

  it('does not mutate original track', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip] };
    removeClipFromTrack(populated, clip.id);
    expect(populated.clips).toHaveLength(1);
  });
});

describe('replaceClipOnTrack', () => {
  it('replaces a clip with a single new clip', () => {
    const track = createTrack('video');
    const original = makeClip(track, 0, 30);
    const replacement = makeClip(track, 0, 15);
    const populated = { ...track, clips: [original] };
    const result = replaceClipOnTrack(populated, original.id, replacement);
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]!.id).toBe(replacement.id);
  });

  it('replaces a clip with multiple clips (e.g. after split)', () => {
    const track = createTrack('video');
    const original = makeClip(track, 0, 30);
    const left = makeClip(track, 0, 15);
    const right = makeClip(track, 15, 30);
    const populated = { ...track, clips: [original] };
    const result = replaceClipOnTrack(populated, original.id, left, right);
    expect(result.clips).toHaveLength(2);
    expect(result.clips[0]!.id).toBe(left.id);
    expect(result.clips[1]!.id).toBe(right.id);
  });

  it('preserves order of surrounding clips', () => {
    const track = createTrack('video');
    const before = makeClip(track, 0, 10);
    const target = makeClip(track, 10, 20);
    const after = makeClip(track, 20, 30);
    const replacement = makeClip(track, 10, 20);
    const populated = { ...track, clips: [before, target, after] };
    const result = replaceClipOnTrack(populated, target.id, replacement);
    expect(result.clips).toHaveLength(3);
    expect(result.clips[0]!.id).toBe(before.id);
    expect(result.clips[1]!.id).toBe(replacement.id);
    expect(result.clips[2]!.id).toBe(after.id);
  });

  it('leaves track unchanged if clip ID not found', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip] };
    const result = replaceClipOnTrack(populated, 'nonexistent-id' as ClipId, makeClip(track, 0, 10));
    expect(result.clips).toHaveLength(1);
    expect(result.clips[0]!.id).toBe(clip.id);
  });

  it('can replace with zero clips (effectively remove)', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip] };
    const result = replaceClipOnTrack(populated, clip.id);
    expect(result.clips).toHaveLength(0);
  });
});

describe('getTrackEndFrame', () => {
  it('returns 0 for empty track', () => {
    const track = createTrack('video');
    expect(getTrackEndFrame(track)).toBe(0);
  });

  it('returns timelineOut of the only clip', () => {
    const track = createTrack('video');
    const clip = makeClip(track, 10, 50);
    const populated = { ...track, clips: [clip] };
    expect(getTrackEndFrame(populated)).toBe(50);
  });

  it('returns max timelineOut across multiple clips', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 0, 30);
    const clip2 = makeClip(track, 40, 100);
    const clip3 = makeClip(track, 50, 75);
    const populated = { ...track, clips: [clip1, clip2, clip3] };
    expect(getTrackEndFrame(populated)).toBe(100);
  });

  it('handles clips out of order', () => {
    const track = createTrack('video');
    const clip1 = makeClip(track, 50, 80);
    const clip2 = makeClip(track, 0, 30);
    const populated = { ...track, clips: [clip1, clip2] };
    expect(getTrackEndFrame(populated)).toBe(80);
  });
});
