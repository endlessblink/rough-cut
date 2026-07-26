import {
  resolveCensorFillColor,
  resolveCensorMosaicGrid,
  resolveCensorSoftenRadiusPx,
  resolveCensorSourceScale,
  censorRectToSourceRect,
} from '../../shared/censor-regions.mjs';
import {
  applyScreenSourceTransform,
  type ZoomMotionSourceViewport,
  type ZoomMotionTransform,
} from './zoom-motion-renderer';

/**
 * Censor overlay — hides rectangular areas of the screen recording. (TASK-252)
 *
 * Drawn on the presentation 2D context, inside `applyScreenSourceTransform`, so
 * every coordinate here is a SOURCE-RECORDING pixel. That transform is the same one
 * the cursor overlay draws in, and it already accounts for zoom, pan and crop —
 * which is why there is no source→canvas mapping in this file. Do not add one, and
 * do not move the draw outside the transform: a censor that drifts off its target
 * is a leak, not a cosmetic bug.
 *
 * This runs after whichever compositor path produced the frame (Canvas2D, WebGL or
 * WebGPU), because all of them have blitted their result onto this 2D context by
 * the time it is called. One implementation therefore covers every renderer tier.
 *
 * ## Nothing here ever reads the presentation canvas back
 *
 * The mosaic samples the video element directly into a small offscreen buffer, and
 * the optional softening blur is applied *as that buffer is drawn back up* — so the
 * blur's only input is pixels that have already been destroyed. It cannot
 * reintroduce detail, which is what keeps the censor irreversible rather than
 * merely blurry.
 */

export type CensorOverlayRegion = {
  readonly id: string;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly mode: 'solid' | 'pixelate';
  readonly blockSize: number;
  readonly soften: boolean;
  readonly fillColor?: string;
};

export type CensorOverlayDrawInput = {
  readonly ctx: CanvasRenderingContext2D;
  /** Screen recording element the mosaic samples from. */
  readonly video: CanvasImageSource | null;
  readonly regions: readonly CensorOverlayRegion[] | null | undefined;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly screenRadius: number;
  readonly screenDrawScale: number;
  readonly screenSource: ZoomMotionSourceViewport;
  readonly transform: ZoomMotionTransform;
  /** Live rectangle being dragged out with the censor tool, if any. */
  readonly draftRect?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null;
};

export type { CensorPointerMapping } from '../../shared/screen-source-transform.mjs';
export { canvasPointToSourceNormalized } from '../../shared/screen-source-transform.mjs';

/** Matches `--censor-draft-stroke` in styles.css. */
const CENSOR_DRAFT_STROKE = '#93c5fd';
const CENSOR_DRAFT_FILL = 'rgba(147, 197, 253, 0.16)';

let mosaicCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

function acquireMosaicCanvas(
  width: number,
  height: number,
): {
  canvas: CanvasImageSource;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} | null {
  if (!mosaicCanvas) {
    if (typeof OffscreenCanvas === 'function') mosaicCanvas = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') mosaicCanvas = document.createElement('canvas');
    else return null;
  }
  mosaicCanvas.width = width;
  mosaicCanvas.height = height;
  const ctx = mosaicCanvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  return { canvas: mosaicCanvas as CanvasImageSource, ctx };
}

function addRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draw every active censor region. Returns how many were actually painted — a count
 * below the number of active regions means something was skipped, which is worth
 * surfacing rather than ignoring.
 */
export function drawCensorRegions(input: CensorOverlayDrawInput): number {
  const { ctx, regions } = input;
  const hasRegions = Boolean(regions && regions.length > 0);
  if (!hasRegions && !input.draftRect) return 0;

  const sourceScale = resolveCensorSourceScale({
    screenDrawScale: input.screenDrawScale,
    transform: input.transform,
  });

  let painted = 0;
  ctx.save();
  addRoundedRect(
    ctx,
    input.screenX,
    input.screenY,
    input.screenWidth,
    input.screenHeight,
    input.screenRadius,
  );
  ctx.clip();
  applyScreenSourceTransform(ctx, {
    screenX: input.screenX,
    screenY: input.screenY,
    screenDrawScale: input.screenDrawScale,
    screenSource: input.screenSource,
    transform: input.transform,
  });

  for (const region of regions ?? []) {
    const rect = censorRectToSourceRect(region?.rect, input.sourceWidth, input.sourceHeight);
    // No visible area: draw nothing. Never substitute a default rect — that would
    // paint over the wrong part of the screen and hide the wrong thing.
    if (!rect) continue;

    const previousFilter = ctx.filter;
    const previousSmoothing = ctx.imageSmoothingEnabled;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    const softenRadius = resolveCensorSoftenRadiusPx(region, sourceScale);
    let destroyed = false;

    if (region.mode === 'pixelate' && input.video) {
      const grid = resolveCensorMosaicGrid(rect, region);
      const mosaic = grid ? acquireMosaicCanvas(grid.cols, grid.rows) : null;
      if (grid && mosaic) {
        mosaic.ctx.drawImage(input.video, rect.x, rect.y, rect.w, rect.h, 0, 0, grid.cols, grid.rows);
        // The blur is set before this draw, so its input is the mosaic buffer —
        // already-destroyed pixels — and never the original frame.
        if (softenRadius > 0) {
          ctx.filter = `blur(${softenRadius.toFixed(2)}px)`;
          ctx.imageSmoothingEnabled = true;
        } else {
          ctx.imageSmoothingEnabled = false;
        }
        ctx.drawImage(mosaic.canvas, 0, 0, grid.cols, grid.rows, rect.x, rect.y, rect.w, rect.h);
        destroyed = true;
      }
    }

    if (!destroyed) {
      // Solid is also the fallback when a mosaic cannot be built (no decoded video
      // frame, no 2D context). Failing closed keeps the area hidden; failing open
      // would expose exactly what the user asked to censor.
      //
      // Softening is deliberately a no-op for solid fill: a blurred flat colour
      // clipped to its own rect is indistinguishable from the unblurred one, so
      // there is nothing to soften.
      ctx.fillStyle = resolveCensorFillColor(region);
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    ctx.filter = previousFilter;
    ctx.imageSmoothingEnabled = previousSmoothing;
    ctx.restore();
    painted += 1;
  }

  // The live drag is an outline, not a fill: the user needs to see what is under
  // the rectangle while placing it. It becomes a real censor on pointer-up.
  const draft = censorRectToSourceRect(input.draftRect, input.sourceWidth, input.sourceHeight);
  if (draft) {
    ctx.save();
    ctx.lineWidth = Math.max(1, 1.5 / Math.max(0.0001, sourceScale));
    ctx.strokeStyle = CENSOR_DRAFT_STROKE;
    ctx.fillStyle = CENSOR_DRAFT_FILL;
    ctx.fillRect(draft.x, draft.y, draft.w, draft.h);
    ctx.strokeRect(draft.x, draft.y, draft.w, draft.h);
    ctx.restore();
  }

  ctx.restore();
  return painted;
}
