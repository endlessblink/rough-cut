import { describe, it, expect } from 'vitest';
import {
  validateProject,
  validateLibrary,
  ProjectDocumentSchema,
  LibraryDocumentSchema,
  ZoomMarkerSchema,
  TranscriptSchema,
  CaptionTrackSchema,
  AiAssetSchema,
  AiAssetClipReferenceSchema,
  NleTrackSchema,
  NleTrackClipSchema,
  SharedTimelineSchema,
  TimelineSourceSchema,
  CensorRegionSchema,
} from './schemas.js';
import {
  createProject,
  createLibraryDocument,
  createLibrarySource,
  createAsset,
  createZoomMarker,
  createDefaultRecordingPresentation,
} from './factories.js';

describe('schemas', () => {
  it('validates a correct ProjectDocument from factory', () => {
    const project = createProject();
    expect(() => validateProject(project)).not.toThrow();
  });

  it('validates a correct LibraryDocument from factory', () => {
    const library = createLibraryDocument();
    expect(() => validateLibrary(library)).not.toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => validateProject({})).toThrow();
    expect(() => validateProject({ version: 1 })).toThrow();
    expect(() => validateLibrary({})).toThrow();
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
      enabled: true,
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
    } as const;
    const tracks = [...project.composition.tracks];
    tracks[0] = { ...tracks[0]!, clips: [clip as never] };
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

  it('round-trip library: create -> JSON.stringify -> JSON.parse -> validate -> equal', () => {
    const original = createLibraryDocument();
    const json = JSON.stringify(original);
    const parsed: unknown = JSON.parse(json);
    const validated = validateLibrary(parsed);
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

  it('rejects invalid library documents', () => {
    const library = createLibraryDocument(undefined, {
      sources: [createLibrarySource('video', '/tmp/test.mp4')],
    });
    const bad = {
      ...library,
      sources: [{ ...library.sources[0], duration: -1 }],
    };
    expect(LibraryDocumentSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ZoomMarker', () => {
  function projectWithMarker(marker: unknown) {
    const base = createProject();
    const presentation = createDefaultRecordingPresentation();
    const asset = createAsset('recording', '/tmp/recording.webm', {
      duration: 300,
      presentation: {
        ...presentation,
        zoom: {
          ...presentation.zoom,
          markers: [marker as never],
        },
      },
    });
    return { ...base, assets: [asset] };
  }

  it('validates a project with a fully-populated manual marker', () => {
    const project = projectWithMarker(createZoomMarker(30, 90));
    expect(() => validateProject(project)).not.toThrow();
  });

  it('round-trips a project containing a manual marker through JSON', () => {
    const project = projectWithMarker(createZoomMarker(30, 90));
    const json = JSON.stringify(project);
    const parsed: unknown = JSON.parse(json);
    const validated = validateProject(parsed);
    expect(validated).toEqual(project);
  });

  it('rejects a marker missing focalPoint', () => {
    const { focalPoint: _drop, ...marker } = createZoomMarker(30, 90);
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });

  it('rejects a marker missing startFrame', () => {
    const { startFrame: _drop, ...marker } = createZoomMarker(30, 90);
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });

  it('rejects a marker missing zoomInDuration', () => {
    const { zoomInDuration: _drop, ...marker } = createZoomMarker(30, 90);
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });

  it('rejects a marker with a kind outside auto/manual', () => {
    const marker = { ...createZoomMarker(30, 90), kind: 'whatever' };
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });

  it('rejects strength outside 0–1', () => {
    const marker = { ...createZoomMarker(30, 90), strength: 1.5 };
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });

  it('rejects focalPoint coordinates outside 0–1', () => {
    const marker = {
      ...createZoomMarker(30, 90),
      focalPoint: { x: -0.1, y: 0.5 },
    };
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });

  it('rejects negative startFrame', () => {
    const marker = { ...createZoomMarker(30, 90), startFrame: -1 };
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });

  it('rejects non-integer zoomInDuration', () => {
    const marker = { ...createZoomMarker(30, 90), zoomInDuration: 1.5 };
    expect(ZoomMarkerSchema.safeParse(marker).success).toBe(false);
  });
});

describe('CensorRegion', () => {
  function censorRegion(overrides: Record<string, unknown> = {}) {
    return {
      id: 'censor-1',
      startFrame: 30,
      endFrame: 90,
      rect: { x: 0.25, y: 0.5, w: 0.25, h: 0.25 },
      mode: 'pixelate',
      blockSize: 24,
      soften: true,
      ...overrides,
    };
  }

  it('accepts a region saved before keyframes existed', () => {
    const parsed = CensorRegionSchema.parse(censorRegion());
    expect(parsed.keyframes).toBeUndefined();
  });

  it('accepts a region that follows moving content', () => {
    const parsed = CensorRegionSchema.parse(
      censorRegion({
        keyframes: [
          { frame: 30, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } },
          { frame: 90, rect: { x: 0.4, y: 0.1, w: 0.2, h: 0.2 } },
        ],
      }),
    );
    expect(parsed.keyframes).toHaveLength(2);
    expect(parsed.keyframes?.[1].frame).toBe(90);
  });

  it('rejects a keyframe with a degenerate rect', () => {
    const bad = censorRegion({ keyframes: [{ frame: 30, rect: { x: 0, y: 0, w: 0, h: 0.2 } }] });
    expect(CensorRegionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a keyframe on a fractional or negative frame', () => {
    expect(
      CensorRegionSchema.safeParse(
        censorRegion({ keyframes: [{ frame: 12.5, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } }] }),
      ).success,
    ).toBe(false);
    expect(
      CensorRegionSchema.safeParse(
        censorRegion({ keyframes: [{ frame: -1, rect: { x: 0, y: 0, w: 0.2, h: 0.2 } }] }),
      ).success,
    ).toBe(false);
  });
});

describe('AI architecture schemas', () => {
  it('accepts a valid AiAsset', () => {
    const asset = {
      id: 'ai-asset-1',
      kind: 'audio' as const,
      providerId: 'elevenlabs',
      sourcePrompt: 'Narrate the intro',
      createdAt: '2026-05-21T10:00:00.000Z',
      tags: ['voiceover', 'intro'],
      sessionId: 'session-1',
      filePath: '/tmp/rough-cut/ai-assets/audio/session-1/ai-asset-1.wav',
    };

    expect(() => AiAssetSchema.parse(asset)).not.toThrow();
  });

  it('rejects an AiAsset with an unsupported kind', () => {
    const asset = {
      id: 'ai-asset-1',
      kind: 'text',
      providerId: 'codex-cli',
      sourcePrompt: 'Make a title',
      createdAt: '2026-05-21T10:00:00.000Z',
      tags: [],
      sessionId: 'session-1',
      filePath: '/tmp/title.txt',
    };

    expect(AiAssetSchema.safeParse(asset).success).toBe(false);
  });

  it('accepts a stable AI asset clip reference', () => {
    expect(() => AiAssetClipReferenceSchema.parse({ kind: 'ai-asset', id: 'ai-asset-1' })).not.toThrow();
  });

  it('accepts a generated timeline source that references an AI asset id', () => {
    const source = {
      id: 'source:ai-asset-1',
      kind: 'generated-asset' as const,
      mediaType: 'audio' as const,
      aiAssetId: 'ai-asset-1',
      label: 'Generated narration',
      duration: 120,
    };

    expect(() => TimelineSourceSchema.parse(source)).not.toThrow();
  });

  it('rejects timeline sources that point to both project and AI assets', () => {
    const source = {
      id: 'source:mixed',
      kind: 'generated-asset' as const,
      mediaType: 'audio' as const,
      assetId: 'project-asset-1',
      aiAssetId: 'ai-asset-1',
      label: 'Ambiguous generated asset',
      duration: 120,
    };

    expect(TimelineSourceSchema.safeParse(source).success).toBe(false);
  });

  it('accepts a valid Transcript', () => {
    const transcript = {
      words: [{ word: 'hello', startFrame: 0, endFrame: 12, confidence: 0.95 }],
      paragraphs: [{ startFrame: 0, endFrame: 12, text: 'hello', speaker: 'Noam' }],
      nonSpeech: [{ kind: 'silence' as const, startFrame: 12, endFrame: 24 }],
    };
    expect(() => TranscriptSchema.parse(transcript)).not.toThrow();
  });

  it('rejects a Transcript with an invalid non-speech kind', () => {
    const bad = {
      words: [],
      paragraphs: [],
      nonSpeech: [{ kind: 'applause', startFrame: 0, endFrame: 12 }],
    };
    expect(TranscriptSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a Transcript with a negative startFrame', () => {
    const bad = {
      words: [{ word: 'x', startFrame: -1, endFrame: 12, confidence: 0.9 }],
      paragraphs: [],
      nonSpeech: [],
    };
    expect(TranscriptSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a valid CaptionTrack', () => {
    const track = {
      id: 'ct-1',
      style: 'submagic' as const,
      phrases: [
        { text: 'hello world', startFrame: 0, endFrame: 30, emphasisWordIndex: 1 },
      ],
    };
    expect(() => CaptionTrackSchema.parse(track)).not.toThrow();
  });

  it('rejects a CaptionTrack with an unknown style', () => {
    const bad = { id: 'ct-1', style: 'fancy', phrases: [] };
    expect(CaptionTrackSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a valid NleTrack', () => {
    const track = {
      id: 'tr-1',
      kind: 'video' as const,
      index: 0,
      label: 'V1',
      enabled: true,
      locked: false,
      muted: false,
      clips: [
        {
          id: 'clip-1',
          source: { kind: 'project-asset' as const, id: 'a-1' },
          timelineIn: 0,
          timelineOut: 120,
          sourceIn: 0,
          sourceOut: 120,
        },
      ],
    };
    expect(() => NleTrackSchema.parse(track)).not.toThrow();
  });

  it('rejects NLE clips that do not use half-open positive intervals', () => {
    const badTimeline = {
      id: 'clip-1',
      source: { kind: 'project-asset' as const, id: 'a-1' },
      timelineIn: 30,
      timelineOut: 30,
      sourceIn: 0,
      sourceOut: 30,
    };
    const badSource = { ...badTimeline, timelineOut: 60, sourceIn: 20, sourceOut: 20 };

    expect(NleTrackClipSchema.safeParse(badTimeline).success).toBe(false);
    expect(NleTrackClipSchema.safeParse(badSource).success).toBe(false);
  });

  it('accepts an NleTrack clip that references an AI asset', () => {
    const track = {
      id: 'tr-1',
      kind: 'audio' as const,
      index: 0,
      label: 'Generated VO',
      enabled: true,
      locked: false,
      muted: false,
      clips: [
        {
          id: 'clip-tts',
          source: { kind: 'ai-asset' as const, id: 'ai-asset-1' },
          timelineIn: 0,
          timelineOut: 90,
          sourceIn: 0,
          sourceOut: 90,
        },
      ],
    };
    expect(() => NleTrackSchema.parse(track)).not.toThrow();
  });

  it('rejects an NleTrack with an unknown kind', () => {
    const bad = {
      id: 'tr-1',
      kind: 'subtitles',
      index: 0,
      label: 'X',
      enabled: true,
      locked: false,
      muted: false,
      clips: [],
    };
    expect(NleTrackSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a ProjectDocument with the AI architecture fields populated', () => {
    const project = createProject();
    const extended = {
      ...project,
      transcript: { words: [], paragraphs: [], nonSpeech: [] },
      captionTracks: [{ id: 'ct-1', style: 'subtitle' as const, phrases: [] }],
      tracks: [
        {
          id: 'tr-1',
          kind: 'audio' as const,
          index: 0,
          label: 'A1',
          enabled: true,
          locked: false,
          muted: false,
          clips: [],
        },
      ],
    };
    expect(() => validateProject(extended)).not.toThrow();
  });

  it('accepts a shared timeline with recording sources, linked groups, markers, effects, and export settings', () => {
    const presentation = createDefaultRecordingPresentation();
    const asset = createAsset('recording', '/tmp/recording.webm', {
      duration: 300,
      presentation: {
        ...presentation,
        zoom: { ...presentation.zoom, markers: [createZoomMarker(30, 90)] },
      },
      cameraAssetId: 'camera-asset-1',
    });
    const project = createProject({ assets: [asset] });

    expect(() => SharedTimelineSchema.parse(project.timeline)).not.toThrow();
    expect(project.timeline.sources.map((source) => source.kind)).toEqual([
      'screen',
      'cursor-telemetry',
      'system-audio',
      'mic-audio',
      'camera',
    ]);
    expect(project.timeline.linkedGroups[0]).toMatchObject({
      kind: 'recording',
      primarySourceId: `source:${asset.id}:screen`,
      syncPolicy: 'frame-locked',
    });
    expect(project.timeline.markers[0]).toMatchObject({ kind: 'zoom', linkedGroupId: `linked:${asset.id}` });
    expect(project.timeline.effects.map((effect) => effect.kind)).toEqual(['cursor', 'click', 'camera-pip']);
    expect(project.timeline.exportSettings).toEqual(project.exportSettings);
  });

  it('maps recording cut ranges into shared timeline cut markers', () => {
    const presentation = createDefaultRecordingPresentation();
    const asset = createAsset('recording', '/tmp/recording.webm', {
      duration: 300,
      presentation: {
        ...presentation,
        cutRanges: [{ id: 'cut-1' as never, startFrame: 30, endFrame: 60 }],
      },
    });
    const project = createProject({ assets: [asset] });

    expect(project.timeline.markers).toContainEqual({
      id: 'cut-1',
      kind: 'cut',
      startFrame: 30,
      endFrame: 60,
      linkedGroupId: `linked:${asset.id}`,
      params: { range: { id: 'cut-1', startFrame: 30, endFrame: 60 } },
    });
  });

  it('rejects shared timeline markers and groups that reference missing owners', () => {
    const project = createProject();
    const missingSourceGroup = {
      ...project.timeline,
      linkedGroups: [{ id: 'g1', kind: 'recording' as const, sourceIds: ['missing'], primarySourceId: 'missing', syncPolicy: 'frame-locked' as const }],
    };
    const missingMarkerOwner = {
      ...project.timeline,
      markers: [{ id: 'm1', kind: 'zoom' as const, startFrame: 0, endFrame: 1, linkedGroupId: 'missing', params: {} }],
    };

    expect(SharedTimelineSchema.safeParse(missingSourceGroup).success).toBe(false);
    expect(SharedTimelineSchema.safeParse(missingMarkerOwner).success).toBe(false);
  });

  it('accepts a document with none of the optional AI architecture fields', () => {
    const project = createProject();
    const { transcript: _t, captionTracks: _ct, tracks: _tr, ...withoutAiFields } = project;
    expect(() => validateProject(withoutAiFields)).not.toThrow();
  });

  it('rejects a ProjectDocument whose transcript is malformed', () => {
    const project = createProject();
    const bad = {
      ...project,
      transcript: { words: 'nope', paragraphs: [], nonSpeech: [] },
    };
    expect(ProjectDocumentSchema.safeParse(bad).success).toBe(false);
  });
});
