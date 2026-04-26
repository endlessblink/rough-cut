import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

test.describe('Record visibility segments', () => {
  test('visibility segments hide camera and cursor-driven overlays in preview', async ({ appPage }) => {
    test.setTimeout(90_000);

    await navigateToTab(appPage, 'record');
    await loadZoomFixture(appPage, { preserveCursorEvents: true });

    const target = await appPage.evaluate(async () => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const state = stores?.project.getState();
      const recording = state?.project.assets.find(
        (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
      );
      const clip = state?.project.composition.tracks
        .flatMap((track: any) => track.clips)
        .find((entry: any) => entry.assetId === recording?.id);
      const cursorEventsPath = recording?.metadata?.cursorEventsPath as string | null;
      if (!recording?.id || !clip || !cursorEventsPath) {
        return { timelineFrame: 10, sourceFrame: 10, assetId: recording?.id ?? null };
      }

      const content = await (window as unknown as any).roughcut.readTextFile(cursorEventsPath);
      const firstEvent = String(content)
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { frame: number })[0];
      const sourceFrame = firstEvent?.frame ?? 10;

      return {
        assetId: recording.id,
        sourceFrame,
        timelineFrame: (clip.timelineIn ?? 0) + sourceFrame - (clip.sourceIn ?? 0),
      };
    });

    await appPage.evaluate((frame) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(frame);
    }, target.timelineFrame);
    await appPage.waitForTimeout(400);

    await appPage.evaluate(({ assetId, sourceFrame }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      if (!assetId) return;
      stores?.project.getState().upsertRecordingVisibilitySegment(assetId, sourceFrame, {
        cameraVisible: false,
        cursorVisible: false,
        clicksVisible: false,
        overlaysVisible: false,
      });
    }, target);
    await appPage.waitForTimeout(400);

    await appPage.locator('[data-testid="inspector-rail-item"][data-category="visibility"]').click();
    await expect(appPage.locator('[data-testid="inspector-card-active"][data-category="visibility"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-visibility-apply"]')).toBeVisible();
    await expect
      .poll(async () => {
        const cameraFrame = appPage.locator('[data-testid="record-camera-frame"]');
        const count = await cameraFrame.count();
        if (count === 0) return 'missing';
        return (await cameraFrame.first().getAttribute('data-camera-visible')) ?? 'unknown';
      })
      .toMatch(/^(false|missing)$/);

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          const state = stores?.project.getState();
          const recording = state?.project.assets.find(
            (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
          );
          return recording?.presentation?.visibilitySegments?.[0] ?? null;
        }),
      )
      .toMatchObject({
        frame: target.sourceFrame,
        cameraVisible: false,
        cursorVisible: false,
        clicksVisible: false,
        overlaysVisible: false,
      });

    await appPage.screenshot({ path: 'test-results/record-visibility-segments.png', fullPage: true });
  });
});
