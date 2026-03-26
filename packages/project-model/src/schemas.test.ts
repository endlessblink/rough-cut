import { describe, it, expect } from 'vitest';
import { validateProject, ProjectDocumentSchema } from './schemas.js';
import { createProject } from './factories.js';

describe('schemas', () => {
  it('validates a correct ProjectDocument from factory', () => {
    const project = createProject();
    expect(() => validateProject(project)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => validateProject({})).toThrow();
    expect(() => validateProject({ version: 1 })).toThrow();
  });

  it('rejects negative frame values', () => {
    const project = createProject();
    const bad = {
      ...project,
      composition: {
        ...project.composition,
        duration: -1,
      },
    };
    expect(() => validateProject(bad)).toThrow();
  });

  it('rejects non-integer frame values', () => {
    const project = createProject();
    const bad = {
      ...project,
      composition: {
        ...project.composition,
        duration: 1.5,
      },
    };
    expect(() => validateProject(bad)).toThrow();
  });

  it('rejects volume outside 0-1', () => {
    const project = createProject();
    const tracks = [...project.composition.tracks];
    tracks[0] = { ...tracks[0]!, volume: 1.5 };
    const bad = {
      ...project,
      composition: { ...project.composition, tracks },
    };
    expect(() => validateProject(bad)).toThrow();
  });

  it('rejects opacity outside 0-1', () => {
    const project = createProject();
    const clip = {
      id: 'clip-1',
      assetId: 'asset-1',
      trackId: 'track-1',
      timelineIn: 0,
      timelineOut: 30,
      sourceIn: 0,
      sourceOut: 30,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: 2,
      },
      effects: [],
      keyframes: [],
    };
    const tracks = [...project.composition.tracks];
    tracks[0] = { ...tracks[0]!, clips: [clip] };
    const bad = {
      ...project,
      composition: { ...project.composition, tracks },
    };
    expect(() => validateProject(bad)).toThrow();
  });

  it('rejects odd resolution values', () => {
    const project = createProject();
    const bad = {
      ...project,
      settings: {
        ...project.settings,
        resolution: { width: 1921, height: 1080 },
      },
    };
    expect(() => validateProject(bad)).toThrow();
  });

  it('round-trip: create -> JSON.stringify -> JSON.parse -> validate -> equal', () => {
    const original = createProject();
    const json = JSON.stringify(original);
    const parsed: unknown = JSON.parse(json);
    const validated = validateProject(parsed);
    expect(validated).toEqual(original);
  });

  it('accepts valid frame rate values', () => {
    for (const frameRate of [24, 30, 60] as const) {
      const project = createProject({
        settings: {
          resolution: { width: 1920, height: 1080 },
          frameRate,
          backgroundColor: '#000000',
          sampleRate: 48000,
        },
      });
      expect(() => validateProject(project)).not.toThrow();
    }
  });

  it('rejects invalid frame rate values', () => {
    const project = createProject();
    const bad = {
      ...project,
      settings: { ...project.settings, frameRate: 25 },
    };
    expect(() => validateProject(bad)).toThrow();
  });
});
