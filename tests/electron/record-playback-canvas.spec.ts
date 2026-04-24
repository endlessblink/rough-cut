import { test, expect } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';

test.describe('Record playback canvas', () => {
  test('loaded project playback uses a visible canvas surface', async ({ appPage }) => {
    await loadPlaybackFixture(appPage, 'record');

    await expect(appPage.locator('[data-testid="recording-playback-canvas"]')).toBeVisible();

    const surfaceMetrics = await appPage.evaluate(() => {
      const canvasHost = document.querySelector(
        '[data-testid="recording-playback-canvas"]',
      ) as HTMLElement | null;
      const readySentinel = document.querySelector(
        '[data-testid="recording-playback-video"]',
      ) as HTMLElement | null;
      const pixiCanvas = canvasHost?.querySelector('canvas') as HTMLCanvasElement | null;

      if (!canvasHost || !readySentinel || !pixiCanvas) return null;

      const canvasRect = canvasHost.getBoundingClientRect();
      const sentinelStyle = window.getComputedStyle(readySentinel);

      return {
        canvasWidth: canvasRect.width,
        canvasHeight: canvasRect.height,
        readyDisplay: sentinelStyle.display,
        pixiCanvasWidth: pixiCanvas.getBoundingClientRect().width,
        pixiCanvasHeight: pixiCanvas.getBoundingClientRect().height,
      };
    });

    expect(surfaceMetrics).not.toBeNull();
    expect(surfaceMetrics?.canvasWidth ?? 0).toBeGreaterThan(200);
    expect(surfaceMetrics?.canvasHeight ?? 0).toBeGreaterThan(100);
    expect(surfaceMetrics?.readyDisplay).toBe('none');
    expect(surfaceMetrics?.pixiCanvasWidth ?? 0).toBeGreaterThan(200);
    expect(surfaceMetrics?.pixiCanvasHeight ?? 0).toBeGreaterThan(100);
  });

  test('canvas frame updates when the paused playhead seeks', async ({ appPage }) => {
    await loadPlaybackFixture(appPage, 'record');

    const frame0 = await captureCanvasState(appPage);

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(45);
    });
    await appPage.waitForTimeout(250);

    const frame45 = await captureCanvasState(appPage);
    expect(Math.abs(frame45.playheadFrame - 45)).toBeLessThanOrEqual(1);
    expect(frame45.canvasHash).not.toBe(frame0.canvasHash);

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(0);
    });
    await appPage.waitForTimeout(250);

    const frame0Again = await captureCanvasState(appPage);
    expect(Math.abs(frame0Again.playheadFrame)).toBeLessThanOrEqual(1);
    expect(frame0Again.canvasHash).not.toBe(frame45.canvasHash);
  });

  test('canvas keeps painting while playback runs', async ({ appPage }) => {
    await loadPlaybackFixture(appPage, 'record');

    await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.transport.getState().seekToFrame(0);
    });

    const before = await captureCanvasState(appPage);

    await appPage.evaluate(() => {
      const pm = (window as unknown as { __roughcutPlaybackManager?: any })
        .__roughcutPlaybackManager;
      pm?.play();
    });

    await appPage.waitForTimeout(500);

    const during = await captureCanvasState(appPage);

    await appPage.evaluate(() => {
      const pm = (window as unknown as { __roughcutPlaybackManager?: any })
        .__roughcutPlaybackManager;
      pm?.pause();
    });

    expect(during.playheadFrame).toBeGreaterThan(before.playheadFrame);
    expect(during.canvasHash).not.toBe(before.canvasHash);
  });

  test('window resize keeps the saved-take playback subtree alive', async ({
    appPage,
    electronApp,
  }) => {
    await loadPlaybackFixture(appPage, 'record');

    await appPage.evaluate(() => {
      const pm = (window as unknown as { __roughcutPlaybackManager?: any })
        .__roughcutPlaybackManager;
      pm?.play();

      (window as unknown as { __task190PlaybackNode?: Element | null }).__task190PlaybackNode =
        document.querySelector('[data-testid="recording-playback-video"]');
    });

    await appPage.waitForTimeout(400);
    const beforeResizeFrame = await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      return stores?.transport.getState().playheadFrame ?? -1;
    });

    const originalBounds = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
      if (!win) throw new Error('No BrowserWindow available for resize test');
      return win.getBounds();
    });

    await electronApp.evaluate(async ({ BrowserWindow }, bounds) => {
      const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
      if (!win) throw new Error('No BrowserWindow available for shrink step');
      win.setBounds(bounds);
    }, {
      ...originalBounds,
      width: Math.max(900, originalBounds.width - 220),
      height: Math.max(700, originalBounds.height - 180),
    });

    await appPage.waitForTimeout(250);

    await electronApp.evaluate(async ({ BrowserWindow }, bounds) => {
      const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
      if (!win) throw new Error('No BrowserWindow available for restore step');
      win.setBounds(bounds);
    }, originalBounds);

    await appPage.waitForTimeout(500);

    const afterResize = await appPage.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const playbackNode = document.querySelector('[data-testid="recording-playback-video"]');
      return {
        playheadFrame: stores?.transport.getState().playheadFrame ?? -1,
        sameNode:
          playbackNode ===
          (window as unknown as { __task190PlaybackNode?: Element | null }).__task190PlaybackNode,
      };
    });

    await appPage.evaluate(() => {
      const pm = (window as unknown as { __roughcutPlaybackManager?: any })
        .__roughcutPlaybackManager;
      pm?.pause();
    });

    await expect(appPage.locator('[data-testid="recording-playback-canvas"]')).toBeVisible();
    expect(afterResize.sameNode).toBe(true);
    expect(afterResize.playheadFrame).toBeGreaterThan(beforeResizeFrame);
  });
});

async function captureCanvasState(page: import('@playwright/test').Page): Promise<{
  playheadFrame: number;
  canvasHash: number;
}> {
  const canvas = page.locator('[data-testid="recording-playback-canvas"]').first();
  const [playheadFrame, screenshot] = await Promise.all([
    page.evaluate(() => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      return stores?.transport.getState().playheadFrame ?? -1;
    }),
    canvas.screenshot({ timeout: 5_000 }),
  ]);

  return {
    playheadFrame,
    canvasHash: hashBytes(screenshot),
  };
}

function hashBytes(buffer: Buffer): number {
  let hash = 0;

  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }

  return hash;
}
