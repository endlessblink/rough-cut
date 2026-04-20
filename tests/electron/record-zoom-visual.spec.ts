import { test, expect } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';

test.describe('Record zoom rendering', () => {
  test('active zoom markers visibly change the rendered frame', async ({ appPage }) => {
    await loadPlaybackFixture(appPage, 'record');

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(5);
    });
    await appPage.waitForTimeout(300);

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
    await appPage.waitForTimeout(300);

    const after = hashBytes(
      await appPage.locator('[data-testid="record-screen-frame"]').screenshot({ timeout: 5_000 }),
    );

    expect(before).not.toBe(after);
  });
});

function hashBytes(buffer: Buffer): number {
  let hash = 0;

  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }

  return hash;
}
