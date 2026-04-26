import type { Page } from '@playwright/test';

export const CURSOR_OVERLAY_SELECTOR = '[data-testid="cursor-overlay-canvas"]';

export interface CursorOverlayDebugState {
  readonly found: boolean;
  readonly visible: boolean;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly playheadFrame: number;
  readonly sourceFrame: number;
  readonly interpolating: boolean;
  readonly interpolationT: number;
  readonly zoomScale: number;
  readonly zoomTranslateX: number;
  readonly zoomTranslateY: number;
}

export interface CursorOverlayPixelStats {
  readonly found: boolean;
  readonly hash: number;
  readonly nonTransparentPixels: number;
  readonly centroidX: number;
  readonly centroidY: number;
  readonly width: number;
  readonly height: number;
}

export async function waitForCursorOverlayVisible(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    (selector) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
      if (canvas?.dataset.cursorVisible !== 'true') return false;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if ((data[i] ?? 0) > 0) return true;
        }
      } catch {
        return false;
      }
      return false;
    },
    CURSOR_OVERLAY_SELECTOR,
    { timeout },
  );
}

export async function readCursorOverlayDebugState(page: Page): Promise<CursorOverlayDebugState> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
    if (!canvas) {
      return emptyCursorOverlayDebugState();
    }

    return {
      found: true,
      visible: canvas.dataset.cursorVisible === 'true',
      cursorX: Number(canvas.dataset.cursorX ?? 'NaN'),
      cursorY: Number(canvas.dataset.cursorY ?? 'NaN'),
      playheadFrame: Number(canvas.dataset.projectFrame ?? '-1'),
      sourceFrame: Number(canvas.dataset.sourceFrame ?? '-1'),
      interpolating: canvas.dataset.interpolating === 'true',
      interpolationT: Number(canvas.dataset.interpolationT ?? '0'),
      zoomScale: Number(canvas.dataset.zoomScale ?? '0'),
      zoomTranslateX: Number(canvas.dataset.zoomTranslateX ?? '0'),
      zoomTranslateY: Number(canvas.dataset.zoomTranslateY ?? '0'),
    };

    function emptyCursorOverlayDebugState(): CursorOverlayDebugState {
      return {
        found: false,
        visible: false,
        cursorX: Number.NaN,
        cursorY: Number.NaN,
        playheadFrame: -1,
        sourceFrame: -1,
        interpolating: false,
        interpolationT: 0,
        zoomScale: 0,
        zoomTranslateX: 0,
        zoomTranslateY: 0,
      };
    }
  }, CURSOR_OVERLAY_SELECTOR);
}

export async function readCursorOverlayPixelStats(page: Page): Promise<CursorOverlayPixelStats> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return emptyCursorOverlayPixelStats();
    }

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    let sumX = 0;
    let sumY = 0;
    let nonTransparentPixels = 0;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const pixelIndex = (y * canvas.width + x) * 4;
        const alpha = data[pixelIndex + 3] ?? 0;
        if (alpha === 0) continue;

        nonTransparentPixels += 1;
        sumX += x;
        sumY += y;
        hash =
          (hash * 33 +
            (data[pixelIndex] ?? 0) +
            (data[pixelIndex + 1] ?? 0) +
            (data[pixelIndex + 2] ?? 0) +
            alpha +
            pixelIndex) %
          2147483647;
      }
    }

    return {
      found: true,
      hash,
      nonTransparentPixels,
      centroidX: nonTransparentPixels > 0 ? sumX / nonTransparentPixels : Number.NaN,
      centroidY: nonTransparentPixels > 0 ? sumY / nonTransparentPixels : Number.NaN,
      width: canvas.width,
      height: canvas.height,
    };

    function emptyCursorOverlayPixelStats(): CursorOverlayPixelStats {
      return {
        found: false,
        hash: 0,
        nonTransparentPixels: 0,
        centroidX: Number.NaN,
        centroidY: Number.NaN,
        width: 0,
        height: 0,
      };
    }
  }, CURSOR_OVERLAY_SELECTOR);
}
