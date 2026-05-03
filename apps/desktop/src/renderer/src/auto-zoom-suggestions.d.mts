import type { ProjectDocument, ZoomMarker } from '@rough-cut/project-model';

export interface AutoZoomSuggestionOptions {
  readonly intensity?: number;
}

export interface AutoZoomSuggestions {
  readonly candidates: ZoomMarker[];
  readonly filtered: ZoomMarker[];
  readonly existingManual: ZoomMarker[];
}

export function generateSuggestionsForProject(
  document: ProjectDocument,
  options?: AutoZoomSuggestionOptions,
): AutoZoomSuggestions;
