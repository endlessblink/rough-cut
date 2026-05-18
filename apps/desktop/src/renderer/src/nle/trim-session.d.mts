export type TrimEdge = 'left' | 'right';

export interface TrimRange {
  timelineIn: number;
  timelineOut: number;
  sourceIn: number;
  sourceOut: number;
}

export interface TrimSession {
  clipId: string;
  edge: TrimEdge;
  original: TrimRange;
  bounds: { start: number; end: number };
  durationFrames: number;
  startFrame: number;
  preview: TrimRange;
  snapFrame: number | null;
  invalidReason: string | null;
}

export function createTrimSession(project: unknown, clipId: string, edge: TrimEdge, startFrame: number, durationFrames: number): TrimSession | null;
export function updateTrimSession(session: TrimSession | null, frame: number): TrimSession | null;
