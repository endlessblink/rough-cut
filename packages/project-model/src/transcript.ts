// Transcript types for the v13 AI architecture rewrite (P-AI-C / TASK-162).
// Pure type-level addition — no runtime code, no schemas (schemas land in TASK-163).

import type { Frame, TranscriptWord } from './types.js';

// Re-export the existing TranscriptWord so consumers of `transcript.ts` get the
// full set in one import.
export type { TranscriptWord };

export interface TranscriptParagraph {
  readonly startFrame: Frame;
  readonly endFrame: Frame;
  readonly text: string;
  readonly speaker?: string;
}

export type TranscriptNonSpeechKind = 'silence' | 'music' | 'noise';

export interface TranscriptNonSpeechSegment {
  readonly kind: TranscriptNonSpeechKind;
  readonly startFrame: Frame;
  readonly endFrame: Frame;
}

export interface Transcript {
  readonly words: readonly TranscriptWord[];
  readonly paragraphs: readonly TranscriptParagraph[];
  readonly nonSpeech: readonly TranscriptNonSpeechSegment[];
}
