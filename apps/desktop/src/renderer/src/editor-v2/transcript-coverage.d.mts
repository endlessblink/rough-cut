import type {
  CleanupDraftRemoval,
  ProjectDocument,
  TranscriptNonSpeechKind,
} from '@rough-cut/project-model';

export type TranscriptCoverageNonWordKind =
  | 'pause'
  | Exclude<TranscriptNonSpeechKind, 'silence'>
  | 'unrecognized';

export interface TranscriptCoverageWordBlock {
  readonly kind: 'word';
  readonly startFrame: number;
  readonly endFrame: number;
  readonly wordIndex: number;
  readonly text: string;
  readonly confidence: number;
}

export interface TranscriptCoverageNonWordBlock {
  readonly kind: TranscriptCoverageNonWordKind;
  readonly startFrame: number;
  readonly endFrame: number;
}

export type TranscriptCoverageBlock =
  | TranscriptCoverageWordBlock
  | TranscriptCoverageNonWordBlock;

export function buildTranscriptCoverage(
  document: Pick<ProjectDocument, 'transcript'>,
  durationFrames: number,
  options?: { readonly minimumReviewFrames?: number },
): readonly TranscriptCoverageBlock[];

export function transcriptCoverageBlockIndexAtFrame(
  blocks: readonly TranscriptCoverageBlock[],
  frame: number,
): number;

export function removeTranscriptBlockRanges<T extends Pick<ProjectDocument, 'transcript'>>(
  document: T,
  selectedBlocks: readonly Pick<
    TranscriptCoverageBlock,
    'startFrame' | 'endFrame'
  >[],
): {
  document: T;
  removals: readonly CleanupDraftRemoval[];
};
