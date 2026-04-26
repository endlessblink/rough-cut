import { test, expect, navigateToTab } from './fixtures/electron-app.js';

async function openTemplatesPanel(appPage: import('@playwright/test').Page) {
  await appPage.evaluate(() => {
    const button = document.querySelector(
      '[data-testid="inspector-rail-item"][data-category="templates"]',
    ) as HTMLButtonElement | null;
    button?.click();
  });
  await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
    'data-category',
    'templates',
  );
}

async function selectTemplate(appPage: import('@playwright/test').Page, label: string) {
  await openTemplatesPanel(appPage);
  const card = appPage
    .locator('[data-testid="inspector-card-active"]')
    .getByRole('button', { name: label, exact: true });
  await expect(card).toBeVisible();
  await card.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await appPage.waitForTimeout(500);
}

async function captureRecord(appPage: import('@playwright/test').Page, path: string) {
  await expect(appPage.locator('[data-testid="record-tab-root"]')).toBeVisible();
  await expect(appPage.locator('[data-testid="record-card-chrome"]')).toBeVisible();
  await appPage.locator('[data-testid="record-tab-root"]').screenshot({ path });
}

test('screenshot Record tab with default template', async ({ appPage }) => {
  await navigateToTab(appPage, 'record');
  await captureRecord(appPage, 'test-results/record-default.png');
});

test('screenshot Record tab with Talking Head (1:1)', async ({ appPage }) => {
  await navigateToTab(appPage, 'record');
  await selectTemplate(appPage, 'Talking Head');
  await captureRecord(appPage, 'test-results/record-talking-head.png');
});

test('screenshot Record tab with Social Vertical (9:16)', async ({ appPage }) => {
  await navigateToTab(appPage, 'record');
  await selectTemplate(appPage, 'Social Vertical');
  await captureRecord(appPage, 'test-results/record-social-vertical.png');
});

test('screenshot Record tab with Screen Only (16:9)', async ({ appPage }) => {
  await navigateToTab(appPage, 'record');
  await selectTemplate(appPage, 'Screen Only');
  await captureRecord(appPage, 'test-results/record-screen-only.png');
});
