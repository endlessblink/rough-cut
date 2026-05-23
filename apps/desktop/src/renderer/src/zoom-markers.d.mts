import type { Asset, ProjectDocument, RecordingPresentation, ZoomMarker, ZoomPresentation } from '@rough-cut/project-model';

export function getPrimaryRecordingAsset(document: ProjectDocument): Asset | null;

export function canAddMarkerAt(
  document: ProjectDocument,
  currentTimeSec: number,
  fps: number,
  minSpanFrames?: number,
): boolean;

export function addManualMarkerAt(
  document: ProjectDocument,
  currentTimeSec: number,
  fps: number,
): ProjectDocument;

export function findAvailableSpan(
  document: ProjectDocument,
  atFrame: number,
  options?: { defaultSpan?: number; minSpan?: number },
): { startFrame: number; endFrame: number } | null;

export function addManualMarkerAtFrame(
  document: ProjectDocument,
  atFrame: number,
  fps: number,
  options?: { defaultSpan?: number; minSpan?: number },
): ProjectDocument;

export function removeMarker(document: ProjectDocument, markerId: string): ProjectDocument;

export function updateMarkerRange(
  document: ProjectDocument,
  markerId: string,
  startFrame: number,
  endFrame: number,
  options?: { minDurationFrames?: number },
): ProjectDocument;

export function updateMarkerStrength(document: ProjectDocument, markerId: string, strength: number): ProjectDocument;

export function updateMarkerFocalPoint(
  document: ProjectDocument,
  markerId: string,
  x: number,
  y: number,
): ProjectDocument;

export function listMarkers(document: ProjectDocument): readonly ZoomMarker[];

export function applySuggestion(
  document: ProjectDocument,
  suggestion: ZoomMarker,
): ProjectDocument;

export function withDefaultPresentation(
  presentation?: Partial<RecordingPresentation>,
): RecordingPresentation;

export function getZoomPresentation(document: ProjectDocument): ZoomPresentation | null;

export function patchZoomPresentation(
  document: ProjectDocument,
  patch: Partial<ZoomPresentation>,
): ProjectDocument;
