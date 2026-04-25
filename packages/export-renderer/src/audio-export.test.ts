import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createProject, createAsset, createClip } from '@rough-cut/project-model';
import {
  collectAudioExportSegments,
  collectClickSoundExportEvents,
  createClickAudioSamples,
  parsePcm16Wav,
  resolveAudioStemPaths,
} from './audio-export.js';

class TestAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly channels: Float32Array[];

  constructor({
    numberOfChannels,
    length,
    sampleRate,
  }: {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
  }) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  copyToChannel(source: Float32Array, channelNumber: number, bufferOffset = 0) {
    this.channels[channelNumber]?.set(source, bufferOffset);
  }

  copyFromChannel(destination: Float32Array, channelNumber: number, bufferOffset = 0) {
    const source = this.channels[channelNumber] ?? new Float32Array(this.length);
    destination.set(source.subarray(bufferOffset, bufferOffset + destination.length));
  }

  getChannelData(channelNumber: number) {
    return this.channels[channelNumber] ?? new Float32Array(this.length);
  }
}

beforeAll(() => {
  vi.stubGlobal('AudioBuffer', TestAudioBuffer);
});

describe('collectAudioExportSegments', () => {
  it('includes the main recording clip and skips camera assets', () => {
    const project = createProject({ name: 'audio-export-test' });
    const videoTracks = project.composition.tracks.filter((track) => track.type === 'video');
    const videoTrack = videoTracks[0]!;
    const secondVideoTrack = videoTracks[1]!;

    const recordingAsset = createAsset('recording', '/tmp/screen.webm', { duration: 120 });
    const cameraAsset = createAsset('video', '/tmp/camera.mp4', {
      duration: 120,
      metadata: { isCamera: true },
    });

    const recordingClip = createClip(recordingAsset.id, videoTrack.id, {
      timelineIn: 0,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 120,
    });
    const cameraClip = createClip(cameraAsset.id, secondVideoTrack.id, {
      timelineIn: 0,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 120,
    });

    const nextProject = {
      ...project,
      assets: [recordingAsset, cameraAsset],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) => {
          if (track.id === videoTrack.id) {
            return { ...track, clips: [recordingClip] };
          }
          if (track.id === secondVideoTrack.id) {
            return { ...track, clips: [cameraClip] };
          }
          return track;
        }),
      },
    };

    const segments = collectAudioExportSegments(nextProject);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.asset.id).toBe(recordingAsset.id);
  });

  it('keeps overlapping clips so export can mix them', () => {
    const project = createProject({ name: 'audio-overlap-test' });
    const videoTrack = project.composition.tracks.find((track) => track.type === 'video')!;
    const assetA = createAsset('recording', '/tmp/a.webm', { duration: 120 });
    const assetB = createAsset('recording', '/tmp/b.webm', { duration: 120 });
    const clipA = createClip(assetA.id, videoTrack.id, {
      timelineIn: 0,
      timelineOut: 90,
      sourceIn: 0,
      sourceOut: 90,
    });
    const clipB = createClip(assetB.id, videoTrack.id, {
      timelineIn: 60,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 60,
    });

    const nextProject = {
      ...project,
      assets: [assetA, assetB],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) =>
          track.id === videoTrack.id ? { ...track, clips: [clipA, clipB] } : track,
        ),
      },
    };

    const segments = collectAudioExportSegments(nextProject);

    expect(segments).toHaveLength(2);
    expect(segments[0]?.asset.id).toBe(assetA.id);
    expect(segments[1]?.asset.id).toBe(assetB.id);
  });
});

describe('resolveAudioStemPaths', () => {
  it('reads persisted stem paths from recording asset metadata', () => {
    const asset = createAsset('recording', '/tmp/screen.webm', {
      metadata: {
        audioStemPaths: {
          micFilePath: '/tmp/screen.mic.webm',
          systemAudioFilePath: '/tmp/screen.system.webm',
        },
      },
    });

    expect(resolveAudioStemPaths(asset)).toEqual({
      micFilePath: '/tmp/screen.mic.webm',
      systemAudioFilePath: '/tmp/screen.system.webm',
    });
  });

  it('falls back to audioCapture.final.stems for recovered takes', () => {
    const asset = createAsset('recording', '/tmp/screen.webm', {
      metadata: {
        audioCapture: {
          final: {
            stems: {
              micFilePath: '/tmp/recovered.mic.webm',
              systemAudioFilePath: null,
            },
          },
        },
      },
    });

    expect(resolveAudioStemPaths(asset)).toEqual({
      micFilePath: '/tmp/recovered.mic.webm',
      systemAudioFilePath: null,
    });
  });
});

describe('collectClickSoundExportEvents', () => {
  it('maps enabled cursor down events into exported timeline seconds', () => {
    const project = createProject({ name: 'click-sound-export-test' });
    const videoTrack = project.composition.tracks.find((track) => track.type === 'video')!;
    const asset = createAsset('recording', '/tmp/screen.webm', {
      duration: 120,
      metadata: { cursorEventsFps: 60 },
      presentation: {
        templateId: 'default',
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
          clickSoundEnabled: true,
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
    });
    const clip = createClip(asset.id, videoTrack.id, {
      timelineIn: 30,
      timelineOut: 90,
      sourceIn: 10,
      sourceOut: 70,
    });
    const nextProject = {
      ...project,
      assets: [asset],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) =>
          track.id === videoTrack.id ? { ...track, clips: [clip] } : track,
        ),
      },
    };
    const cursorEventsByAssetId = new Map([
      [
        asset.id,
        [
          { frame: 10, type: 'move' },
          { frame: 20, type: 'down' },
          { frame: 40, type: 'down' },
          { frame: 160, type: 'down' },
        ],
      ],
    ]);

    expect(collectClickSoundExportEvents(nextProject, cursorEventsByAssetId, 30)).toEqual([
      { timestampSeconds: 1 },
      { timestampSeconds: 4 / 3 },
    ]);
  });

  it('returns no events when click sound is disabled', () => {
    const project = createProject({ name: 'click-sound-disabled-test' });
    const videoTrack = project.composition.tracks.find((track) => track.type === 'video')!;
    const asset = createAsset('recording', '/tmp/screen.webm', { duration: 120 });
    const clip = createClip(asset.id, videoTrack.id, {
      timelineIn: 0,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 120,
    });
    const nextProject = {
      ...project,
      assets: [asset],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) =>
          track.id === videoTrack.id ? { ...track, clips: [clip] } : track,
        ),
      },
    };

    expect(
      collectClickSoundExportEvents(
        nextProject,
        new Map([[asset.id, [{ frame: 20, type: 'down' }]]]),
        30,
      ),
    ).toEqual([]);
  });

  it('returns no events when export click sounds are disabled', () => {
    const project = createProject({
      name: 'click-sound-export-disabled-test',
      exportSettings: {
        ...createProject().exportSettings,
        keepClickSounds: false,
      },
    });
    const videoTrack = project.composition.tracks.find((track) => track.type === 'video')!;
    const asset = createAsset('recording', '/tmp/screen.webm', {
      duration: 120,
      metadata: { cursorEventsFps: 60 },
      presentation: {
        templateId: 'default',
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
          clickSoundEnabled: true,
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
    });
    const clip = createClip(asset.id, videoTrack.id, {
      timelineIn: 0,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 120,
    });
    const nextProject = {
      ...project,
      assets: [asset],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) =>
          track.id === videoTrack.id ? { ...track, clips: [clip] } : track,
        ),
      },
    };

    expect(
      collectClickSoundExportEvents(
        nextProject,
        new Map([[asset.id, [{ frame: 20, type: 'down' }]]]),
        30,
      ),
    ).toEqual([]);
  });

  it('skips click sounds inside hidden click segments', () => {
    const project = createProject({ name: 'click-sound-segment-visibility-test' });
    const videoTrack = project.composition.tracks.find((track) => track.type === 'video')!;
    const asset = createAsset('recording', '/tmp/screen.webm', {
      duration: 120,
      metadata: { cursorEventsFps: 60 },
      presentation: {
        templateId: 'default',
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
          clickSoundEnabled: true,
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
        visibilitySegments: [
          {
            id: 'visibility-1' as import('@rough-cut/project-model').RecordingVisibilitySegmentId,
            frame: 30,
            cameraVisible: true,
            cursorVisible: true,
            clicksVisible: false,
            overlaysVisible: true,
          },
        ],
      },
    });
    const clip = createClip(asset.id, videoTrack.id, {
      timelineIn: 0,
      timelineOut: 120,
      sourceIn: 0,
      sourceOut: 120,
    });
    const nextProject = {
      ...project,
      assets: [asset],
      composition: {
        ...project.composition,
        tracks: project.composition.tracks.map((track) =>
          track.id === videoTrack.id ? { ...track, clips: [clip] } : track,
        ),
      },
    };

    expect(
      collectClickSoundExportEvents(
        nextProject,
        new Map([
          [
            asset.id,
            [
              { frame: 20, type: 'down' },
              { frame: 60, type: 'down' },
            ],
          ],
        ]),
        30,
      ),
    ).toEqual([{ timestampSeconds: 1 / 3 }]);
  });
});

describe('bundled click sound asset', () => {
  it('uses the shipped WAV waveform for export click samples', async () => {
    const wavPath = new URL('../../../aseets/mouse-click-1.wav', import.meta.url);
    const bytes = await readFile(wavPath);
    const clickSound = parsePcm16Wav(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );

    expect(clickSound.sampleRate).toBe(48_000);
    expect(clickSound.channelData).toHaveLength(1);
    expect(clickSound.channelData[0]?.length).toBe(7018);

    const samples = createClickAudioSamples(clickSound, 1.25, 48_000, 2);
    expect(samples).toHaveLength(1);

    const buffer = samples[0]!.toAudioBuffer();
    expect(buffer.sampleRate).toBe(48_000);
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(7018);

    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    expect(left[0]).toBeCloseTo(clickSound.channelData[0]![0]!, 5);
    expect(right[128]).toBeCloseTo(clickSound.channelData[0]![128]!, 5);

    let peak = 0;
    for (let i = 0; i < left.length; i++) {
      peak = Math.max(peak, Math.abs(left[i] ?? 0));
    }
    expect(peak).toBeGreaterThan(0.1);

    samples.forEach((sample) => sample.close());
  });
});
