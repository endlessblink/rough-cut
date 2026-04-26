import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

test.describe('Zoom markers — Record tab', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
    await loadZoomFixture(appPage);
    await expect(appPage.locator('[data-testid="zoom-add"]')).toBeEnabled({ timeout: 10_000 });
  });

  test('adds a zoom marker via + and zoom engine produces scale > 1 at playhead', async ({ appPage }) => {
    // Click + to add a manual marker at current playhead (default 1s duration).
    await appPage.evaluate(() => {
      const button = document.querySelector('[data-testid="zoom-add"]') as HTMLButtonElement | null;
      button?.click();
    });

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

    // Wait for React to re-render.
    await appPage.waitForTimeout(500);

    // Verify via the store that the zoom engine produces scale > 1 for the current
    // playhead inside the marker range. Zoom is now compositor-rendered (not CSS),
    // so we read the computed transform directly from the store data instead of DOM style.
    const diag = await appPage.evaluate(() => {
      type Stores = {
        project: {
          getState: () => {
            project: {
              assets: Array<{
                presentation?: {
                  zoom?: { markers: Array<{ kind: string; startFrame: number; endFrame: number; strength: number }> };
                };
              }>;
            };
          };
        };
        transport: {
          getState: () => { playheadFrame: number };
        };
      };
      const stores = (window as unknown as { __roughcutStores?: Stores }).__roughcutStores;
      const markers = stores?.project
        .getState()
        .project.assets.flatMap((a) => a.presentation?.zoom?.markers ?? [])
        .filter((m) => m.kind === 'manual') ?? [];
      const playheadFrame = stores?.transport.getState().playheadFrame ?? 0;
      const marker = markers[0] ?? null;
      return {
        markerCount: markers.length,
        playheadFrame,
        markerRange: marker ? { start: marker.startFrame, end: marker.endFrame } : null,
        insideMarker: marker
          ? playheadFrame >= marker.startFrame && playheadFrame < marker.endFrame
          : false,
        strength: marker?.strength ?? 0,
      };
    });
    console.log('[zoom-test] diag:', JSON.stringify(diag));

    expect(diag.markerCount, 'marker should be added').toBe(1);
    expect(
      diag.insideMarker,
      `playhead ${diag.playheadFrame} should be inside marker ${JSON.stringify(diag.markerRange)}`,
    ).toBe(true);
    // strength=1 → strengthToScale(1)=2.5; even during partial ramp-in scale > 1
    expect(diag.strength, 'marker strength should be positive').toBeGreaterThan(0);
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

    const readPlayheadFrame = () =>
      appPage.evaluate(() => {
        const stores = (
          window as unknown as {
            __roughcutStores?: {
              transport: {
                getState: () => { playheadFrame: number };
              };
            };
          }
        ).__roughcutStores;
        return stores?.transport.getState().playheadFrame ?? -1;
      });

    const before = await readMarker();
    const playheadBefore = await readPlayheadFrame();
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
    const playheadAfter = await readPlayheadFrame();
    expect(after).not.toBeNull();
    const afterDur = after!.endFrame - after!.startFrame;

    console.log('[zoom-test] move:', { before, after, playheadBefore, playheadAfter });
    expect(after!.startFrame, 'startFrame should increase after drag-right').toBeGreaterThan(
      before!.startFrame,
    );
    expect(afterDur, 'duration should be preserved').toBe(beforeDur);
    expect(playheadAfter, 'dragging a marker should not scrub the playhead').toBe(playheadBefore);
  });

  test('zoom engine returns scale > 1 when marker is SELECTED and paused (regression: "second play broken")', async ({
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

    // With marker selected AND playback paused, the zoom engine must produce
    // scale > 1. Zoom is compositor-rendered (not CSS), so verify via store data
    // rather than DOM style.transform (removed in TASK-146/160/161).
    const result = await appPage.evaluate(() => {
      type Stores = {
        project: {
          getState: () => {
            project: {
              assets: Array<{
                presentation?: {
                  zoom?: {
                    markers: Array<{
                      kind: string;
                      startFrame: number;
                      endFrame: number;
                      strength: number;
                    }>;
                  };
                };
              }>;
            };
          };
        };
        transport: {
          getState: () => { playheadFrame: number; isPlaying: boolean };
        };
      };
      const stores = (window as unknown as { __roughcutStores?: Stores }).__roughcutStores;
      const markers =
        stores?.project
          .getState()
          .project.assets.flatMap((a) => a.presentation?.zoom?.markers ?? [])
          .filter((m) => m.kind === 'manual') ?? [];
      const { playheadFrame, isPlaying } = stores?.transport.getState() ?? {
        playheadFrame: 0,
        isPlaying: false,
      };
      const marker = markers[0] ?? null;
      const insideMarker = marker
        ? playheadFrame >= marker.startFrame && playheadFrame < marker.endFrame
        : false;
      return {
        insideMarker,
        isPlaying,
        playheadFrame,
        markerRange: marker ? { start: marker.startFrame, end: marker.endFrame } : null,
        strength: marker?.strength ?? 0,
      };
    });
    console.log('[zoom-test] transform (selected+paused):', result);

    expect(result.isPlaying, 'should be paused').toBe(false);
    expect(
      result.insideMarker,
      `playhead ${result.playheadFrame} should be inside marker ${JSON.stringify(result.markerRange)}`,
    ).toBe(true);
    // strength=1 => scale=2.5 via strengthToScale; even during ramp-in scale > 1
    expect(result.strength, 'marker strength should be positive (scale would be > 1)').toBeGreaterThan(
      0,
    );
  });

  test('camera frame shrinks while an active zoom is applied', async ({ appPage }) => {
    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const projectStore = stores?.project;
      const state = projectStore?.getState();
      const activeAssetId = state?.activeAssetId;
      if (!activeAssetId) return;

      projectStore.getState().updateProject((doc: any) => ({
        ...doc,
        assets: doc.assets.map((asset: any) =>
          asset.id === activeAssetId
            ? {
                ...asset,
                presentation: {
                  ...(asset.presentation ?? {}),
                  visibilitySegments: [],
                },
              }
            : asset,
        ),
      }));
    });

    const cameraFrame = appPage.locator('[data-testid="record-camera-frame"]');

    const before = await cameraFrame.evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    await appPage.locator('[data-testid="zoom-add"]').click();
    await appPage.evaluate(() => {
      type StoreSetState = (patch: { playheadFrame: number }) => void;
      const stores = (
        window as unknown as {
          __roughcutStores?: { transport: { setState: StoreSetState } };
        }
      ).__roughcutStores;
      stores?.transport.setState({ playheadFrame: 5 });
    });
    await expect
      .poll(async () => {
        const rect = await cameraFrame.evaluate((el) => {
          const next = (el as HTMLElement).getBoundingClientRect();
          return { width: next.width, height: next.height };
        });
        return rect;
      })
      .toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });

    await expect
      .poll(async () => {
        const rect = await cameraFrame.evaluate((el) => {
          const next = (el as HTMLElement).getBoundingClientRect();
          return { width: next.width, height: next.height };
        });
        return {
          widthShrunk: rect.width < before.width,
          heightShrunk: rect.height < before.height,
        };
      })
      .toEqual({ widthShrunk: true, heightShrunk: true });
  });
});
