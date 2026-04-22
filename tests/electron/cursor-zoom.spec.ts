import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

test.describe('Cursor overlay during zoom', () => {
  test('renders cursor overlay outside zoom host and scales cursor independently', async ({
    appPage,
  }) => {
    await navigateToTab(appPage, 'record');
    await loadZoomFixture(appPage);

    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (
        window as unknown as {
          __roughcutStores?: { transport: { setState: StoreSetState } };
        }
      ).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 5 });
    });

    await appPage.waitForTimeout(500);

    const diag = await appPage.evaluate(() => {
      const recordRoot = document.querySelector('[data-testid="record-tab-root"]') as HTMLElement | null;
      const zoomHost = recordRoot?.querySelector('[data-testid="zoom-host"]') as HTMLElement | null;
      const zoomSurface = recordRoot?.querySelector(
        '[data-testid="recording-playback-canvas"]',
      ) as HTMLElement | null;
      const overlayCanvas = zoomHost?.parentElement?.querySelector(
        ':scope > div > canvas',
      ) as HTMLCanvasElement | null;
      const overlayHost = overlayCanvas?.parentElement as HTMLElement | null;
      const zoomContainsCanvas = !!zoomHost?.contains(overlayCanvas ?? null);

      return {
        zoomTransform: zoomSurface ? getComputedStyle(zoomSurface).transform : null,
        overlayInsideZoomHost: zoomContainsCanvas,
        overlayHostPosition: overlayHost ? getComputedStyle(overlayHost).position : null,
        canvasCssWidth: overlayCanvas?.style.width ?? null,
        canvasCssHeight: overlayCanvas?.style.height ?? null,
        canvasWidth: overlayCanvas?.width ?? null,
        canvasHeight: overlayCanvas?.height ?? null,
        devicePixelRatio: window.devicePixelRatio || 1,
      };
    });

    expect(diag.overlayInsideZoomHost).toBe(false);
    expect(diag.overlayHostPosition).toBe('absolute');

    const cssWidth = Number.parseFloat(diag.canvasCssWidth ?? '0');
    const cssHeight = Number.parseFloat(diag.canvasCssHeight ?? '0');
    expect(Math.abs(diag.canvasWidth - cssWidth * diag.devicePixelRatio)).toBeLessThanOrEqual(1);
    expect(Math.abs(diag.canvasHeight - cssHeight * diag.devicePixelRatio)).toBeLessThanOrEqual(1);
  });
});
