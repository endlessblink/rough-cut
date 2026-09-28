import type { FramingRange, ProjectDocument, ZoomFocalPoint } from '@rough-cut/project-model';

export function listFramingRanges(document: ProjectDocument): readonly FramingRange[];

export function addFramingRangeAt(
  document: ProjectDocument,
  options?: {
    readonly startFrame?: number;
    readonly endFrame?: number;
    readonly id?: string;
    readonly focalPoint?: ZoomFocalPoint;
  },
): ProjectDocument;

export function updateFramingRangeRange(
  document: ProjectDocument,
  rangeId: string,
  startFrame: number,
  endFrame: number,
): ProjectDocument;

export function updateFramingRangeFocalPoint(
  document: ProjectDocument,
  rangeId: string,
  focalPoint: ZoomFocalPoint,
): ProjectDocument;

export function removeFramingRange(document: ProjectDocument, rangeId: string): ProjectDocument;
