import { promises as fs } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';

function clearZoomSidecars() {
  const dir = '/tmp/rough-cut/recordings';
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.zoom.json')) {
      try { void fs.unlink(join(dir, name)); } catch { /* ignore */ }
    }
  }
}

/**
 * Zoom sidecar persistence:
 *   <recording>.webm  →  <recording>.zoom.json
 *
 * Adding a marker should write the sidecar within the debounce window (500ms).
 */
test.describe('Zoom persistence — sidecar', () => {
  test.beforeEach(async ({ appPage }) => {
    clearZoomSidecars();
    await navigateToTab(appPage, 'record');
  });

  test('adding a marker writes ZoomPresentation to <recording>.zoom.json', async ({ appPage }) => {
    // Load the last recording so we know the filePath.
    await appPage.locator('[data-testid="debug-reload"]').click();
    await appPage.waitForSelector('[data-testid="zoom-host"]', { timeout: 10_000 });

    const filePath = await appPage.evaluate(() => {
      type Store = { getState: () => { project: { assets: Array<{ type: string; filePath: string }> } } };
      const stores = (window as unknown as { __roughcutStores?: { project: Store } }).__roughcutStores;
      const rec = stores?.project.getState().project.assets.find((a) => a.type === 'recording');
      return rec?.filePath ?? null;
    });
    expect(filePath, 'active recording filePath should be set').toBeTruthy();

    const sidecarPath = filePath!.replace(/\.(webm|mp4)$/i, '.zoom.json');

    // Remove any stale sidecar from a previous run.
    if (existsSync(sidecarPath)) await fs.unlink(sidecarPath);

    // Add a manual marker.
    await appPage.locator('[data-testid="zoom-add"]').click();
    await expect(
      appPage.locator('[data-testid="zoom-marker"][data-marker-kind="manual"]'),
    ).toHaveCount(1, { timeout: 5_000 });

    // Wait past the 500ms debounce.
    await appPage.waitForTimeout(1000);

    // Sidecar should exist and contain our marker.
    expect(existsSync(sidecarPath), `sidecar should be created at ${sidecarPath}`).toBe(true);
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
