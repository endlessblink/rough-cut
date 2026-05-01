import type { Asset, ProjectDocument, ZoomMarker } from '@rough-cut/project-model';

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

export function removeMarker(document: ProjectDocument, markerId: string): ProjectDocument;

export function listMarkers(document: ProjectDocument): readonly ZoomMarker[];
