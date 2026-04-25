import { test, expect } from './fixtures/electron-app.js';

test.describe('TASK-145 mini controller visibility', () => {
  test('floating controller fades to a ghost state and wakes on hover', async ({
    appPage,
    electronApp,
  }) => {
    test.setTimeout(60_000);

    await appPage.evaluate(async () => {
      await window.roughcut.openRecordingPanel();
    });

    await expect
      .poll(async () => (await electronApp.windows()).find((page) => page !== appPage && !page.isClosed()) ?? null)
      .not.toBeNull();

    const panelPage = (await electronApp.windows()).find((page) => page !== appPage && !page.isClosed());
    expect(panelPage, 'Expected recording panel window').toBeTruthy();

    await panelPage!.waitForLoadState('domcontentloaded');
    await panelPage!.waitForFunction(
      () => Boolean((window as unknown as { __panelTestHooks?: unknown }).__panelTestHooks),
      { timeout: 10_000 },
    );

    await panelPage!.evaluate(() => {
      const hooks = (window as unknown as {
        __panelTestHooks: { forceSessionState: (status: 'recording', elapsedMs?: number) => void };
      }).__panelTestHooks;
      hooks.forceSessionState('recording', 0);
    });

    const miniController = panelPage!.locator('[data-testid="mini-controller"]');
    await expect(miniController).toBeVisible();
    await expect(miniController).toHaveCSS('opacity', '1');

    await panelPage!.waitForTimeout(5_300);

    const ghostOpacity = Number.parseFloat(await miniController.evaluate((node) => getComputedStyle(node).opacity));
    expect(ghostOpacity).toBeLessThan(0.15);

    await miniController.hover();
    await expect.poll(async () => Number.parseFloat(await miniController.evaluate((node) => getComputedStyle(node).opacity))).toBeGreaterThan(0.9);
  });
});
