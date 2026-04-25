import { describe, it, expect } from 'vitest';
import { migrate, getMigrationChain } from './migrations.js';
import { createProject } from './factories.js';
import { CURRENT_SCHEMA_VERSION } from './constants.js';

describe('migrations', () => {
  it('passes through a document at current version unchanged', () => {
    const project = createProject();
    const result = migrate(project);
    expect(result).toEqual(project);
  });

  it('rejects documents with version > CURRENT_SCHEMA_VERSION', () => {
    const project = createProject();
    const future = { ...project, version: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrate(future)).toThrow(/newer than supported/);
  });

  it('rejects non-object input', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate('string')).toThrow();
    expect(() => migrate(42)).toThrow();
  });

  it('rejects documents without a version field', () => {
    expect(() => migrate({})).toThrow(/version/);
  });

  it('getMigrationChain returns empty array for current version', () => {
    const chain = getMigrationChain(CURRENT_SCHEMA_VERSION);
    expect(chain).toEqual([]);
  });

  it('result validates against current schema', () => {
    const project = createProject();
    const result = migrate(project);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.id).toBe(project.id);
  });

  it('migrates version 4 documents by adding empty library references', () => {
    const project = createProject();
    const legacy = { ...project, version: 4, libraryReferences: undefined };
    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.libraryReferences).toEqual([]);
  });

  it('migrates version 5 documents by backfilling a default recording template id', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 5,
      assets: [
        {
          id: 'recording-1',
          type: 'recording',
          filePath: '/tmp/recording.webm',
          duration: 90,
          metadata: {},
          presentation: {
            zoom: {
              autoIntensity: 0.5,
              followCursor: true,
              followAnimation: 'focused',
              followPadding: 0.18,
              markers: [],
            },
            cursor: {
              style: 'default',
              clickEffect: 'ripple',
              sizePercent: 100,
              clickSoundEnabled: false,
            },
            camera: {
              shape: 'rounded',
              aspectRatio: '1:1',
              position: 'corner-br',
              roundness: 50,
              size: 100,
              visible: true,
              padding: 0,
              inset: 0,
              insetColor: '#ffffff',
              shadowEnabled: true,
              shadowBlur: 24,
              shadowOpacity: 0.45,
            },
          },
        },
      ],
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.assets[0]?.presentation?.templateId).toBe('screen-cam-br-16x9');
  });

  it('migrates version 6 documents by backfilling a null destination preset id', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 6,
      settings: {
        ...project.settings,
        destinationPresetId: undefined,
      },
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.settings.destinationPresetId).toBeNull();
  });

  it('migrates version 1 documents with no aiAnnotations to a full default', () => {
    const project = createProject();
    const { aiAnnotations: _ai, libraryReferences: _lib, motionCompositions: _mc, ...base } =
      project as unknown as Record<string, unknown>;
    const legacy = { ...base, version: 1 };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.aiAnnotations.captionSegments).toEqual([]);
    expect(result.aiAnnotations.captionStyle).toMatchObject({
      fontSize: 28,
      position: 'bottom',
      backgroundOpacity: 0.55,
    });
  });

  it('migrates version 2 documents with no aiAnnotations to a full default', () => {
    const project = createProject();
    const { aiAnnotations: _ai, libraryReferences: _lib, motionCompositions: _mc, ...base } =
      project as unknown as Record<string, unknown>;
    const legacy = { ...base, version: 2 };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.aiAnnotations.captionStyle.fontSize).toBe(28);
  });

  it('backfills captionStyle on version 3 documents that already have captionSegments', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 3,
      aiAnnotations: { captionSegments: [] },
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.aiAnnotations.captionStyle).toMatchObject({
      fontSize: 28,
      position: 'bottom',
      backgroundOpacity: 0.55,
    });
  });

  it('backfills captionStyle on version 4 documents without dropping existing captionSegments', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 4,
      aiAnnotations: {
        captionSegments: [
          {
            id: 'seg-1',
            assetId: 'asset-1',
            status: 'pending',
            confidence: 0.9,
            startFrame: 0,
            endFrame: 30,
            text: 'hello',
            words: [],
          },
        ],
      },
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.aiAnnotations.captionSegments).toHaveLength(1);
    expect(result.aiAnnotations.captionSegments[0]?.id).toBe('seg-1');
    expect(result.aiAnnotations.captionStyle.fontSize).toBe(28);
  });

  it('preserves a pre-existing captionStyle when migrating to the current version', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 7,
      aiAnnotations: {
        captionSegments: [],
        captionStyle: { fontSize: 48, position: 'center', backgroundOpacity: 0.2 },
      },
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.aiAnnotations.captionStyle).toEqual({
      fontSize: 48,
      position: 'center',
      backgroundOpacity: 0.2,
    });
  });

  it('backfills required Clip fields missing from legacy v8 saves', () => {
    const project = createProject();
    const audioTrack = project.composition.tracks.find((t) => t.type === 'audio');
    if (!audioTrack) throw new Error('expected an audio track in default project');

    const legacy = {
      ...project,
      version: 8,
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((t) =>
          t.id === audioTrack.id
            ? {
                ...t,
                clips: [
                  {
                    id: 'clip-legacy',
                    assetId: 'asset-legacy',
                    timelineIn: 0,
                    timelineOut: 30,
                    sourceIn: 0,
                    sourceOut: 30,
                  },
                ],
              }
            : t,
        ),
      },
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    const audioOut = result.composition.tracks.find((t) => t.id === audioTrack.id);
    const clip = audioOut?.clips[0];
    expect(clip?.trackId).toBe(audioTrack.id);
    expect(clip?.enabled).toBe(true);
    expect(clip?.effects).toEqual([]);
    expect(clip?.keyframes).toEqual([]);
    expect(clip?.transform).toBeDefined();
  });
});
