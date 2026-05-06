export function cursorAtFrame(
  cursorEvents: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> | null | undefined,
  currentFrame: number,
): { x: number; y: number } | null;

export function drawCursorPath(ctx: CanvasRenderingContext2D, x: number, y: number): void;

export function activeClickEmphasisAtFrame(
  cursorEvents: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> | null | undefined,
  currentFrame: number,
  durationFrames?: number,
): Array<{ x: number; y: number; progress: number; radius: number; alpha: number }>;

export function drawClickEmphasis(
  ctx: CanvasRenderingContext2D,
  cursorEvents: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> | null | undefined,
  currentFrame: number,
): void;

export function coverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): { sx: number; sy: number; sw: number; sh: number } | null;
