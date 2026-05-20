export function removeClipById<T>(project: T, clipId: string): T;
export function splitClipById<T>(project: T, clipId: string, splitFrame: number): T;
export function canSplitClipById<T>(project: T, clipId: string, splitFrame: number): boolean;
export function trimClipById<T>(project: T, clipId: string, edge: 'left' | 'right', frame: number): T;
export function moveClipById<T>(project: T, clipId: string, timelineIn: number, targetTrackId?: string): T;
export function updateTrackById<T>(project: T, trackId: string, patch: Record<string, unknown>): T;
export function reorderTrackById<T>(project: T, trackId: string, direction: 'up' | 'down'): T;
