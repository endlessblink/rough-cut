import { describe, expect, it } from 'vitest';
import { createAsset, createProject } from './factories.js';
import {
  DEFAULT_STABILIZATION_STRENGTH,
  getSourceStabilization,
  isStabilizableProjectAsset,
  normalizeStabilizationStrength,
  setSourceStabilization,
} from './stabilization.js';

describe('source stabilization', () => {
  it('accepts imported and camera video assets but not screen recordings', () => {
    expect(isStabilizableProjectAsset({ type: 'video', metadata: {} })).toBe(true);
    expect(isStabilizableProjectAsset({ type: 'video', metadata: { isCamera: true } })).toBe(true);
    expect(isStabilizableProjectAsset({ type: 'recording', metadata: {} })).toBe(false);
    expect(isStabilizableProjectAsset({ type: 'audio', metadata: {} })).toBe(false);
  });

  it('normalizes strength to a stable integer percentage', () => {
    expect(normalizeStabilizationStrength(undefined)).toBe(DEFAULT_STABILIZATION_STRENGTH);
    expect(normalizeStabilizationStrength(63.7)).toBe(64);
    expect(normalizeStabilizationStrength(-1)).toBe(0);
    expect(normalizeStabilizationStrength(101)).toBe(100);
  });

  it('creates and updates one source-owned effect without duplicating it', () => {
    const project = createProject({
      assets: [createAsset('video', '/tmp/imported.mp4')],
    });
    const sourceId = project.timeline.sources[0]!.id;
    const enabled = setSourceStabilization(project.timeline, sourceId, {
      enabled: true,
      strength: 62,
    });

    expect(getSourceStabilization(enabled, sourceId)).toMatchObject({
      kind: 'stabilization',
      ownerType: 'source',
      ownerId: sourceId,
      enabled: true,
      params: { strength: 62, methodVersion: 1 },
    });

    const disabled = setSourceStabilization(enabled, sourceId, {
      enabled: false,
      strength: 41,
    });
    expect(disabled.effects.filter((effect) => effect.kind === 'stabilization')).toHaveLength(1);
    expect(getSourceStabilization(disabled, sourceId)).toMatchObject({
      enabled: false,
      params: { strength: 41, methodVersion: 1 },
    });
  });

  it('rejects an unknown source instead of persisting an orphan effect', () => {
    const project = createProject({
      assets: [createAsset('video', '/tmp/imported.mp4')],
    });
    expect(() => setSourceStabilization(project.timeline, 'source:missing', {
      enabled: true,
      strength: 50,
    })).toThrow('Stabilization source not found');
  });
});
