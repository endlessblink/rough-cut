/**
 * Quick screenshot test: navigate to Record tab, select templates, screenshot each.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['--no-sandbox', 'apps/desktop'],
    cwd: process.cwd(),
  });

  const windows = app.windows();
  for (const w of windows) {
    if (w.url().includes('127.0.0.1:7544')) {
      page = w;
      break;
    }
  }
  if (!page) {
    page = await app.waitForEvent('window', {
      predicate: (w) => w.url().includes('127.0.0.1:7544'),
      timeout: 15_000,
    });
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
});

test.afterAll(async () => {
  await app?.close();
});

test('screenshot Record tab with default template', async () => {
  // Click "Record" tab
  await page.click('text=Record');
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: 'test-results/record-default.png' });
});

test('screenshot Record tab with Talking Head (1:1)', async () => {
  // Find and click "Talking Head" template
  await page.click('text=Talking Head');
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: 'test-results/record-talking-head.png' });
});

test('screenshot Record tab with Social Vertical (9:16)', async () => {
  await page.click('text=Social Vertical');
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: 'test-results/record-social-vertical.png' });
});

test('screenshot Record tab with Screen Only (16:9)', async () => {
  await page.click('text=Screen Only');
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: 'test-results/record-screen-only.png' });
});
