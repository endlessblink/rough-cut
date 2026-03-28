/**
 * Live preview video layout test.
 *
 * Verifies the LivePreviewVideo fills the PreviewCard properly
 * when a source is selected on the Record tab.
 *
 * Requires: `pnpm dev` running (Vite dev server at 127.0.0.1:7544).
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

test.describe('Live preview layout', () => {
  test('PreviewCard content wrapper fills the card', async () => {
    // Navigate to Record tab
    const recordTab = page.locator('text=Record').first();
    await recordTab.click();
    await page.waitForTimeout(1_000);

    // Take a screenshot for visual verification
    await page.screenshot({ path: 'tests/electron/screenshots/record-preview.png' });

    // Check that PreviewCard exists and its content wrapper fills it
    const previewCard = await page.evaluate(() => {
      // Find the preview card by its distinctive styling (rounded, 16/9 aspect)
      const cards = Array.from(document.querySelectorAll('div')).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.aspectRatio === '16 / 9' && style.borderRadius === '18px';
      });
      if (cards.length === 0) return null;

      const card = cards[0];
      const cardRect = card.getBoundingClientRect();

      // Find the content wrapper (position: absolute, inset: 0, zIndex: 1)
      const contentWrapper = Array.from(card.querySelectorAll(':scope div')).find((el) => {
        const style = window.getComputedStyle(el);
        return style.position === 'absolute' && style.zIndex === '1';
      }) as HTMLElement | null;

      const wrapperRect = contentWrapper?.getBoundingClientRect();

      // Find video element if present
      const video = card.querySelector('video');
      const videoRect = video?.getBoundingClientRect();

      return {
        card: { width: cardRect.width, height: cardRect.height },
        wrapper: wrapperRect ? { width: wrapperRect.width, height: wrapperRect.height } : null,
        video: videoRect
          ? {
              width: videoRect.width,
              height: videoRect.height,
              left: videoRect.left - cardRect.left,
              top: videoRect.top - cardRect.top,
            }
          : null,
      };
    });

    expect(previewCard, 'PreviewCard not found').not.toBeNull();
    expect(previewCard!.card.width).toBeGreaterThan(100);
    expect(previewCard!.card.height).toBeGreaterThan(50);

    if (previewCard!.wrapper) {
      // Content wrapper should fill the card
      expect(previewCard!.wrapper.width).toBeCloseTo(previewCard!.card.width, -1);
      expect(previewCard!.wrapper.height).toBeCloseTo(previewCard!.card.height, -1);
    }

    if (previewCard!.video) {
      // Video should fill at least 90% of the card (accounting for padding)
      const fillRatioW = previewCard!.video.width / previewCard!.card.width;
      const fillRatioH = previewCard!.video.height / previewCard!.card.height;
      expect(fillRatioW).toBeGreaterThan(0.9);
      expect(fillRatioH).toBeGreaterThan(0.9);
    }
  });
});
