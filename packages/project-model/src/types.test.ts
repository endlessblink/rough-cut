import { describe, it, expect } from 'vitest';
import type { ClipId, TrackId, AssetId, ProjectId } from './types.js';

describe('Branded types', () => {
  it('branded IDs are assignable from string casts', () => {
    const clipId = 'abc' as unknown as ClipId;
    const trackId = 'def' as unknown as TrackId;
    const assetId = 'ghi' as unknown as AssetId;
    const projectId = 'jkl' as unknown as ProjectId;

    // At runtime they're just strings
    expect(typeof clipId).toBe('string');
    expect(typeof trackId).toBe('string');
    expect(typeof assetId).toBe('string');
    expect(typeof projectId).toBe('string');
  });

  it('branded IDs can be used as regular strings', () => {
    const id = 'test-id' as unknown as ClipId;
    expect(id.startsWith('test')).toBe(true);
    expect(id.length).toBe(7);
  });
});
