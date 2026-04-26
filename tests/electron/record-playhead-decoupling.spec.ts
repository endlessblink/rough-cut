import { test, expect } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';

const TIMELINE = '[data-testid="record-timeline"]';
const LABEL_WIDTH = 32;

test.describe('Record playhead decoupling', () => {
  test('timeline scrubbing updates the playhead through the UI', async ({ appPage }) => {
    await loadRecordedProject(appPage);

    const durationFrames = await readDurationFrames(appPage);
    expect(durationFrames).toBeGreaterThan(30);

    const timeline = appPage.locator(TIMELINE);
    const box = await timeline.boundingBox();
    expect(box).toBeTruthy();

    const clickRatio = 0.64;
    const clipWidth = box!.width - LABEL_WIDTH;
    const clickX = box!.x + LABEL_WIDTH + clipWidth * clickRatio;
    const clickY = box!.y + 84;
    const expectedFrame = Math.round(durationFrames * clickRatio);

    await appPage.mouse.click(clickX, clickY);
    await appPage.waitForTimeout(250);

    const playheadFrame = await readPlayheadFrame(appPage);
    expect(Math.abs(playheadFrame - expectedFrame)).toBeLessThanOrEqual(3);
  });

  test('adding a zoom marker uses the latest playhead after scrubbing', async ({ appPage }) => {
    await loadRecordedProject(appPage);

    const durationFrames = await readDurationFrames(appPage);
    expect(durationFrames).toBeGreaterThan(60);

    const timeline = appPage.locator(TIMELINE);
    const box = await timeline.boundingBox();
    expect(box).toBeTruthy();

    const clickRatio = 0.52;
    const clipWidth = box!.width - LABEL_WIDTH;
    const clickX = box!.x + LABEL_WIDTH + clipWidth * clickRatio;
    const clickY = box!.y + 84;

    await appPage.mouse.click(clickX, clickY);
    await appPage.waitForTimeout(250);

    const playheadFrame = await readPlayheadFrame(appPage);
    const beforeMarkers = await readManualZoomMarkers(appPage);

    await appPage.locator('[data-testid="zoom-add"]').click();
    await appPage.waitForTimeout(250);

    const afterMarkers = await readManualZoomMarkers(appPage);
    expect(afterMarkers.length).toBe(beforeMarkers.length + 1);

    const addedMarker = afterMarkers[afterMarkers.length - 1];
    expect(addedMarker).toBeTruthy();
    expect(Math.abs(addedMarker.startFrame - playheadFrame)).toBeLessThanOrEqual(1);
    expect(addedMarker.endFrame).toBeGreaterThan(addedMarker.startFrame);
  });
});

async function loadRecordedProject(page: import('@playwright/test').Page): Promise<void> {
  await loadPlaybackFixture(page, 'record');
  await expect(page.locator('[data-testid="zoom-add"]')).toBeEnabled();
}

async function readDurationFrames(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.project.getState().project.composition.duration ?? 0;
  });
}

async function readPlayheadFrame(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.transport.getState().playheadFrame ?? -1;
  });
}

async function readManualZoomMarkers(
  page: import('@playwright/test').Page,
): Promise<Array<{ startFrame: number; endFrame: number }>> {
  return page.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const assets = stores?.project.getState().project.assets ?? [];

    return assets
      .flatMap((asset: any) => asset.presentation?.zoom?.markers ?? [])
      .filter((marker: any) => marker.kind === 'manual')
      .map((marker: any) => ({ startFrame: marker.startFrame, endFrame: marker.endFrame }))
      .sort((a: any, b: any) => a.startFrame - b.startFrame);
  });
}
