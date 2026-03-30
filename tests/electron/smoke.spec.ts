import { test, expect } from './fixtures/electron-app.js';

test.describe('App smoke', () => {
  test('launches and renders the header', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="app-header"]')).toBeVisible();
  });

  test('starts on the Projects tab', async ({ appPage }) => {
    await expect(appPage.locator('[data-testid="projects-tab-root"]')).toBeVisible();
  });

  test('window has reasonable dimensions', async ({ appPage }) => {
    const size = await appPage.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(size.width).toBeGreaterThanOrEqual(1024);
    expect(size.height).toBeGreaterThanOrEqual(600);
  });
});
