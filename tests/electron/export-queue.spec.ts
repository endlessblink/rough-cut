import { test, expect, navigateToTab } from './fixtures/electron-app.js';

async function seedExportableProject(appPage: import('@playwright/test').Page) {
  await appPage.evaluate(() => {
    const stores = (window as any).__roughcutStores;
    stores?.project.getState().updateProject((doc: any) => ({
      ...doc,
      name: 'Queue Test Project',
      composition: {
        ...doc.composition,
        duration: 90,
      },
    }));
    stores?.transport.getState().seekToFrame(0);
  });
}

test.describe('Export queue lifecycle', () => {
  test.beforeEach(async ({ appPage }) => {
    await seedExportableProject(appPage);
    await navigateToTab(appPage, 'export');
  });

  test('queues two jobs from the same idle surface and runs them sequentially', async ({ appPage }) => {
    await appPage.evaluate(() => {
      (window as any).__roughcutTestOverrides = {
        pickDesktopExportOutputPath: (() => {
          let callCount = 0;
          return async () => `/tmp/export-queue-${++callCount}.mp4`;
        })(),
        runDesktopExport: async (
          _project: any,
          range: { startFrame: number; endFrame: number },
          outputPath: string,
        ) => {
          (window as any).__exportQueueRuns = ((window as any).__exportQueueRuns ?? 0) + 1;
          window.roughcut.exportEmitProgress({ currentFrame: 5, totalFrames: 30, percentage: 17 });
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {
            status: 'complete',
            outputPath,
            totalFrames: range.endFrame - range.startFrame,
            durationMs: 40,
            audioIncluded: false,
          };
        },
      };

      const button = document.querySelector('[data-testid="btn-export"]') as HTMLButtonElement | null;
      button?.click();
      button?.click();
    });

    await expect(appPage.locator('[data-testid="export-queue-item"]')).toHaveCount(2);
    await expect(appPage.locator('[data-testid="export-queue-item"][data-status="running"]')).toHaveCount(1);

    await expect
      .poll(async () => appPage.locator('[data-testid="export-queue-item"][data-status="complete"]').count())
      .toBe(2);

    await expect(appPage.locator('[data-testid="export-queue"]')).toContainText('export-queue-1.mp4');
    await expect(appPage.locator('[data-testid="export-queue"]')).toContainText('export-queue-2.mp4');
    await expect
      .poll(async () => appPage.evaluate(() => (window as any).__exportQueueRuns ?? 0))
      .toBe(2);
  });

  test('marks the active job cancelled when export is aborted', async ({ appPage }) => {
    await appPage.evaluate(() => {
      (window as any).__roughcutTestOverrides = {
        exportOutputPath: '/tmp/export-cancelled.mp4',
        runDesktopExport: async (
          _project: any,
          range: { startFrame: number; endFrame: number },
          _outputPath: string,
          signal: AbortSignal,
        ) => {
          while (!signal.aborted) {
            window.roughcut.exportEmitProgress({ currentFrame: 10, totalFrames: 30, percentage: 33 });
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          return {
            status: 'cancelled',
            totalFrames: range.endFrame - range.startFrame,
            durationMs: 0,
          };
        },
      };
    });

    await appPage.locator('[data-testid="btn-export"]').click();
    await expect(appPage.locator('[data-testid="btn-cancel-export"]')).toBeVisible();
    await appPage.locator('[data-testid="btn-cancel-export"]').click();

    await expect(appPage.locator('[data-testid="export-error"]')).toContainText('Export cancelled');
    await expect(appPage.locator('[data-testid="export-queue-item"][data-status="cancelled"]')).toHaveCount(1);
  });

  test('keeps failed jobs in the queue with their error message', async ({ appPage }) => {
    await appPage.evaluate(() => {
      (window as any).__roughcutTestOverrides = {
        exportOutputPath: '/tmp/export-failed.mp4',
        runDesktopExport: async (_project: any, range: { startFrame: number; endFrame: number }) => ({
          status: 'failed',
          error: 'Synthetic export failure',
          totalFrames: range.endFrame - range.startFrame,
          durationMs: 0,
        }),
      };
    });

    await appPage.locator('[data-testid="btn-export"]').click();

    await expect(appPage.locator('[data-testid="export-error"]')).toContainText(
      'Synthetic export failure',
    );
    await expect(appPage.locator('[data-testid="export-queue-item"][data-status="failed"]')).toHaveCount(1);
    await expect(appPage.locator('[data-testid="export-queue"]')).toContainText(
      'Synthetic export failure',
    );
  });
});
