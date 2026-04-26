import { describe, expect, test } from 'vitest';
import type { Asset, ProjectDocument, Track } from '@rough-cut/project-model';
import {
  collectActiveAudioStemSources,
  getAudioStemPaths,
  resolveAudioStemGain,
  type AudioStemMixerSettings,
} from './audio-mixer.js';

const mixer: AudioStemMixerSettings = {
  mic: { volume: 1, muted: false, solo: false },
  system: { volume: 1, muted: false, solo: false },
  duckingEnabled: false,
};

describe('audio mixer', () => {
  test('reads persisted direct and capture stem metadata', () => {
    expect(
      getAudioStemPaths(
        asset('a', { audioStemPaths: { micFilePath: '/mic.webm', systemAudioFilePath: null } }),
      ),
    ).toEqual({
      micFilePath: '/mic.webm',
      systemAudioFilePath: null,
    });

    expect(
      getAudioStemPaths(
        asset('b', {
          audioCapture: {
            final: { stems: { micFilePath: null, systemAudioFilePath: '/system.webm' } },
          },
        }),
      ),
    ).toEqual({ micFilePath: null, systemAudioFilePath: '/system.webm' });
  });

  test('applies mute solo and ducking gain rules', () => {
    expect(resolveAudioStemGain('mic', { ...mixer, mic: { ...mixer.mic, muted: true } }, 1)).toBe(
      0,
    );
    expect(resolveAudioStemGain('system', { ...mixer, mic: { ...mixer.mic, solo: true } }, 1)).toBe(
      0,
    );
    expect(resolveAudioStemGain('system', { ...mixer, duckingEnabled: true }, 0.8)).toBeCloseTo(
      0.28,
    );
  });

  test('prefers audio-track stem playback over duplicate video-track clips', () => {
    const project = projectDoc({
      assets: [
        asset('rec', {
          audioStemPaths: { micFilePath: '/mic.webm', systemAudioFilePath: '/sys.webm' },
        }),
      ],
      tracks: [track('v1', 'video', 1), track('a1', 'audio', 0.5)],
    });

    const sources = collectActiveAudioStemSources(project, 10);
    expect(sources.map((source) => source.key)).toEqual(['a1-clip:mic', 'a1-clip:system']);
    expect(sources.map((source) => source.gain)).toEqual([0.5, 0.5]);
  });

  test('honors transient track solo selection', () => {
    const project = projectDoc({
      assets: [
        asset('rec', { audioStemPaths: { micFilePath: '/mic.webm', systemAudioFilePath: null } }),
      ],
      tracks: [track('v1', 'video', 1), track('a1', 'audio', 1)],
    });

    expect(
      collectActiveAudioStemSources(project, 10, new Set(['v1'])).map((source) => source.key),
    ).toEqual(['v1-clip:mic']);
  });
});

function asset(id: string, metadata: Record<string, unknown>): Asset {
  return {
    id: id as Asset['id'],
    type: 'recording',
    filePath: `/recording-${id}.webm`,
    duration: 120,
    metadata,
  };
}

function track(id: string, type: Track['type'], volume: number): Track {
  return {
    id: id as Track['id'],
    type,
    name: id,
    index: type === 'video' ? 1 : 0,
    locked: false,
    visible: true,
    volume,
    clips: [
      {
        id: `${id}-clip` as Track['clips'][number]['id'],
        assetId: 'rec' as Asset['id'],
        trackId: id as Track['id'],
        enabled: true,
        timelineIn: 0,
        timelineOut: 60,
        sourceIn: 0,
        sourceOut: 60,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          opacity: 1,
        },
        effects: [],
        keyframes: [],
      },
    ],
  };
}

function projectDoc(input: { assets: Asset[]; tracks: Track[] }): ProjectDocument {
  return {
    version: 1,
    id: 'project' as ProjectDocument['id'],
    name: 'Project',
    createdAt: '',
    modifiedAt: '',
    settings: {
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      backgroundColor: '#000',
      sampleRate: 48000,
    },
    assets: input.assets,
    composition: { duration: 60, tracks: input.tracks, transitions: [] },
    motionPresets: [],
    exportSettings: {
      format: 'mp4',
      codec: 'h264',
      bitrate: 1_000_000,
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      keepClickSounds: true,
    },
    aiAnnotations: {
      captionSegments: [],
      captionStyle: { fontSize: 42, position: 'bottom', backgroundOpacity: 0.7 },
    },
    motionCompositions: [],
    libraryReferences: [],
  };
}
