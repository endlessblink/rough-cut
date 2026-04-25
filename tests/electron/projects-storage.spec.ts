import { test, expect, navigateToTab } from './fixtures/electron-app.js';

async function installStorageOverrides(appPage: import('@playwright/test').Page) {
  await appPage.evaluate(() => {
    const state = {
      location: '/mnt/alpha/projects/captures/session-01',
      pickedPath: '/mnt/zeta/projects/captures/session-99',
      volumes: [
        { path: '/mnt/alpha', name: 'Alpha Drive' },
        { path: '/mnt/beta', name: 'Beta Drive' },
      ],
      favorites: [],
    };
    (window as any).__storageTestState = state;
    (window as any).__roughcutTestOverrides = {
      storageGetRecordingLocation: async () => state.location,
      storageGetMountedVolumes: async () => state.volumes,
      storageGetFavorites: async () => [...state.favorites],
      storageSetRecordingLocation: async (path: string) => {
        state.location = path;
      },
      storagePickDirectory: async () => state.pickedPath,
      storageAddFavorite: async (path: string) => {
        if (!state.favorites.includes(path)) state.favorites.push(path);
      },
      storageRemoveFavorite: async (path: string) => {
        state.favorites = state.favorites.filter((entry: string) => entry !== path);
      },
    };
  });

  await navigateToTab(appPage, 'record');
  await navigateToTab(appPage, 'projects');
}

test.describe('Projects storage section', () => {
  test('shows the current location, supports quick volume picks, and uses the Change flow', async ({
    appPage,
  }) => {
    await installStorageOverrides(appPage);

    await expect(appPage.locator('[data-testid="storage-section"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="storage-current-location"]')).toHaveAttribute(
      'title',
      '/mnt/alpha/projects/captures/session-01',
    );

    await expect(appPage.locator('[data-testid="storage-volume-chip"]')).toHaveCount(2);
    await appPage.locator('[data-testid="storage-volume-chip"]').nth(1).click();
    await expect(appPage.locator('[data-testid="storage-current-location"]')).toContainText(
      '/mnt/beta',
    );

    await appPage.locator('[data-testid="storage-change-button"]').click();
    await expect(appPage.locator('[data-testid="storage-current-location"]')).toContainText(
      '/mnt/zeta',
    );
  });

  test('adds and removes favorite locations without duplicating them', async ({ appPage }) => {
    await installStorageOverrides(appPage);

    const addFavorite = appPage.locator('[data-testid="storage-add-favorite"]');
    await expect(addFavorite).toBeVisible();
    await addFavorite.click();
    await expect(appPage.locator('[data-testid="storage-favorite-chip"]')).toHaveCount(1);
    await expect(appPage.locator('[data-testid="storage-add-favorite"]')).toHaveCount(0);

    await navigateToTab(appPage, 'record');
    await navigateToTab(appPage, 'projects');

    const favoriteChip = appPage.locator('[data-testid="storage-favorite-chip"]');
    await expect(favoriteChip).toHaveCount(1);
    await favoriteChip.hover();
    await appPage.locator('[data-testid="storage-favorite-remove"]').click();
    await expect(appPage.locator('[data-testid="storage-favorite-chip"]')).toHaveCount(0);
    await expect(appPage.locator('[data-testid="storage-add-favorite"]')).toHaveCount(1);
  });
});
