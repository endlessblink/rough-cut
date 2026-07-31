import type {
  CleanupDraftRemoval,
  ProjectDocument,
} from '@rough-cut/project-model';

export function applyTranscriptTextEdit(
  document: ProjectDocument,
  value: string,
  durationFrames: number,
): {
  document: ProjectDocument;
  removals: readonly CleanupDraftRemoval[];
};
