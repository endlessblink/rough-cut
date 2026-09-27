export type CutPrerollSegment = {
  timelineIn: number;
  timelineOut: number;
  sourceIn: number;
  sourceOut: number;
  trackIndex?: number;
};

export type CutPrerollPlan =
  | { phase: 'none' | 'idle' }
  | { phase: 'prepare' | 'play'; key: string; seekSourceSec: number; remainingWallSec: number };

export const CUT_PREROLL_PREPARE_SEC: number;
export const CUT_PREROLL_LEAD_SEC: number;
export const CUT_PREROLL_EARLY_FRAMES: number;
export const CUT_PREROLL_LATE_FRAMES: number;

export function isPrerollableCut(active: CutPrerollSegment | null, next: CutPrerollSegment | null): boolean;
export function cutPrerollKey(active: CutPrerollSegment, next: CutPrerollSegment): string;
export function planCutPreroll(input: {
  active: CutPrerollSegment | null;
  next: CutPrerollSegment | null;
  sourceFrame: number;
  fps: number;
  rate?: number;
  prepareSec?: number;
  leadSec?: number;
}): CutPrerollPlan;
export function standbyAlignedForCut(
  standbySourceSec: number,
  next: CutPrerollSegment | null,
  fps: number,
  options?: { earlyFrames?: number; lateFrames?: number },
): boolean;
