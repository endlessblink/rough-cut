import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadZoomFixture, ZOOM_FIXTURE_PROJECT_PATH } from './fixtures/zoom-fixture.js';

/**
 * Zoom sidecar persistence:
 *   <recording>.webm  →  <recording>.zoom.json
 *
 * Adding a marker should write the sidecar within the debounce window (500ms).
 */
test.describe('Zoom persistence — sidecar', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
  });

  test('adding a marker writes ZoomPresentation to <recording>.zoom.json', async ({ appPage }) => {
    const filePath = await loadZoomFixture(appPage);

    expect(filePath, 'active recording filePath should be set').toBeTruthy();

    const resolvedRecordingPath = filePath!.startsWith('/')
      ? filePath!
      : resolve(dirname(ZOOM_FIXTURE_PROJECT_PATH), filePath!);
    const sidecarPath = resolvedRecordingPath.replace(/\.(webm|mp4)$/i, '.zoom.json');

    // Add a manual marker.
    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    // Wait past the debounce and allow for slow fs flushes in CI.
    await expect
      .poll(() => existsSync(sidecarPath), {
        timeout: 5000,
        message: `sidecar should be created at ${sidecarPath}`,
      })
      .toBe(true);

    // Sidecar should exist and contain our marker.
    const raw = await fs.readFile(sidecarPath, 'utf-8');
    const parsed = JSON.parse(raw);
    console.log('[persistence-test] sidecar:', parsed);

    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.markers)).toBe(true);
    expect(parsed.markers.length).toBe(1);
    const marker = parsed.markers[0];
    expect(marker.kind).toBe('manual');
    expect(typeof marker.startFrame).toBe('number');
    expect(typeof marker.endFrame).toBe('number');
    expect(marker.endFrame).toBeGreaterThan(marker.startFrame);
  });
});
