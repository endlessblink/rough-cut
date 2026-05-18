import { describe, it, expect } from 'vitest';
import {
  validateProject,
  validateLibrary,
  ProjectDocumentSchema,
  LibraryDocumentSchema,
  ZoomMarkerSchema,
  TranscriptSchema,
  CaptionTrackSchema,
  NleTrackSchema,
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

describe('AI architecture schemas', () => {
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

  it('accepts an NleTrack clip that references an AI asset', () => {
    const track = {
      id: 'tr-1',
      kind: 'audio' as const,
      index: 0,
      label: 'Generated VO',
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
          locked: false,
          muted: false,
          clips: [],
        },
      ],
    };
    expect(() => validateProject(extended)).not.toThrow();
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
