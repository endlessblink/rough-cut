import { describe, it, expect } from 'vitest';
import { migrate, getMigrationChain } from './migrations.js';
import { createAsset, createClip, createDefaultRecordingPresentation, createProject, createTrack } from './factories.js';
import { CURRENT_SCHEMA_VERSION } from './constants.js';
import type { ProjectDocument } from './types.js';

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

  it('backfills exportSettings.keepClickSounds on legacy v9 saves', () => {
    const project = createProject();
    const { keepClickSounds: _drop, ...legacyExport } = project.exportSettings;
    const legacy = {
      ...project,
      version: 9,
      exportSettings: legacyExport,
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.exportSettings.keepClickSounds).toBe(true);
  });

  it('migrates version 10 documents by backfilling auto aspect ratio', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 10,
      settings: {
        ...project.settings,
        aspectRatio: undefined,
      },
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.settings.aspectRatio).toBe('auto');
  });

  it('migrates version 11 sibling recording asset paths to relative with absolute fallback', () => {
    const project = createProject({ name: 'capture' });
    const legacy = {
      ...project,
      version: 11,
      assets: [
        {
          id: 'recording-1',
          type: 'recording',
          filePath: '/tmp/rough-cut-test/capture.mp4',
          duration: 90,
          metadata: {},
        },
        {
          id: 'camera-1',
          type: 'video',
          filePath: '/tmp/rough-cut-test/capture-camera.mp4',
          duration: 90,
          metadata: { isCamera: true },
        },
      ],
    };

    const result = migrate(legacy);

    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.assets[0]?.filePath).toBe('capture.mp4');
    expect(result.assets[0]?.pathMode).toBe('relative');
    expect(result.assets[0]?.metadata.absoluteFilePath).toBe('/tmp/rough-cut-test/capture.mp4');
    expect(result.assets[1]?.filePath).toBe('capture-camera.mp4');
    expect(result.assets[1]?.pathMode).toBe('relative');
    expect(result.assets[1]?.metadata.absoluteFilePath).toBe('/tmp/rough-cut-test/capture-camera.mp4');
  });

  it('migrates version 11 non-sibling absolute asset paths as absolute', () => {
    const project = createProject({ name: 'capture' });
    const legacy = {
      ...project,
      version: 11,
      assets: [
        {
          id: 'recording-1',
          type: 'recording',
          filePath: '/tmp/shared/other.mp4',
          duration: 90,
          metadata: {},
        },
      ],
    };

    const result = migrate(legacy);

    expect(result.assets[0]?.filePath).toBe('/tmp/shared/other.mp4');
    expect(result.assets[0]?.pathMode).toBe('absolute');
  });

  it('migrates version 1 documents by backfilling zoom marker focalPoint and durations', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 1,
      assets: [
        {
          id: 'recording-1',
          type: 'recording',
          filePath: '/tmp/recording.webm',
          duration: 90,
          metadata: {},
          presentation: {
            templateId: 'screen-cam-br-16x9',
            zoom: {
              autoIntensity: 0.5,
              followCursor: true,
              followAnimation: 'focused',
              followPadding: 0.18,
              markers: [
                {
                  id: 'zoom-legacy',
                  startFrame: 30,
                  endFrame: 90,
                  kind: 'manual',
                  strength: 1,
                },
              ],
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
    const marker = result.assets[0]?.presentation?.zoom.markers[0];
    expect(marker?.focalPoint).toEqual({ x: 0.5, y: 0.5 });
    expect(marker?.zoomInDuration).toBe(18);
    expect(marker?.zoomOutDuration).toBe(18);
  });

  it('preserves pre-existing zoom marker focalPoint and durations when migrating from v1', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 1,
      assets: [
        {
          id: 'recording-1',
          type: 'recording',
          filePath: '/tmp/recording.webm',
          duration: 90,
          metadata: {},
          presentation: {
            templateId: 'screen-cam-br-16x9',
            zoom: {
              autoIntensity: 0.5,
              followCursor: true,
              followAnimation: 'focused',
              followPadding: 0.18,
              markers: [
                {
                  id: 'zoom-existing',
                  startFrame: 30,
                  endFrame: 90,
                  kind: 'manual',
                  strength: 0.8,
                  focalPoint: { x: 0.25, y: 0.75 },
                  zoomInDuration: 12,
                  zoomOutDuration: 18,
                },
              ],
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
    const marker = result.assets[0]?.presentation?.zoom.markers[0];
    expect(marker?.focalPoint).toEqual({ x: 0.25, y: 0.75 });
    expect(marker?.zoomInDuration).toBe(12);
    expect(marker?.zoomOutDuration).toBe(18);
  });

  it('migrates a v12 document through v15 with generalized NLE tracks and shared timeline', () => {
    // Build a realistic v12 fixture by taking a current-version project, then
    // stripping the optional AI fields and rewinding `version` to 12.
    const project = createProject();
    const {
      transcript: _t,
      captionTracks: _ct,
      tracks: _tr,
      ...v12Base
    } = project as ProjectDocument & Record<string, unknown>;
    const legacy = { ...v12Base, version: 12 };

    const result = migrate(legacy);

    expect(result.version).toBe(15);
    expect(result.transcript).toBeUndefined();
    expect(result.captionTracks).toBeUndefined();
    expect(result.tracks).toHaveLength(project.composition.tracks.length);
    expect(result.tracks?.[0]).toMatchObject({
      id: project.composition.tracks[0]?.id,
      kind: project.composition.tracks[0]?.type,
      label: project.composition.tracks[0]?.name,
      index: project.composition.tracks[0]?.index,
    });
    expect(result.timeline.tracks).toEqual(result.tracks);
    expect(result.timeline.exportSettings).toEqual(result.exportSettings);
  });

  it('treats a current document as a no-op (re-migration is idempotent)', () => {
    const project = createProject();
    const result1 = migrate(project);
    const result2 = migrate(result1);
    expect(result2).toEqual(result1);
    expect(result2.version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('preserves AI fields when they are already populated through migration', () => {
    const project = createProject();
    const legacy: Record<string, unknown> = {
      ...(project as unknown as Record<string, unknown>),
      version: 12,
      transcript: { words: [], paragraphs: [], nonSpeech: [] },
      captionTracks: [{ id: 'ct-pre', style: 'karaoke', phrases: [] }],
      tracks: [
        {
          id: 'nle-pre',
          kind: 'audio',
          index: 0,
          label: 'Generated VO',
          enabled: true,
          locked: false,
          muted: false,
          clips: [],
        },
      ],
    };

    const result = migrate(legacy);

    expect(result.version).toBe(15);
    expect(result.transcript).toEqual({ words: [], paragraphs: [], nonSpeech: [] });
    expect(result.captionTracks).toHaveLength(1);
    expect(result.captionTracks?.[0]?.id).toBe('ct-pre');
    expect(result.tracks?.[0]?.id).toBe('nle-pre');
  });

  it('chains v1 → v15 end-to-end for an ancient document', () => {
    // Reuse the existing v1 fixture shape (zoom-marker backfill case) but
    // verify it ends at the current version and includes the shared timeline.
    const project = createProject();
    const legacy = {
      ...project,
      version: 1,
      assets: [
        {
          id: 'recording-1',
          type: 'recording',
          filePath: '/tmp/recording.webm',
          duration: 90,
          metadata: {},
          presentation: {
            templateId: 'screen-cam-br-16x9',
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

    expect(result.version).toBe(15);
    expect(result.transcript).toBeUndefined();
    expect(result.captionTracks).toBeUndefined();
    expect(result.tracks).toHaveLength(project.composition.tracks.length);
    expect(result.timeline.tracks).toEqual(result.tracks);
  });

  it('backfills v13 documents with empty NLE tracks for blank projects', () => {
    const project = createProject({ composition: { duration: 0, tracks: [], transitions: [] } });
    const legacy = { ...project, version: 13, tracks: undefined } as Record<string, unknown>;

    const result = migrate(legacy);

    expect(result.version).toBe(15);
    expect(result.tracks).toEqual([]);
    expect(result.timeline.tracks).toEqual([]);
  });

  it('backfills recording cut ranges into shared timeline markers', () => {
    const project = createProject();
    const recording = createAsset('recording', '/tmp/recording.webm', {
      duration: 300,
      presentation: {
        ...createDefaultRecordingPresentation(),
        cutRanges: [{ id: 'cut-1' as never, startFrame: 30, endFrame: 60 }],
      },
    });
    const { timeline: _timeline, ...withoutTimeline } = {
      ...project,
      version: 14,
      assets: [recording],
    } as ProjectDocument & Record<string, unknown>;

    const result = migrate(withoutTimeline);

    expect(result.version).toBe(15);
    expect(result.timeline.markers).toContainEqual({
      id: 'cut-1',
      kind: 'cut',
      startFrame: 30,
      endFrame: 60,
      linkedGroupId: `linked:${recording.id}`,
      params: { range: { id: 'cut-1', startFrame: 30, endFrame: 60 } },
    });
  });

  it('backfills recording head/tail trims into shared timeline track clips', () => {
    const recording = createAsset('recording', '/tmp/recording.webm', { duration: 300 });
    const track = createTrack('video', { name: 'Screen Recording', index: 0 });
    const clip = createClip(recording.id, track.id, {
      timelineIn: 0,
      timelineOut: 210,
      sourceIn: 30,
      sourceOut: 240,
    });
    const project = createProject({
      assets: [recording],
      composition: { duration: 210, tracks: [{ ...track, clips: [clip] }], transitions: [] },
    });
    const { tracks: _tracks, timeline: _timeline, ...legacy } = {
      ...project,
      version: 13,
    } as ProjectDocument & Record<string, unknown>;

    const result = migrate(legacy);
    const timelineClip = result.timeline.tracks[0]?.clips[0];

    expect(result.version).toBe(15);
    expect(timelineClip).toMatchObject({
      id: clip.id,
      timelineIn: 0,
      timelineOut: 210,
      sourceIn: 30,
      sourceOut: 240,
    });
  });

  it('preserves an existing keepClickSounds=false on v9 -> v10', () => {
    const project = createProject();
    const legacy = {
      ...project,
      version: 9,
      exportSettings: { ...project.exportSettings, keepClickSounds: false },
    };

    const result = migrate(legacy);
    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.exportSettings.keepClickSounds).toBe(false);
  });
});
