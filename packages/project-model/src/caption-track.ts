// Caption-track types for the v13 AI architecture rewrite (P-AI-C / TASK-162).
// Pure type-level addition. The existing `CaptionStyle` interface in types.ts
// describes per-segment rendering style (fontSize/position/backgroundOpacity).
// This file introduces a distinct concept — the *kind* of caption track
// (subtitle / submagic / karaoke) — under the name `CaptionStyleKind` to
// avoid colliding with the existing export.

import type { Frame } from './types.js';

export type CaptionTrackId = string & { readonly __brand: 'CaptionTrackId' };

export type CaptionStyleKind = 'subtitle' | 'submagic' | 'karaoke';

export interface CaptionPhrase {
  readonly text: string;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly emphasisWordIndex?: number;
  readonly paletteColorIndex?: number;
}

export interface CaptionTrack {
  readonly id: CaptionTrackId;
  readonly style: CaptionStyleKind;
  readonly phrases: readonly CaptionPhrase[];
}
