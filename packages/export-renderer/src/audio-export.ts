import { resolveRecordingVisibility } from '@rough-cut/project-model';
import type { Asset, Clip, ProjectDocument, Track } from '@rough-cut/project-model';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  Input,
  Output,
  canEncodeAudio,
} from 'mediabunny';
import { parseNdjsonCursorEvents } from './cursor-render.js';

const AUDIO_BITRATE = 128_000;
const DEFAULT_CLICK_SAMPLE_RATE = 48_000;
const CLICK_SOUND_FILE_URL = new URL('../../../aseets/mouse-click-1.wav', import.meta.url).href;

interface AudioExportSegment {
  asset: Asset;
  clip: Clip;
  track: Track;
}

interface LoadedAudioAsset {
  input: Input;
  sink: AudioSampleSink;
}

interface LoadedClickSound {
  sampleRate: number;
  channelData: readonly Float32Array[];
}

export interface ClickSoundExportEvent {
  timestampSeconds: number;
}

function getCameraAssetIds(project: ProjectDocument): Set<string> {
  return new Set(
    project.assets
      .map((asset) => asset.cameraAssetId)
      .filter((assetId): assetId is string => typeof assetId === 'string' && assetId.length > 0),
  );
}

export function collectAudioExportSegments(project: ProjectDocument): AudioExportSegment[] {
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const cameraAssetIds = getCameraAssetIds(project);
  const assetIdsWithAudioTrackClips = new Set(
    project.composition.tracks
      .filter((track) => track.type === 'audio')
      .flatMap((track) => track.clips.map((clip) => clip.assetId)),
  );
  const segments = project.composition.tracks
    .filter((track) => track.visible && track.volume > 0)
    .flatMap((track) =>
      track.clips
        .filter((clip) => clip.enabled && clip.timelineOut > clip.timelineIn)
        .map((clip) => ({ clip, track, asset: assetsById.get(clip.assetId) ?? null }))
        .filter(
          (
            entry,
          ): entry is {
            clip: Clip;
            track: Track;
            asset: Asset;
          } =>
            entry.asset !== null &&
            entry.asset.filePath.length > 0 &&
            !cameraAssetIds.has(entry.asset.id) &&
            !(track.type !== 'audio' && assetIdsWithAudioTrackClips.has(entry.asset.id)) &&
            entry.asset.metadata['isCamera'] !== true &&
            (entry.asset.type === 'recording' ||
              entry.asset.type === 'video' ||
              entry.asset.type === 'audio'),
        ),
    )
    .sort((a, b) => a.clip.timelineIn - b.clip.timelineIn || a.track.index - b.track.index);

  return segments;
}

export function collectClickSoundExportEvents(
  project: ProjectDocument,
  cursorEventsByAssetId: ReadonlyMap<string, readonly { frame: number; type: string }[]>,
  frameRate: number,
): ClickSoundExportEvent[] {
  if (frameRate <= 0 || project.exportSettings.keepClickSounds === false) return [];

  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const cameraAssetIds = getCameraAssetIds(project);
  const events: ClickSoundExportEvent[] = [];

  for (const track of project.composition.tracks) {
    if (!track.visible || track.type !== 'video') continue;

    for (const clip of track.clips) {
      if (!clip.enabled || clip.timelineOut <= clip.timelineIn) continue;

      const asset = assetsById.get(clip.assetId);
      if (!asset || !asset.presentation?.cursor.clickSoundEnabled) continue;
      if (cameraAssetIds.has(asset.id) || asset.metadata['isCamera'] === true) continue;
      if (asset.type !== 'recording' && asset.type !== 'video') continue;

      const cursorEvents = cursorEventsByAssetId.get(asset.id);
      if (!cursorEvents || cursorEvents.length === 0) continue;

      const eventsFps =
        typeof asset.metadata?.['cursorEventsFps'] === 'number'
          ? (asset.metadata['cursorEventsFps'] as number)
          : 60;
      if (eventsFps <= 0) continue;

      for (const event of cursorEvents) {
        if (event.type !== 'down') continue;
        const sourceProjectFrame = Math.round((event.frame / eventsFps) * frameRate);
        if (sourceProjectFrame < clip.sourceIn || sourceProjectFrame >= clip.sourceOut) continue;
        if (!resolveRecordingVisibility(asset.presentation?.visibilitySegments, sourceProjectFrame).clicksVisible) {
          continue;
        }

        const timelineFrame = clip.timelineIn + (sourceProjectFrame - clip.sourceIn);
        if (timelineFrame < clip.timelineIn || timelineFrame >= clip.timelineOut) continue;
        events.push({ timestampSeconds: timelineFrame / frameRate });
      }
    }
  }

  return events.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
}

async function loadCursorEventsForClickSounds(project: ProjectDocument) {
  const result = new Map<string, readonly { frame: number; type: string }[]>();

  if (project.exportSettings.keepClickSounds === false) {
    return result;
  }

  await Promise.all(
    project.assets.map(async (asset) => {
      if (!asset.presentation?.cursor.clickSoundEnabled) return;

      const candidatePaths = new Set<string>();
      const rawCursorEventsPath = asset.metadata?.['cursorEventsPath'];
      if (typeof rawCursorEventsPath === 'string' && rawCursorEventsPath.length > 0) {
        candidatePaths.add(rawCursorEventsPath);
      }
      if (asset.filePath) {
        candidatePaths.add(asset.filePath.replace(/\.(webm|mp4)$/i, '.cursor.ndjson'));
      }

      for (const path of candidatePaths) {
        const response = await fetch(`media://${path}`);
        if (!response.ok) continue;
        const text = await response.text();
        if (!text.trim()) continue;
        result.set(asset.id, parseNdjsonCursorEvents(text));
        return;
      }
    }),
  );

  return result;
}

async function createAudioSource(
  output: Output,
  numberOfChannels: number,
  sampleRate: number,
): Promise<AudioSampleSource | null> {
  const canEncodeAac = await canEncodeAudio('aac', {
    numberOfChannels,
    sampleRate,
    bitrate: AUDIO_BITRATE,
    bitrateMode: 'variable',
  });
  if (!canEncodeAac) return null;

  const audioSource = new AudioSampleSource({
    codec: 'aac',
    bitrate: AUDIO_BITRATE,
    bitrateMode: 'variable',
  });
  output.addAudioTrack(audioSource);
  return audioSource;
}

export function parsePcm16Wav(bytes: ArrayBuffer): LoadedClickSound {
  const view = new DataView(bytes);
  const readTag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (bytes.byteLength < 44 || readTag(0) !== 'RIFF' || readTag(8) !== 'WAVE') {
    throw new Error('Unsupported click sound WAV file');
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readTag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ') {
      const format = view.getUint16(chunkDataOffset, true);
      channels = view.getUint16(chunkDataOffset + 2, true);
      sampleRate = view.getUint32(chunkDataOffset + 4, true);
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
      if (format !== 1) {
        throw new Error(`Unsupported click sound WAV encoding: ${format}`);
      }
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (channels <= 0 || sampleRate <= 0 || bitsPerSample !== 16 || dataOffset < 0 || dataSize <= 0) {
    throw new Error('Invalid click sound WAV metadata');
  }

  const frameCount = Math.floor(dataSize / (channels * 2));
  const channelData = Array.from({ length: channels }, () => new Float32Array(frameCount));
  let byteOffset = dataOffset;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      channelData[channel]![frame] = view.getInt16(byteOffset, true) / 32768;
      byteOffset += 2;
    }
  }

  return { sampleRate, channelData };
}

let clickSoundPromise: Promise<LoadedClickSound> | null = null;

async function loadClickSoundAsset(): Promise<LoadedClickSound> {
  if (!clickSoundPromise) {
    clickSoundPromise = fetch(CLICK_SOUND_FILE_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch click sound asset: ${response.status}`);
        }
        return parsePcm16Wav(await response.arrayBuffer());
      });
  }
  return clickSoundPromise;
}

function resampleChannelLinear(
  source: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return source.slice();
  }

  const targetLength = Math.max(1, Math.round((source.length * targetSampleRate) / sourceSampleRate));
  const out = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const sourceIndex = (i * sourceSampleRate) / targetSampleRate;
    const left = Math.floor(sourceIndex);
    const right = Math.min(source.length - 1, left + 1);
    const t = sourceIndex - left;
    const leftValue = source[left] ?? 0;
    const rightValue = source[right] ?? leftValue;
    out[i] = leftValue + (rightValue - leftValue) * t;
  }
  return out;
}

export function createClickAudioSamples(
  clickSound: LoadedClickSound,
  timestampSeconds: number,
  targetSampleRate: number,
  targetChannels: number,
): AudioSample[] {
  const sourceChannels = clickSound.channelData.length;
  const resampledChannels = Array.from({ length: targetChannels }, (_, channelIndex) => {
    const source = clickSound.channelData[Math.min(channelIndex, sourceChannels - 1)]!;
    return resampleChannelLinear(source, clickSound.sampleRate, targetSampleRate);
  });
  const frameCount = resampledChannels[0]?.length ?? 0;
  const buffer = new AudioBuffer({
    numberOfChannels: targetChannels,
    length: frameCount,
    sampleRate: targetSampleRate,
  });

  for (let channel = 0; channel < targetChannels; channel++) {
    const data = resampledChannels[channel];
    if (data) {
      buffer.copyToChannel(new Float32Array(data), channel, 0);
    }
  }

  return AudioSample.fromAudioBuffer(buffer, timestampSeconds);
}

async function addClickSoundSamples(
  audioSource: AudioSampleSource,
  timestampSeconds: number,
  clickSound: LoadedClickSound,
  sampleRate: number,
  numberOfChannels: number,
) {
  const samples = createClickAudioSamples(clickSound, timestampSeconds, sampleRate, numberOfChannels);
  for (const sample of samples) {
    try {
      await audioSource.add(sample);
    } finally {
      sample.close();
    }
  }
}

async function loadAudioAsset(filePath: string): Promise<LoadedAudioAsset | null> {
  const response = await fetch(`media://${filePath}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch media://${filePath}: ${response.status}`);
  }

  const blob = await response.blob();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const audioTrack = await input.getPrimaryAudioTrack();
  if (!audioTrack) {
    input.dispose();
    return null;
  }

  return {
    input,
    sink: new AudioSampleSink(audioTrack),
  };
}

async function cloneSampleWindow(
  sample: AudioSample,
  clipStartSeconds: number,
  clipEndSeconds: number,
  timelineStartSeconds: number,
): Promise<AudioSample[]> {
  const sampleStart = sample.timestamp;
  const sampleEnd = sample.timestamp + sample.duration;
  const overlapStart = Math.max(sampleStart, clipStartSeconds);
  const overlapEnd = Math.min(sampleEnd, clipEndSeconds);
  if (overlapEnd <= overlapStart) {
    return [];
  }

  if (overlapStart <= sampleStart && overlapEnd >= sampleEnd) {
    const cloned = sample.clone();
    cloned.setTimestamp(timelineStartSeconds + (sampleStart - clipStartSeconds));
    return [cloned];
  }

  const audioBuffer = sample.toAudioBuffer();
  const frameOffset = Math.max(
    0,
    Math.floor((overlapStart - sampleStart) * audioBuffer.sampleRate),
  );
  const frameEnd = Math.min(
    audioBuffer.length,
    Math.ceil((overlapEnd - sampleStart) * audioBuffer.sampleRate),
  );
  const frameCount = Math.max(0, frameEnd - frameOffset);
  if (frameCount === 0) {
    return [];
  }

  const trimmedBuffer = new AudioBuffer({
    numberOfChannels: audioBuffer.numberOfChannels,
    length: frameCount,
    sampleRate: audioBuffer.sampleRate,
  });

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const source = audioBuffer.getChannelData(channel).subarray(frameOffset, frameEnd);
    trimmedBuffer.copyToChannel(source, channel, 0);
  }

  return AudioSample.fromAudioBuffer(
    trimmedBuffer,
    timelineStartSeconds + (overlapStart - clipStartSeconds),
  );
}

export async function addAudioTracksToOutput(
  project: ProjectDocument,
  output: Output,
  frameRate: number,
): Promise<(() => void) | null> {
  const segments = collectAudioExportSegments(project);
  const cursorEventsByAssetId = await loadCursorEventsForClickSounds(project);
  const clickSoundEvents = collectClickSoundExportEvents(project, cursorEventsByAssetId, frameRate);
  const clickSound = clickSoundEvents.length > 0 ? await loadClickSoundAsset() : null;
  if (segments.length === 0 && clickSoundEvents.length === 0) {
    return null;
  }

  const loadedAssets = new Map<string, LoadedAudioAsset>();
  let audioSource: AudioSampleSource | null = null;
  let audioSampleRate = DEFAULT_CLICK_SAMPLE_RATE;
  let audioChannels = Math.max(1, clickSound?.channelData.length ?? 1);
  let nextClickIndex = 0;

  try {
    for (const segment of segments) {
      let loaded = loadedAssets.get(segment.asset.id);
      if (!loaded) {
        const nextLoaded = await loadAudioAsset(segment.asset.filePath);
        if (!nextLoaded) {
          continue;
        }
        loaded = nextLoaded;
        loadedAssets.set(segment.asset.id, loaded);
      }

      const audioTrack = await loaded.input.getPrimaryAudioTrack();
      if (!audioTrack) {
        continue;
      }

      if (audioSource === null) {
        audioSampleRate = audioTrack.sampleRate;
        audioChannels = audioTrack.numberOfChannels;
        audioSource = await createAudioSource(
          output,
          audioTrack.numberOfChannels,
          audioTrack.sampleRate,
        );
        if (audioSource === null) {
          return null;
        }
      }

      const clipStartSeconds = segment.clip.sourceIn / frameRate;
      const clipEndSeconds = segment.clip.sourceOut / frameRate;
      const timelineStartSeconds = segment.clip.timelineIn / frameRate;

      for await (const sample of loaded.sink.samples(clipStartSeconds, clipEndSeconds)) {
        try {
          const adjustedSamples = await cloneSampleWindow(
            sample,
            clipStartSeconds,
            clipEndSeconds,
            timelineStartSeconds,
          );
          for (const adjustedSample of adjustedSamples) {
            try {
              while (
                nextClickIndex < clickSoundEvents.length &&
                clickSoundEvents[nextClickIndex]!.timestampSeconds <= adjustedSample.timestamp
              ) {
                await addClickSoundSamples(
                  audioSource,
                  clickSoundEvents[nextClickIndex]!.timestampSeconds,
                  clickSound ?? { sampleRate: DEFAULT_CLICK_SAMPLE_RATE, channelData: [new Float32Array(0)] },
                  audioSampleRate,
                  audioChannels,
                );
                nextClickIndex += 1;
              }
              await audioSource.add(adjustedSample);
            } finally {
              adjustedSample.close();
            }
          }
        } finally {
          sample.close();
        }
      }
    }

    if (audioSource === null && clickSoundEvents.length > 0) {
      audioChannels = Math.max(1, clickSound?.channelData.length ?? 1);
      audioSource = await createAudioSource(output, audioChannels, DEFAULT_CLICK_SAMPLE_RATE);
      audioSampleRate = DEFAULT_CLICK_SAMPLE_RATE;
      if (audioSource === null) return null;
    }

    while (audioSource !== null && nextClickIndex < clickSoundEvents.length) {
      await addClickSoundSamples(
        audioSource,
        clickSoundEvents[nextClickIndex]!.timestampSeconds,
        clickSound ?? { sampleRate: DEFAULT_CLICK_SAMPLE_RATE, channelData: [new Float32Array(0)] },
        audioSampleRate,
        audioChannels,
      );
      nextClickIndex += 1;
    }
  } catch (error) {
    for (const loaded of loadedAssets.values()) {
      loaded.input.dispose();
    }
    throw error;
  }

  if (audioSource === null) {
    for (const loaded of loadedAssets.values()) {
      loaded.input.dispose();
    }
    return null;
  }

  return () => {
    for (const loaded of loadedAssets.values()) {
      loaded.input.dispose();
    }
  };
}
