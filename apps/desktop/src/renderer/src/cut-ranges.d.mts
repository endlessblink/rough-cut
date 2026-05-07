import type { ProjectDocument } from '@rough-cut/project-model';

export type CutRange = { id: string; startFrame: number; endFrame: number };

export function listCutRanges(document: ProjectDocument, assetId?: string | null, totalFrames?: number): CutRange[];
export function normalizeCutRanges(ranges: unknown, totalFrames?: number): CutRange[];
export function addCutRange(document: ProjectDocument, assetId: string, startFrame: number, endFrame: number, totalFrames: number): ProjectDocument;
export function removeCutRange(document: ProjectDocument, assetId: string, cutRangeId: string, totalFrames: number): ProjectDocument;
export function clearCutRanges(document: ProjectDocument, assetId: string): ProjectDocument;
export function removedFramesBefore(cutRanges: readonly CutRange[], sourceFrame: number): number;
export function sourceFrameToVisibleFrame(cutRanges: readonly CutRange[], sourceFrame: number): number;
export function visibleFrameToSourceFrame(cutRanges: readonly CutRange[], visibleFrame: number, totalFrames: number): number;
export function visibleDurationFrames(cutRanges: readonly CutRange[], totalFrames: number): number;
