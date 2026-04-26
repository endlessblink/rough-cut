import { test, expect } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';

test.describe('Record zoom rendering', () => {
  test('active zoom markers visibly change the rendered frame', async ({ appPage }) => {
    await loadPlaybackFixture(appPage, 'record');

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
                  zoom: {
                    ...(asset.presentation?.zoom ?? {}),
                    autoIntensity: 0,
                    markers: [
                      {
                        id: 'test-zoom-marker',
                        startFrame: 0,
                        endFrame: 30,
                        kind: 'manual',
                        strength: 1,
                        focalPoint: { x: 0.5, y: 0.5 },
                        zoomInDuration: 9,
                        zoomOutDuration: 9,
                      },
                    ],
                  },
                },
              }
            : asset,
        ),
      }));
      stores?.transport.getState().seekToFrame(5);
    });
    await expect
      .poll(async () => {
        const stores = await appPage.evaluate(() => {
          const all = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return {
            playheadFrame: all?.transport.getState().playheadFrame ?? -1,
            markerCount:
              all?.project
                .getState()
                .project.assets.flatMap((asset: any) => asset.presentation?.zoom?.markers ?? []).length ?? 0,
          };
        });
        return stores.playheadFrame === 5 && stores.markerCount > 0;
      })
      .toBe(true);

    const before = hashBytes(
      await appPage.locator('[data-testid="record-screen-frame"]').screenshot({ timeout: 5_000 }),
    );

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
                  zoom: {
                    ...(asset.presentation?.zoom ?? {}),
                    autoIntensity: 0,
                    markers: [],
                  },
                },
              }
            : asset,
        ),
      }));
    });
    await expect
      .poll(async () => {
        const after = hashBytes(
          await appPage
            .locator('[data-testid="record-screen-frame"]')
            .screenshot({ timeout: 5_000 }),
        );
        return after !== before;
      })
      .toBe(true);
  });
});

function hashBytes(buffer: Buffer): number {
  let hash = 0;

  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }

  return hash;
}
