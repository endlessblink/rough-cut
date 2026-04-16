import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const CATEGORIES = [
  'templates',
  'align',
  'background',
  'camera',
  'crop',
  'zoom',
  'cursor',
  'highlights',
  'titles',
] as const;

type Category = (typeof CATEGORIES)[number];

interface InspectorMetrics {
  shell: { right: number; width: number } | null;
  rail: { width: number; left: number; right: number } | null;
  railItemCount: number;
  railItemCategories: string[];
  activeCard: { category: string; width: number; right: number } | null;
  activeCardCount: number;
  innerWidth: number;
}

test.describe('Inspector icon-rail shell', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
  });

  async function collectInspectorMetrics(
    appPage: import('@playwright/test').Page,
  ): Promise<InspectorMetrics> {
    return appPage.evaluate(() => {
      const shell = document.querySelector('[data-testid="inspector-shell"]') as HTMLElement | null;
      const rail = document.querySelector('[data-testid="inspector-rail"]') as HTMLElement | null;
      const railItems = document.querySelectorAll('[data-testid="inspector-rail-item"]');
      const activeCards = document.querySelectorAll('[data-testid="inspector-card-active"]');
      const activeCard = activeCards[0] as HTMLElement | undefined;

      const sr = shell?.getBoundingClientRect();
      const rr = rail?.getBoundingClientRect();
      const ar = activeCard?.getBoundingClientRect();

      return {
        shell: sr ? { right: sr.right, width: sr.width } : null,
        rail: rr ? { width: rr.width, left: rr.left, right: rr.right } : null,
        railItemCount: railItems.length,
        railItemCategories: Array.from(railItems).map(
          (el) => el.getAttribute('data-category') ?? 'unknown',
        ),
        activeCard: ar
          ? {
              category: activeCard?.getAttribute('data-category') ?? 'unknown',
              width: ar.width,
              right: ar.right,
            }
          : null,
        activeCardCount: activeCards.length,
        innerWidth: window.innerWidth,
      };
    });
  }

  async function clickRailItem(
    appPage: import('@playwright/test').Page,
    category: Category,
  ): Promise<void> {
    await appPage.click(`[data-testid="inspector-rail-item"][data-category="${category}"]`);
    await expect(appPage.locator('[data-testid="inspector-card-active"]')).toHaveAttribute(
      'data-category',
      category,
    );
  }

  test('inspector shell and rail are present', async ({ appPage }) => {
    const m = await collectInspectorMetrics(appPage);
    expect(m.shell).not.toBeNull();
    expect(m.rail).not.toBeNull();
  });

  test('rail has all expected category items', async ({ appPage }) => {
    const m = await collectInspectorMetrics(appPage);
    expect(m.railItemCount).toBe(CATEGORIES.length);
    for (const cat of CATEGORIES) {
      expect(m.railItemCategories).toContain(cat);
    }
  });

  test('default active category renders correctly', async ({ appPage }) => {
    const m = await collectInspectorMetrics(appPage);
    expect(m.activeCardCount).toBe(1);
    expect(m.activeCard).not.toBeNull();
    expect(m.activeCard?.category).toBe('crop');
  });

  test('only one category card is visible at a time', async ({ appPage }) => {
    for (const cat of CATEGORIES) {
      await clickRailItem(appPage, cat);
      const m = await collectInspectorMetrics(appPage);
      expect(m.activeCardCount).toBe(1);
      expect(m.activeCard?.category).toBe(cat);
    }
  });

  test('icon rail stays fixed width during category changes', async ({ appPage }) => {
    await clickRailItem(appPage, 'crop');
    const baseline = await collectInspectorMetrics(appPage);
    expect(baseline.rail).not.toBeNull();
    const railWidth = baseline.rail!.width;

    for (const cat of CATEGORIES) {
      await clickRailItem(appPage, cat);
      const m = await collectInspectorMetrics(appPage);
      expect(m.rail).not.toBeNull();
      expect(m.rail!.width).toBeCloseTo(railWidth, 0);
    }
  });

  test('inspector stays within viewport during category changes', async ({ appPage }) => {
    for (const cat of CATEGORIES) {
      await clickRailItem(appPage, cat);
      const m = await collectInspectorMetrics(appPage);
      expect(m.shell?.right ?? 0).toBeLessThanOrEqual(m.innerWidth + 0.5);
      expect(m.activeCard?.right ?? 0).toBeLessThanOrEqual(m.innerWidth + 0.5);
    }
  });

  test('inspector width stays fixed during category changes', async ({ appPage }) => {
    await clickRailItem(appPage, 'crop');
    const baseline = await collectInspectorMetrics(appPage);
    expect(baseline.shell).not.toBeNull();
    const shellWidth = baseline.shell!.width;

    for (const cat of CATEGORIES) {
      await clickRailItem(appPage, cat);
      const m = await collectInspectorMetrics(appPage);
      expect(m.shell).not.toBeNull();
      expect(m.shell!.width).toBeCloseTo(shellWidth, 0);
    }
  });

  test('no new horizontal overflow after switching categories', async ({ appPage }) => {
    for (const cat of CATEGORIES) {
      await clickRailItem(appPage, cat);
      const overflowCount = await appPage.evaluate(() => {
        const iw = window.innerWidth;
        return Array.from(document.querySelectorAll('*'))
          .filter((el): el is HTMLElement => el instanceof HTMLElement)
          .filter((el) => el.getBoundingClientRect().right > iw + 0.5).length;
      });
      expect(overflowCount).toBe(0);
    }
  });
});
