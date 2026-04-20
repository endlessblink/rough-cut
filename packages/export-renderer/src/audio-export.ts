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

const AUDIO_BITRATE = 128_000;

interface AudioExportSegment {
  asset: Asset;
  clip: Clip;
  track: Track;
}

interface LoadedAudioAsset {
  input: Input;
  sink: AudioSampleSink;
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
  if (segments.length === 0) {
    return null;
  }

  const loadedAssets = new Map<string, LoadedAudioAsset>();
  let audioSource: AudioSampleSource | null = null;

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
        const canEncodeAac = await canEncodeAudio('aac', {
          numberOfChannels: audioTrack.numberOfChannels,
          sampleRate: audioTrack.sampleRate,
          bitrate: AUDIO_BITRATE,
          bitrateMode: 'variable',
        });
        if (!canEncodeAac) {
          return null;
        }

        audioSource = new AudioSampleSource({
          codec: 'aac',
          bitrate: AUDIO_BITRATE,
          bitrateMode: 'variable',
        });
        output.addAudioTrack(audioSource);
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
