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
});
