export interface ScreenSourceViewport {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ScreenSourceCameraTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface ScreenSourceTransformInput {
  readonly screenX: number;
  readonly screenY: number;
  readonly screenDrawScale: number;
  readonly screenSource: ScreenSourceViewport;
  readonly transform: ScreenSourceCameraTransform;
}

/** Everything needed to invert the transform for pointer input. */
export interface CensorPointerMapping extends ScreenSourceTransformInput {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

export function applyScreenSourceTransform(
  ctx: CanvasRenderingContext2D,
  input: ScreenSourceTransformInput,
): void;

export function canvasPointToSourceNormalized(
  mapping: CensorPointerMapping | null,
  canvasX: number,
  canvasY: number,
): { x: number; y: number } | null;
