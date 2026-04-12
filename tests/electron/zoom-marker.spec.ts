import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('Zoom markers — Record tab', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
  });

  test('adds a zoom marker via + and applies CSS transform to video host', async ({ appPage }) => {
    // Load the latest recording so durationFrames > 0 and the + button is enabled.
    await appPage.locator('[data-testid="debug-reload"]').click();

    // Wait for the recording to load.
    await appPage.waitForSelector('[data-testid="zoom-host"]', { timeout: 10_000 });

    // Click + to add a manual marker at current playhead (default 1s duration).
    await appPage.locator('[data-testid="zoom-add"]').click();

    // A manual pill should appear on the zoom track.
    const manualMarker = appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]');
    await expect(manualMarker).toHaveCount(1, { timeout: 5_000 });

    // Explicitly seek playhead INSIDE the marker range so we test the zoom pipeline.
    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (window as unknown as {
        __roughcutStores?: { transport: { setState: StoreSetState } };
      }).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 5 });
    });

    // Wait for the transform to update (React re-render).
    await appPage.waitForTimeout(500);

    // Capture diagnostic snapshot: transform + marker pill attributes + playhead.
    const diag = await appPage.evaluate(() => {
      const host = document.querySelector('[data-testid="zoom-host"]') as HTMLElement | null;
      const markers = Array.from(
        document.querySelectorAll('[data-testid="zoom-marker"]'),
      ).map((el) => ({
        kind: (el as HTMLElement).getAttribute('data-marker-kind'),
        title: (el as HTMLElement).getAttribute('title'),
      }));
      return {
        transform: host?.style.transform ?? null,
        markers,
      };
    });
    console.log('[zoom-test] diag:', JSON.stringify(diag));
    const transformAfter = diag.transform ?? '';

    const match = transformAfter.match(/scale\(([\d.]+)\)/);
    expect(match, `transform should include scale(N): "${transformAfter}"`).toBeTruthy();
    const scale = parseFloat(match![1]);

    // With no marker selected and playhead inside the marker range,
    // scale must be > 1. strengthToScale(1) = 2.5, but during ramp-in may be less.
    // Accept anything > 1.0 — proves the zoom pipeline is active.
    expect(scale, `scale should be > 1 when playhead is inside a marker: got ${scale}`).toBeGreaterThan(1);
  });

  test('right-edge drag handle lengthens the marker', async ({ appPage }) => {
    await appPage.locator('[data-testid="debug-reload"]').click();
    await appPage.waitForSelector('[data-testid="zoom-host"]', { timeout: 10_000 });

    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    // Select the marker so the resize handles become visible.
    await appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]').click();
    await appPage.waitForTimeout(200);

    type Store = { getState: () => { project: { assets: Array<{ presentation?: { zoom?: { markers: Array<{ kind: string; endFrame: number; startFrame: number }> } } }> } } };
    const readEnd = () => appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: { project: { getState: () => { project: { assets: Array<{ presentation?: { zoom?: { markers: Array<{ kind: string; endFrame: number }> } } }> } } } } }).__roughcutStores;
      const markers = stores?.project.getState().project.assets
        .flatMap((a) => a.presentation?.zoom?.markers ?? [])
        .filter((m) => m.kind === 'manual');
      return markers?.[0]?.endFrame ?? -1;
    });
    const initialEnd = await readEnd();

    // Drag the right edge handle to the right by ~200px.
    const handle = appPage.locator('[data-testid="zoom-marker-resize-end"]').first();
    const box = await handle.boundingBox();
    expect(box).toBeTruthy();
    await appPage.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await appPage.mouse.down();
    await appPage.mouse.move(box!.x + 200, box!.y + box!.height / 2);
    await appPage.mouse.up();
    await appPage.waitForTimeout(200);

    const finalEnd = await readEnd();
    console.log('[zoom-test] resize end:', { initialEnd, finalEnd });
    expect(finalEnd, 'right-edge drag should increase endFrame').toBeGreaterThan(initialEnd);
  });

  test('zoom remains applied when marker is SELECTED and paused (regression: "second play broken")', async ({ appPage }) => {
    await appPage.locator('[data-testid="debug-reload"]').click();
    await appPage.waitForSelector('[data-testid="zoom-host"]', { timeout: 10_000 });

    // Add a manual marker.
    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    // Seek playhead inside marker range.
    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (window as unknown as {
        __roughcutStores?: { transport: { setState: StoreSetState } };
      }).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 5 });
    });

    // Select the marker (inspector opens).
    await appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]').click();
    await appPage.waitForTimeout(300);

    // With marker selected AND playback paused, zoom should STILL be applied.
    const transform = await appPage.locator('[data-testid="zoom-host"]').first().evaluate(
      (el) => (el as HTMLElement).style.transform,
    );
    console.log('[zoom-test] transform (selected+paused):', transform);
    const match = transform.match(/scale\(([\d.]+)\)/);
    expect(match).toBeTruthy();
    const scale = parseFloat(match![1]);
    expect(scale, `scale should be > 1 when selected + paused inside marker: got ${scale}`).toBeGreaterThan(1);
  });
});
