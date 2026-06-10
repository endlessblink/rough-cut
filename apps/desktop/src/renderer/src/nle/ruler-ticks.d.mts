export type RulerTick = {
  frame: number;
  leftPct: number;
  major: boolean;
  label: string | null;
};

export function pickTickInterval(durationSeconds: number, pixelsPerSecond: number): number;
export function formatRulerLabel(seconds: number): string;
export function buildRulerTicks(durationFrames: number, fps: number, widthPx: number): RulerTick[];
export function pickMinorInterval(majorInterval: number, pixelsPerSecond: number): number | null;
