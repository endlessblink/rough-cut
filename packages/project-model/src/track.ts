// NLE-level Track types for the v13 AI architecture rewrite (P-AI-C / TASK-162).
// Distinct from the existing composition-level `Track` (which lives in types.ts
// inside `Composition.tracks`). The new NLE track model adds a `kind` field
// spanning video / audio / captions / motion-graphics and a simplified clip
// shape — long-term it will subsume the composition-level Track, but v13 keeps
// both side by side under `ProjectDocument.tracks?` (optional).

import type { AssetId, Frame, TrackId } from './types.js';

export type NleTrackKind = 'video' | 'audio' | 'captions' | 'motion-graphics';

export interface NleTrackClip {
  readonly assetId: AssetId;
  readonly timelineIn: Frame;
  readonly timelineOut: Frame;
  readonly sourceIn: Frame;
  readonly sourceOut: Frame;
}

export interface NleTrack {
  readonly id: TrackId;
  readonly kind: NleTrackKind;
  readonly label: string;
  readonly locked: boolean;
  readonly muted: boolean;
  readonly clips: readonly NleTrackClip[];
}
