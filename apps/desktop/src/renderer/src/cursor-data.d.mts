import type { CursorEvent, ProjectDocument } from '@rough-cut/project-model';

export function getCursorEvents(document: ProjectDocument): ReadonlyArray<CursorEvent>;
export function getCursorClickEvents(document: ProjectDocument): ReadonlyArray<CursorEvent>;
export function getCursorMoveEvents(document: ProjectDocument): ReadonlyArray<CursorEvent>;
export function getRecordingFps(document: ProjectDocument): number;
export function getRecordingSourceSize(document: ProjectDocument): { width: number; height: number };
