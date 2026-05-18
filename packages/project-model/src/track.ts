// NLE-level Track types for the AI architecture rewrite.
// Distinct from the existing composition-level `Track` (which lives in types.ts
// inside `Composition.tracks`). Long-term it will subsume the composition-level
// Track, but v14 keeps both side by side while renderer work migrates over.

import type { AssetId, ClipId, Composition, Frame, Track, TrackId } from './types.js';

export type NleTrackKind = 'video' | 'audio' | 'captions' | 'motion-graphics';
export type NleClipSourceKind = 'project-asset' | 'ai-asset';

export interface NleClipSource {
  readonly kind: NleClipSourceKind;
  readonly id: string;
}

export interface NleTrackClip {
  readonly id: ClipId;
  readonly source: NleClipSource;
  readonly timelineIn: Frame;
  readonly timelineOut: Frame;
  readonly sourceIn: Frame;
  readonly sourceOut: Frame;
}

export interface NleTrack {
  readonly id: TrackId;
  readonly kind: NleTrackKind;
  readonly index: number;
  readonly label: string;
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly muted: boolean;
  readonly clips: readonly NleTrackClip[];
}

export interface ResolvedNleClip {
  readonly track: NleTrack;
  readonly clip: NleTrackClip;
}

export interface ResolvedNleFrame {
  readonly video: ResolvedNleClip | null;
  readonly audio: readonly ResolvedNleClip[];
}

export function createNleTracksFromComposition(composition: Pick<Composition, 'tracks'>): NleTrack[] {
  return (composition.tracks ?? []).map((track) => createNleTrackFromCompositionTrack(track));
}

function createNleTrackFromCompositionTrack(track: Track): NleTrack {
  return {
    id: track.id,
    kind: track.type,
    index: track.index,
    label: track.name,
    enabled: track.visible,
    locked: track.locked,
    muted: track.type === 'audio' ? track.volume === 0 || track.visible === false : false,
    clips: track.clips.map((clip) => ({
      id: clip.id,
      source: { kind: 'project-asset', id: clip.assetId as AssetId },
      timelineIn: clip.timelineIn,
      timelineOut: clip.timelineOut,
      sourceIn: clip.sourceIn,
      sourceOut: clip.sourceOut,
    })),
  };
}

export function resolveNleFrame(
  tracks: readonly NleTrack[] | undefined,
  frame: Frame,
): ResolvedNleFrame {
  const targetFrame = Math.round(Number(frame));
  if (!Number.isFinite(targetFrame) || targetFrame < 0 || !Array.isArray(tracks)) {
    return { video: null, audio: [] };
  }

  const activeVideoMatches = tracks
    .filter((track) => track.kind === 'video' && track.enabled && !track.locked)
    .sort((a, b) => b.index - a.index)
    .flatMap((track) => activeClipsForTrack(track, targetFrame));

  const activeAudio = tracks
    .filter((track) => track.kind === 'audio' && track.enabled && !track.locked && !track.muted)
    .sort((a, b) => b.index - a.index)
    .flatMap((track) => activeClipsForTrack(track, targetFrame));

  return { video: activeVideoMatches[0] ?? null, audio: activeAudio };
}

function activeClipsForTrack(track: NleTrack, frame: Frame): ResolvedNleClip[] {
  return track.clips
    .filter((clip) => frame >= clip.timelineIn && frame < clip.timelineOut)
    .map((clip) => ({ track, clip }));
}
