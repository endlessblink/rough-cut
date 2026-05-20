export interface NleDragSession {
  readonly clipId: string;
  readonly originalTrackId: string;
  readonly targetTrackId: string;
  readonly kind: string;
  readonly duration: number;
  readonly durationFrames: number;
  readonly grabOffsetFrames: number;
  readonly original: { readonly timelineIn: number; readonly timelineOut: number; readonly sourceIn: number; readonly sourceOut: number };
  readonly preview: { readonly trackId: string; readonly timelineIn: number; readonly timelineOut: number };
  readonly valid: boolean;
  readonly invalidReason: string | null;
}

export function createDragSession<T>(project: T, clipId: string, pointerFrame: number, durationFrames: number): NleDragSession | null;
export function updateDragSession<T>(session: NleDragSession, project: T, input: { readonly timelineIn: number; readonly targetTrackId?: string | null }): NleDragSession;
export function timelineInFromPointerFrame(session: NleDragSession, pointerFrame: number): number;
export function computeMoveBounds<T>(document: T, clipId: string, targetTrackId: string, duration: number, durationFrames: number, anchorFrame?: number | null): { readonly min: number; readonly max: number };
export function trackIdFromClientY(clientY: number): string | null;
