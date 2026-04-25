import { describe, it, expect } from 'vitest';
import { createProject } from '@rough-cut/project-model';
import type { ProjectDocument } from '@rough-cut/project-model';
import { collectClickTimestamps, mixClicksIntoFloat32 } from './click-sound-mix.js';
import { synthesizeClickPcm } from './click-sound-synth.js';

function projectWithRecording(overrides: {
  keepClickSounds?: boolean;
  clickSoundEnabled?: boolean;
  /** Frames at which to mark a click in the cursor data array. */
  clickFrames?: readonly number[];
  totalFrames?: number;
}): {
  project: ProjectDocument;
  cursorDataByAssetId: Map<string, { frames: Float32Array; frameCount: number }>;
  assetId: string;
} {
  const base = createProject();
  const totalFrames = overrides.totalFrames ?? 90;
  const project: ProjectDocument = {
    ...base,
    exportSettings: { ...base.exportSettings, keepClickSounds: overrides.keepClickSounds ?? true },
    assets: [
      ...base.assets,
      {
        id: 'asset-1' as never,
        type: 'recording',
        filePath: '/tmp/recording.webm',
        duration: totalFrames,
        metadata: { width: 1920, height: 1080 },
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
            clickEffect: 'none',
            sizePercent: 100,
            clickSoundEnabled: overrides.clickSoundEnabled ?? true,
            motionBlur: 0,
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
    composition: {
      ...base.composition,
      duration: totalFrames,
      tracks: [
        {
          ...base.composition.tracks[0]!,
          clips: [
            {
              id: 'clip-1' as never,
              assetId: 'asset-1' as never,
              trackId: base.composition.tracks[0]!.id,
              enabled: true,
              timelineIn: 0,
              timelineOut: totalFrames,
              sourceIn: 0,
              sourceOut: totalFrames,
              transform: {
                x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
                anchorX: 0.5, anchorY: 0.5, opacity: 1,
              },
              effects: [],
              keyframes: [],
            },
          ],
        },
        ...base.composition.tracks.slice(1),
      ],
    },
  };

  const frames = new Float32Array(totalFrames * 3);
  frames.fill(-1);
  for (const f of overrides.clickFrames ?? []) {
    frames[f * 3] = 0.5;
    frames[f * 3 + 1] = 0.5;
    frames[f * 3 + 2] = 1; // click flag
  }
  const cursorDataByAssetId = new Map([
    ['asset-1', { frames, frameCount: totalFrames }],
  ]);

  return { project, cursorDataByAssetId, assetId: 'asset-1' };
}

describe('collectClickTimestamps', () => {
  it('returns empty when keepClickSounds is false', () => {
    const { project, cursorDataByAssetId } = projectWithRecording({
      keepClickSounds: false,
      clickFrames: [10, 20],
    });
    const result = collectClickTimestamps(project, cursorDataByAssetId, 30);
    expect(result.timestampsSec).toEqual([]);
  });

  it('returns empty when cursor.clickSoundEnabled is false', () => {
    const { project, cursorDataByAssetId } = projectWithRecording({
      clickSoundEnabled: false,
      clickFrames: [10, 20],
    });
    const result = collectClickTimestamps(project, cursorDataByAssetId, 30);
    expect(result.timestampsSec).toEqual([]);
  });

  it('emits a sorted timestamp for each click frame at fps-converted seconds', () => {
    const { project, cursorDataByAssetId } = projectWithRecording({
      clickFrames: [15, 60, 45],
    });
    const result = collectClickTimestamps(project, cursorDataByAssetId, 30);
    expect(result.timestampsSec).toEqual([15 / 30, 45 / 30, 60 / 30]);
  });

  it('returns empty for unknown asset (no cursor data loaded)', () => {
    const { project } = projectWithRecording({ clickFrames: [10] });
    const result = collectClickTimestamps(project, new Map(), 30);
    expect(result.timestampsSec).toEqual([]);
  });
});

describe('mixClicksIntoFloat32', () => {
  it('is a no-op when click list is empty', () => {
    const channel = new Float32Array(48000);
    channel.fill(0.1);
    mixClicksIntoFloat32(channel, synthesizeClickPcm(48000), 48000, 0, []);
    for (let i = 0; i < channel.length; i++) {
      expect(channel[i]).toBeCloseTo(0.1, 5);
    }
  });

  it('writes nonzero samples into the buffer at the click timestamp', () => {
    const sampleRate = 48000;
    const channel = new Float32Array(sampleRate); // 1 second buffer
    const clickPcm = synthesizeClickPcm(sampleRate);
    mixClicksIntoFloat32(channel, clickPcm, sampleRate, 0, [0.1]);

    const startSample = Math.round(0.1 * sampleRate);
    let nonZero = 0;
    for (let i = startSample; i < startSample + clickPcm.length; i++) {
      if (Math.abs(channel[i] ?? 0) > 0.001) nonZero += 1;
    }
    expect(nonZero).toBeGreaterThan(clickPcm.length / 2);
  });

  it('skips clicks that fall entirely outside the buffer window', () => {
    const sampleRate = 48000;
    const channel = new Float32Array(sampleRate);
    mixClicksIntoFloat32(channel, synthesizeClickPcm(sampleRate), sampleRate, 0, [10.0]);
    for (let i = 0; i < channel.length; i++) {
      expect(channel[i]).toBe(0);
    }
  });
});
