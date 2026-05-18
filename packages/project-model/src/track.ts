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
  readonly locked: boolean;
  readonly muted: boolean;
  readonly clips: readonly NleTrackClip[];
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
