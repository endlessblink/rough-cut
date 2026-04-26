import type { Asset, ProjectDocument, Track } from '@rough-cut/project-model';

export type AudioStemKind = 'mic' | 'system';

export interface AudioStemPaths {
  micFilePath: string | null;
  systemAudioFilePath: string | null;
}

export interface AudioStemChannelSettings {
  volume: number;
  muted: boolean;
  solo: boolean;
}

export interface AudioStemMixerSettings {
  mic: AudioStemChannelSettings;
  system: AudioStemChannelSettings;
  duckingEnabled: boolean;
}

export interface ActiveAudioStemSource {
  key: string;
  assetId: string;
  clipId: string;
  stem: AudioStemKind;
  filePath: string;
  sourceFrame: number;
  gain: number;
}

const DEFAULT_CHANNEL: AudioStemChannelSettings = {
  volume: 1,
  muted: false,
  solo: false,
};

export const DEFAULT_AUDIO_STEM_MIXER: AudioStemMixerSettings = {
  mic: DEFAULT_CHANNEL,
  system: DEFAULT_CHANNEL,
  duckingEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function clampUnit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function readChannel(value: unknown): AudioStemChannelSettings {
  const raw = isRecord(value) ? value : {};
  return {
    volume: clampUnit(raw['volume'], 1),
    muted: raw['muted'] === true,
    solo: raw['solo'] === true,
  };
}

export function getAudioStemPaths(asset: Asset): AudioStemPaths | null {
  const direct = isRecord(asset.metadata['audioStemPaths'])
    ? asset.metadata['audioStemPaths']
    : null;
  const audioCapture = isRecord(asset.metadata['audioCapture'])
    ? asset.metadata['audioCapture']
    : null;
  const final = isRecord(audioCapture?.['final']) ? audioCapture['final'] : null;
  const nested = isRecord(final?.['stems']) ? final['stems'] : null;
  const stems = direct ?? nested;
  if (!stems) return null;

  const paths = {
    micFilePath: nullableString(stems['micFilePath']),
    systemAudioFilePath: nullableString(stems['systemAudioFilePath']),
  };
  return paths.micFilePath || paths.systemAudioFilePath ? paths : null;
}

export function getAudioStemMixerSettings(asset: Asset): AudioStemMixerSettings {
  const raw = isRecord(asset.metadata['audioMixer']) ? asset.metadata['audioMixer'] : {};
  return {
    mic: readChannel(raw['mic']),
    system: readChannel(raw['system']),
    duckingEnabled: raw['duckingEnabled'] === true,
  };
}

export function resolveAudioStemGain(
  stem: AudioStemKind,
  settings: AudioStemMixerSettings,
  trackVolume: number,
): number {
  const channel = settings[stem];
  if (channel.muted) return 0;

  const hasSolo = settings.mic.solo || settings.system.solo;
  if (hasSolo && !channel.solo) return 0;

  let gain = Math.max(0, Math.min(1, trackVolume)) * channel.volume;
  if (
    stem === 'system' &&
    settings.duckingEnabled &&
    !settings.mic.muted &&
    settings.mic.volume > 0 &&
    (!hasSolo || settings.mic.solo)
  ) {
    gain *= 0.35;
  }
  return Math.max(0, Math.min(1, gain));
}

export function collectActiveAudioStemSources(
  project: ProjectDocument,
  frame: number,
  soloTrackIds: ReadonlySet<string> = new Set(),
): ActiveAudioStemSource[] {
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const candidates: Array<ActiveAudioStemSource & { trackType: Track['type'] }> = [];

  for (const track of project.composition.tracks) {
    if (!track.visible || track.volume <= 0) continue;
    if (soloTrackIds.size > 0 && !soloTrackIds.has(track.id)) continue;

    for (const clip of track.clips) {
      if (!clip.enabled || frame < clip.timelineIn || frame >= clip.timelineOut) continue;
      const asset = assetsById.get(clip.assetId);
      if (!asset || asset.metadata['isCamera'] === true) continue;
      const stems = getAudioStemPaths(asset);
      if (!stems) continue;

      const settings = getAudioStemMixerSettings(asset);
      const sourceFrame = clip.sourceIn + (frame - clip.timelineIn);
      const pushStem = (stem: AudioStemKind, filePath: string | null) => {
        if (!filePath) return;
        const gain = resolveAudioStemGain(stem, settings, track.volume);
        if (gain <= 0) return;
        candidates.push({
          key: `${clip.id}:${stem}`,
          assetId: asset.id,
          clipId: clip.id,
          stem,
          filePath,
          sourceFrame,
          gain,
          trackType: track.type,
        });
      };

      pushStem('mic', stems.micFilePath);
      pushStem('system', stems.systemAudioFilePath);
    }
  }

  const hasAudioTrackCandidateByAsset = new Set(
    candidates
      .filter((candidate) => candidate.trackType === 'audio')
      .map((candidate) => candidate.assetId),
  );

  return candidates
    .filter(
      (candidate) =>
        candidate.trackType === 'audio' || !hasAudioTrackCandidateByAsset.has(candidate.assetId),
    )
    .map(({ trackType: _trackType, ...candidate }) => candidate);
}
