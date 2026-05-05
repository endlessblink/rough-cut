export function cursorAtFrame(
  cursorEvents: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> | null | undefined,
  currentFrame: number,
): { x: number; y: number } | null;

export function drawCursorPath(ctx: CanvasRenderingContext2D, x: number, y: number): void;

export function coverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): { sx: number; sy: number; sw: number; sh: number } | null;
