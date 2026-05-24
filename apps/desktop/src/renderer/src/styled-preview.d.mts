export function cursorAtFrame(
  cursorEvents: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> | null | undefined,
  currentFrame: number,
): { x: number; y: number } | null;

export function cursorAtTimeMs(
  cursorEvents: ReadonlyArray<{ frame?: number; timeMs?: number; x: number; y: number; type?: string }> | null | undefined,
  currentTimeMs: number,
  fps?: number,
): { x: number; y: number } | null;

export function getCursorBoundsStatus(
  cursor: { x: number; y: number } | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
): { inside: boolean; side: 'inside' | 'left' | 'right' | 'top' | 'bottom'; distance: number } | null;

export function drawCursorPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  options?: { style?: 'subtle' | 'default' | 'spotlight'; sizePercent?: number },
): void;

export function activeClickEmphasisAtFrame(
  cursorEvents: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> | null | undefined,
  currentFrame: number,
  durationFrames?: number,
): Array<{ x: number; y: number; progress: number; radius: number; alpha: number }>;

export function drawClickEmphasis(
  ctx: CanvasRenderingContext2D,
  cursorEvents: ReadonlyArray<{ frame: number; x: number; y: number; type?: string }> | null | undefined,
  currentFrame: number,
  clickEffect?: 'none' | 'ring' | 'ripple',
): void;

export function clampedCameraTime(
  sourceTimeSec: number,
  cameraOffsetSec: number,
  cameraDurationSec: number,
  frameRate?: number,
): number;

export function cameraCoversSourceTime(
  sourceTimeSec: number,
  cameraOffsetSec: number,
  cameraDurationSec: number,
  frameRate?: number,
): boolean;

export function coverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destWidth: number,
  destHeight: number,
): { sx: number; sy: number; sw: number; sh: number } | null;

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type PreviewDragOrigin = {
  pointerId: number;
  mode: 'move' | 'resize';
  handle?: ResizeHandle;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  aspect: number;
};

export function frameResizeHandles(
  rect: { x: number; y: number; w: number; h: number },
): Array<{ handle: ResizeHandle; x: number; y: number }>;

export function resizeHandleAtPoint(
  x: number,
  y: number,
  rect: { x: number; y: number; w: number; h: number },
): ResizeHandle | null;

export function cursorForResizeHandle(handle: ResizeHandle): string;

export function moveRectFromPointer(
  origin: Pick<PreviewDragOrigin, 'offsetX' | 'offsetY' | 'width' | 'height'>,
  xCanvas: number,
  yCanvas: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; w: number; h: number };

export function resizeRectFromPointer(
  origin: Pick<PreviewDragOrigin, 'startX' | 'startY' | 'width' | 'height' | 'aspect' | 'handle'>,
  xCanvas: number,
  yCanvas: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; w: number; h: number };

export type TimelineVideoSyncDecision =
  | { action: 'rate'; playbackRate: number }
  | { action: 'seek' }
  | { action: 'hold' };

export function decideTimelineVideoSync(input: {
  drift: number;
  playing: boolean;
  contiguous: boolean;
  baseRate?: number;
  fps?: number;
}): TimelineVideoSyncDecision;
