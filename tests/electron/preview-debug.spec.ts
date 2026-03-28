/**
 * Diagnostic: measure video element and all parents in the chain.
 */
import {
  test,
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
    if (w.url().includes('127.0.0.1:7544')) { page = w; break; }
  }
  if (!page) {
    page = await app.waitForEvent('window', {
      predicate: (w) => w.url().includes('127.0.0.1:7544'),
      timeout: 15000,
    });
  }
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
});

test.afterAll(async () => { await app?.close(); });

test('measure video layout chain', async () => {
  // Navigate to Record
  await page.locator('text=Record').first().click();
  await page.waitForTimeout(1000);

  // Open source picker - try multiple selectors
  const toolbar = page.locator('[data-segment="source"]').or(page.locator('text=Source')).or(page.locator('text=Choose source'));
  if (await toolbar.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await toolbar.first().click();
    await page.waitForTimeout(1500);

    // Select first source - click first img thumbnail in the popup
    const thumb = page.locator('img').first();
    if (await thumb.isVisible({ timeout: 2000 }).catch(() => false)) {
      await thumb.click();
      await page.waitForTimeout(3000);
    }
  }

  // Take screenshot
  await page.screenshot({ path: 'tests/electron/screenshots/preview-debug.png' });

  // Measure video and parents
  const metrics = await page.evaluate(() => {
    const video = document.querySelector('video');
    if (!video) return { error: 'No <video> element in DOM' };

    const chain: Record<string, unknown>[] = [];
    let el: HTMLElement | null = video;
    while (el && chain.length < 12) {
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      chain.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        class: el.className || undefined,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        l: Math.round(rect.left),
        t: Math.round(rect.top),
        pos: cs.position,
        disp: cs.display,
        inset: cs.inset !== 'auto' ? cs.inset : undefined,
        objFit: el.tagName === 'VIDEO' ? cs.objectFit : undefined,
        aspectRatio: cs.aspectRatio !== 'auto' ? cs.aspectRatio : undefined,
      });
      el = el.parentElement;
    }

    return {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      readyState: video.readyState,
      hasSrcObject: !!video.srcObject,
      chain,
    };
  });

  console.log('\n=== VIDEO LAYOUT CHAIN ===');
  console.log(JSON.stringify(metrics, null, 2));
  console.log('=== END ===\n');
});
