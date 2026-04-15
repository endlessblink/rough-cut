import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

test.describe('Zoom markers — Record tab', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
    await loadZoomFixture(appPage);
    await expect(appPage.locator('[data-testid="zoom-add"]')).toBeEnabled({ timeout: 10_000 });
  });

  test('adds a zoom marker via + and applies CSS transform to video host', async ({ appPage }) => {
    // Click + to add a manual marker at current playhead (default 1s duration).
    await appPage.locator('[data-testid="zoom-add"]').click();

    // A manual pill should appear on the zoom track.
    const manualMarker = appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]');
    await expect(manualMarker).toHaveCount(1, { timeout: 5_000 });

    // Explicitly seek playhead INSIDE the marker range so we test the zoom pipeline.
    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (
        window as unknown as {
          __roughcutStores?: { transport: { setState: StoreSetState } };
        }
      ).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 5 });
    });

    // Wait for the transform to update (React re-render).
    await appPage.waitForTimeout(500);

    // Capture diagnostic snapshot: transform + marker pill attributes + playhead.
    const diag = await appPage.evaluate(() => {
      const host = document.querySelector('[data-testid="zoom-host"]') as HTMLElement | null;
      const markers = Array.from(document.querySelectorAll('[data-testid="zoom-marker"]')).map(
        (el) => ({
          kind: (el as HTMLElement).getAttribute('data-marker-kind'),
          title: (el as HTMLElement).getAttribute('title'),
        }),
      );
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
    expect(
      scale,
      `scale should be > 1 when playhead is inside a marker: got ${scale}`,
    ).toBeGreaterThan(1);
  });

  test('right-edge drag handle lengthens the marker', async ({ appPage }) => {
    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    // Select the marker so the resize handles become visible.
    await appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]').click();
    await appPage.waitForTimeout(200);

    type Store = {
      getState: () => {
        project: {
          assets: Array<{
            presentation?: {
              zoom?: { markers: Array<{ kind: string; endFrame: number; startFrame: number }> };
            };
          }>;
        };
      };
    };
    const readEnd = () =>
      appPage.evaluate(() => {
        const stores = (
          window as unknown as {
            __roughcutStores?: {
              project: {
                getState: () => {
                  project: {
                    assets: Array<{
                      presentation?: {
                        zoom?: { markers: Array<{ kind: string; endFrame: number }> };
                      };
                    }>;
                  };
                };
              };
            };
          }
        ).__roughcutStores;
        const markers = stores?.project
          .getState()
          .project.assets.flatMap((a) => a.presentation?.zoom?.markers ?? [])
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

  test('dragging the marker body moves it along the timeline preserving duration', async ({
    appPage,
  }) => {
    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    const readMarker = () =>
      appPage.evaluate(() => {
        const stores = (
          window as unknown as {
            __roughcutStores?: {
              project: {
                getState: () => {
                  project: {
                    assets: Array<{
                      presentation?: {
                        zoom?: {
                          markers: Array<{ kind: string; startFrame: number; endFrame: number }>;
                        };
                      };
                    }>;
                  };
                };
              };
            };
          }
        ).__roughcutStores;
        const markers = stores?.project
          .getState()
          .project.assets.flatMap((a) => a.presentation?.zoom?.markers ?? [])
          .filter((m) => m.kind === 'manual');
        return markers?.[0] ?? null;
      });

    const before = await readMarker();
    expect(before).not.toBeNull();
    const beforeDur = before!.endFrame - before!.startFrame;

    // Drag the marker body by ~150px to the right.
    const pill = appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]').first();
    const box = await pill.boundingBox();
    expect(box).toBeTruthy();
    // Grab the middle of the pill (avoid the edge resize zones).
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    await appPage.mouse.move(startX, startY);
    await appPage.mouse.down();
    await appPage.mouse.move(startX + 150, startY, { steps: 10 });
    await appPage.mouse.up();
    await appPage.waitForTimeout(200);

    const after = await readMarker();
    expect(after).not.toBeNull();
    const afterDur = after!.endFrame - after!.startFrame;

    console.log('[zoom-test] move:', { before, after });
    expect(after!.startFrame, 'startFrame should increase after drag-right').toBeGreaterThan(
      before!.startFrame,
    );
    expect(afterDur, 'duration should be preserved').toBe(beforeDur);
  });

  test('zoom remains applied when marker is SELECTED and paused (regression: "second play broken")', async ({
    appPage,
  }) => {
    // Add a manual marker.
    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    // Seek playhead inside marker range.
    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (
        window as unknown as {
          __roughcutStores?: { transport: { setState: StoreSetState } };
        }
      ).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 5 });
    });

    // Select the marker (inspector opens).
    await appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]').click();
    await appPage.waitForTimeout(300);

    // With marker selected AND playback paused, zoom should STILL be applied.
    const transform = await appPage
      .locator('[data-testid="zoom-host"]')
      .first()
      .evaluate((el) => (el as HTMLElement).style.transform);
    console.log('[zoom-test] transform (selected+paused):', transform);
    const match = transform.match(/scale\(([\d.]+)\)/);
    expect(match).toBeTruthy();
    const scale = parseFloat(match![1]);
    expect(
      scale,
      `scale should be > 1 when selected + paused inside marker: got ${scale}`,
    ).toBeGreaterThan(1);
  });

  test('recreates auto zoom markers after they were removed', async ({ appPage }) => {
    await loadZoomFixture(appPage);
    await expect(appPage.locator('[data-testid="zoom-add"]')).toBeEnabled({ timeout: 10_000 });

    const cursorFixturePath = join(tmpdir(), `rough-cut-auto-zoom-${Date.now()}.cursor.ndjson`);
    await fs.writeFile(
      cursorFixturePath,
      [
        JSON.stringify({ frame: 12, x: 960, y: 540, type: 'down', button: 0 }),
        JSON.stringify({ frame: 90, x: 1440, y: 810, type: 'down', button: 0 }),
      ].join('\n') + '\n',
      'utf-8',
    );

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const state = stores?.project.getState();
      const activeAssetId = state?.activeAssetId;
      if (!activeAssetId) return;
      state.setRecordingAutoZoomIntensity(activeAssetId, 0.5);
      state.replaceAutoZoomMarkers(activeAssetId, []);
    });

    await appPage.evaluate((cursorEventsPath) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const state = stores?.project.getState();
      const activeAssetId = state?.activeAssetId;
      if (!activeAssetId) return;
      state.updateProject((project: any) => ({
        ...project,
        assets: project.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                metadata: {
                  ...asset.metadata,
                  cursorEventsPath,
                },
              }
            : asset,
        ),
      }));
    }, cursorFixturePath);

    await navigateToTab(appPage, 'record');
    await appPage.locator('[data-testid="inspector-rail-item"][data-category="zoom"]').click();
    await appPage.locator('button:has-text("Recreate auto zoom")').click();

    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="auto"]'),
    ).toHaveCount(2, { timeout: 5_000 });
  });
});
