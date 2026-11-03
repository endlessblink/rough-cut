import type { AudioLevel, ProjectDocument } from './types.js';

// Volume and mute, for the recording's sound track (project settings) and for
// single timeline clips. Stored as an optional `{ volume?, muted? }` object so
// documents from before this existed (and documents nobody touched) stay
// byte-identical: the default level is never written, it is the absence.

/** 0% (silent). */
export const AUDIO_VOLUME_MIN = 0;
/** 200%. */
export const AUDIO_VOLUME_MAX = 2;

export interface ResolvedAudioLevel {
  readonly volume: number;
  readonly muted: boolean;
}

export const DEFAULT_AUDIO_LEVEL: ResolvedAudioLevel = Object.freeze({ volume: 1, muted: false });

/** A volume clamped to 0..2 and rounded to 1%; anything unreadable is 1 (100%). */
export function clampAudioVolume(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 1;
  if (typeof value === 'string' && value.trim() === '') return 1;
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.round(Math.max(AUDIO_VOLUME_MIN, Math.min(AUDIO_VOLUME_MAX, number)) * 100) / 100;
}

/** Fills in the defaults: absent or bad values read as 100%, not muted. */
export function resolveAudioLevel(level: unknown): ResolvedAudioLevel {
  if (!level || typeof level !== 'object') return DEFAULT_AUDIO_LEVEL;
  const record = level as Record<string, unknown>;
  return {
    volume: clampAudioVolume(record['volume']),
    muted: record['muted'] === true,
  };
}

/** The linear gain a level applies: 0 when muted, else its volume. */
export function audioLevelGain(level: unknown): number {
  const resolved = resolveAudioLevel(level);
  return resolved.muted ? 0 : resolved.volume;
}

export function isDefaultAudioLevel(level: unknown): boolean {
  const resolved = resolveAudioLevel(level);
  return resolved.volume === 1 && !resolved.muted;
}

/**
 * The stored form of a level: only the fields that differ from the default,
 * or undefined when nothing does (so untouched data stays absent).
 */
export function audioLevelFromUnknown(level: unknown): AudioLevel | undefined {
  if (!level || typeof level !== 'object') return undefined;
  const resolved = resolveAudioLevel(level);
  const stored: { volume?: number; muted?: boolean } = {};
  if (resolved.volume !== 1) stored.volume = resolved.volume;
  if (resolved.muted) stored.muted = true;
  return stored.volume === undefined && stored.muted === undefined ? undefined : stored;
}

function mergeAudioLevel(current: unknown, patch: AudioLevel): AudioLevel | undefined {
  const resolved = resolveAudioLevel(current);
  return audioLevelFromUnknown({
    volume: patch.volume === undefined ? resolved.volume : patch.volume,
    muted: patch.muted === undefined ? resolved.muted : patch.muted,
  });
}

function sameStoredLevel(left: AudioLevel | undefined, right: AudioLevel | undefined) {
  return (left?.volume ?? 1) === (right?.volume ?? 1) && Boolean(left?.muted) === Boolean(right?.muted);
}

// --- The recording's sound track -------------------------------------------

export function getRecordingAudioLevel(
  settings: { readonly recordingAudio?: unknown } | null | undefined,
): ResolvedAudioLevel {
  return resolveAudioLevel(settings?.recordingAudio);
}

/** Returns the document with the track level changed; the same document when nothing changes. */
export function withRecordingAudioLevel<T extends Pick<ProjectDocument, 'settings'>>(document: T, patch: AudioLevel): T {
  const current = audioLevelFromUnknown(document.settings?.recordingAudio);
  const next = mergeAudioLevel(document.settings?.recordingAudio, patch);
  if (sameStoredLevel(current, next) && (document.settings?.recordingAudio === undefined) === (next === undefined)) return document;
  const { recordingAudio: _previous, ...settings } = document.settings as ProjectDocument['settings'];
  void _previous;
  return { ...document, settings: next ? { ...settings, recordingAudio: next } : settings } as T;
}

// --- Single clips -------------------------------------------------------------

interface ClipLike {
  readonly id: string;
  readonly linkGroupId?: string;
  readonly timelineIn: number;
  readonly timelineOut: number;
  readonly audio?: AudioLevel;
}

interface TimelineLike {
  readonly tracks: readonly { readonly clips: readonly ClipLike[] }[];
}

function timelineClips(document: { readonly timeline?: TimelineLike } | null | undefined): ClipLike[] {
  const tracks = Array.isArray(document?.timeline?.tracks) ? document!.timeline!.tracks : [];
  return tracks.flatMap((track) => (Array.isArray(track?.clips) ? track.clips : []));
}

/**
 * The clips that make up one section of the timeline: the clip itself plus its
 * linked clips (screen, camera and sound of a recording) over the same span.
 */
export function linkedSectionClipIds(document: { readonly timeline?: TimelineLike } | null | undefined, clipId: string): string[] {
  const clips = timelineClips(document);
  const clip = clips.find((candidate) => candidate.id === clipId);
  if (!clip) return [];
  if (!clip.linkGroupId) return [clip.id];
  return clips
    .filter((candidate) => candidate.linkGroupId === clip.linkGroupId
      && candidate.timelineIn === clip.timelineIn
      && candidate.timelineOut === clip.timelineOut)
    .map((candidate) => candidate.id);
}

export function getClipAudioLevel(document: { readonly timeline?: TimelineLike } | null | undefined, clipId: string | null | undefined): ResolvedAudioLevel {
  if (!clipId) return DEFAULT_AUDIO_LEVEL;
  return resolveAudioLevel(timelineClips(document).find((clip) => clip.id === clipId)?.audio);
}

/**
 * Sets volume and/or mute on the given clips (and their linked section). The
 * value is stored on the clips, so splits, trims and moves carry it along.
 * Returns the same document when nothing changes.
 */
export function withClipAudioLevel<T extends { readonly timeline: TimelineLike }>(document: T, clipIds: readonly string[], patch: AudioLevel): T {
  const targets = new Set(clipIds.flatMap((clipId) => linkedSectionClipIds(document, clipId)));
  if (targets.size === 0) return document;
  let changed = false;
  const tracks = document.timeline.tracks.map((track) => {
    let trackChanged = false;
    const clips = track.clips.map((clip) => {
      if (!targets.has(clip.id)) return clip;
      const next = mergeAudioLevel(clip.audio, patch);
      if (sameStoredLevel(audioLevelFromUnknown(clip.audio), next) && (clip.audio === undefined) === (next === undefined)) return clip;
      trackChanged = true;
      const { audio: _previous, ...rest } = clip;
      void _previous;
      return next ? { ...rest, audio: next } : rest;
    });
    if (!trackChanged) return track;
    changed = true;
    return { ...track, clips };
  });
  return changed ? { ...document, timeline: { ...document.timeline, tracks } } as T : document;
}

/** Removes every clip's own level (used when a recording returns to its original state). */
export function withoutClipAudioLevels<T extends { readonly timeline: TimelineLike }>(document: T): T {
  if (!timelineClips(document).some((clip) => clip.audio !== undefined)) return document;
  return {
    ...document,
    timeline: {
      ...document.timeline,
      tracks: document.timeline.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.audio === undefined) return clip;
          const { audio: _previous, ...rest } = clip;
          void _previous;
          return rest;
        }),
      })),
    },
  } as T;
}
