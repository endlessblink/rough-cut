import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';
test.describe('Record playback canvas', () => {
  test('loaded project playback uses a visible canvas surface', async ({ appPage }) => {
    await loadRecordedProject(appPage);

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
    await loadRecordedProject(appPage);

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
});

async function loadRecordedProject(page: import('@playwright/test').Page): Promise<void> {
  await navigateToTab(page, 'record');

  const project = (await page.evaluate((projectPath) => {
    return (
      window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
    ).roughcut.projectOpenPath(projectPath);
  }, RECORDED_PROJECT_PATH)) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording');
  expect(recording).toBeTruthy();

  await page.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      projectPath: RECORDED_PROJECT_PATH,
      activeAssetId: recording?.id ?? null,
    },
  );

  await page.waitForFunction((selector) => {
    const video = document.querySelector(selector) as HTMLVideoElement | null;
    return video?.getAttribute('data-ready') === 'true';
  }, '[data-testid="recording-playback-video"]');

  await expect(page.locator('[data-testid="recording-playback-canvas"]')).toBeVisible();
}

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
