import { test, expect } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';

test('snapshot the rendered cursor sprite for visual review', async ({ appPage }) => {
  await loadPlaybackFixture(appPage, 'record');

  // Seek to a few frames in so the cursor overlay has data
  for (const frame of [60, 120, 240]) {
    await appPage.evaluate((f) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(f);
    }, frame);
    await appPage.waitForTimeout(150);
    // Diagnostic: log canvas count, dimensions, dpr, and cursor data status
    await appPage.waitForTimeout(500);
    const diag = await appPage.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => ({
        cssW: c.clientWidth,
        cssH: c.clientHeight,
        backW: c.width,
        backH: c.height,
        z: getComputedStyle(c).zIndex,
      }));
      const dpr = window.devicePixelRatio;
      const overlay = document.querySelector(
        '[data-testid="record-tab-root"] canvas:nth-of-type(2)',
      ) as HTMLCanvasElement | null;
      return {
        canvases,
        dpr,
        overlayExists: !!overlay,
      };
    });
    console.log(`frame=${frame}`, JSON.stringify(diag));

    // Screenshot a higher container that includes the cursor overlay
    const region = appPage.locator('[data-testid="record-tab-root"]').first();
    await expect(region).toBeVisible();
    await region.screenshot({
      path: `tests/electron/screenshots/cursor-sprite-frame-${frame}.png`,
    });
  }
});
