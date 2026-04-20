import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';

test('record and export preview render the same screen frame pixels', async ({ appPage }) => {
  test.setTimeout(45_000);

  await loadPlaybackFixture(appPage, 'record');

  await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    stores?.transport.getState().seekToFrame(15);
  });
  await appPage.waitForTimeout(300);

  const recordHash = await captureCanvasPixelHash(appPage, '[data-testid="record-tab-root"]');

  await navigateToTab(appPage, 'export');
  await appPage.waitForTimeout(300);

  const exportHash = await captureCanvasPixelHash(appPage, '[data-testid="export-tab-root"]');

  expect(recordHash).toBe(exportHash);
});

async function captureCanvasPixelHash(
  page: import('@playwright/test').Page,
  rootSelector: string,
): Promise<number> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector) as HTMLElement | null;
    const canvas = root?.querySelector('[data-testid="recording-playback-canvas"] canvas') as
      | HTMLCanvasElement
      | null;
    if (!canvas) return -1;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return -1;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let hash = 0;
    for (const value of data) {
      hash = (hash * 33 + value) % 2147483647;
    }
    return hash;
  }, rootSelector);
}
