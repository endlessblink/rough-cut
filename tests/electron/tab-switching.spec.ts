import { test, expect } from './fixtures/electron-app.js';

test.describe('Tab switching', () => {
  const tabs = [
    { id: 'record', root: 'record-tab-root' },
    { id: 'edit', root: 'edit-tab-root' },
    // 'motion' tab is hidden from the header (AppHeader.tsx APP_VIEW_TABS) until
    // the Motion MVP UI lands. Re-add this entry when the tab is visible again.
    { id: 'ai', root: 'ai-tab-root' },
    { id: 'export', root: 'export-tab-root' },
    { id: 'projects', root: 'projects-tab-root' },
  ];

  for (const tab of tabs) {
    test(`navigates to ${tab.id} tab`, async ({ appPage }) => {
      const errors: { text: string; url: string }[] = [];
      appPage.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push({ text: msg.text(), url: msg.location().url ?? '' });
        }
      });

      await appPage.click(`[data-testid="tab-${tab.id}"]`);
      await expect(appPage.locator(`[data-testid="${tab.root}"]`)).toBeVisible({ timeout: 5_000 });

      // Drop benign noise. Note: Chromium puts the resource URL in
      // msg.location(), NOT the error text — so the URL is checked there.
      // - media:// 404s: missing recording thumbnails, expected in fixture state.
      // - CSP "Refused to load media from 'data:audio/...": Remotion Player
      //   loads a silent audio data URL on mount; renderer CSP blocks `data:`
      //   for media-src. Cosmetic — Remotion falls back to silent playback.
      const realErrors = errors.filter((e) => {
        if (e.url.startsWith('media://') || e.url.includes('ERR_FILE_NOT_FOUND')) return false;
        if (e.text.includes('media://') || e.text.includes('ERR_FILE_NOT_FOUND')) return false;
        if (e.text.includes("Refused to load media from 'data:audio")) return false;
        return true;
      });
      expect(realErrors.map((e) => `${e.text} [${e.url}]`)).toHaveLength(0);
    });
  }

  test('round-trip: visit all tabs and return to projects', async ({ appPage }, testInfo) => {
    testInfo.setTimeout(60_000);
    for (const tab of tabs) {
      await appPage.click(`[data-testid="tab-${tab.id}"]`);
      await appPage.waitForSelector(`[data-testid="${tab.root}"]`, { timeout: 10_000 });
      // Brief settle — compositor init can be slow on first render
      await appPage.waitForTimeout(500);
    }
    await expect(appPage.locator('[data-testid="projects-tab-root"]')).toBeVisible();
  });
});
