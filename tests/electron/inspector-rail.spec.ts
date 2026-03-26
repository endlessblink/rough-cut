/**
 * Inspector icon-rail shell regression tests.
 *
 * Validates the refactored inspector with icon rail + single-card UI:
 * - Only one category card visible at a time
 * - Icon rail stays fixed width
 * - Category switching works correctly
 * - No layout overflow after switching
 *
 * Requires: `pnpm dev` running (Vite dev server at 127.0.0.1:7544).
 * Depends on L1 inspector refactor wiring these data-testid anchors:
 *   inspector-shell, inspector-rail, inspector-rail-item, inspector-card-active
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const CATEGORIES = ['zoom', 'cursor', 'highlights', 'titles'] as const;
type Category = (typeof CATEGORIES)[number];

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['--no-sandbox', 'apps/desktop'],
    cwd: process.cwd(),
  });

  // Wait for the renderer window (skip DevTools windows)
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

// ─── Helpers ────────────────────────────────────────────────────────────────

interface InspectorMetrics {
  shell: { right: number; width: number } | null;
  rail: { width: number; left: number; right: number } | null;
  railItemCount: number;
  railItemCategories: string[];
  activeCard: { category: string; width: number; right: number } | null;
  /** How many elements with data-testid="inspector-card-active" exist */
  activeCardCount: number;
  innerWidth: number;
}

async function collectInspectorMetrics(): Promise<InspectorMetrics> {
  return page.evaluate(() => {
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
            category: activeCard!.getAttribute('data-category') ?? 'unknown',
            width: ar.width,
            right: ar.right,
          }
        : null,
      activeCardCount: activeCards.length,
      innerWidth: window.innerWidth,
    };
  });
}

async function clickRailItem(category: Category): Promise<void> {
  await page.click(`[data-testid="inspector-rail-item"][data-category="${category}"]`);
  // Brief settle for React re-render
  await page.waitForTimeout(200);
}

async function getActiveCategory(): Promise<string | null> {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="inspector-card-active"]');
    return card?.getAttribute('data-category') ?? null;
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Inspector icon-rail shell', () => {
  test('inspector shell and rail are present', async () => {
    const m = await collectInspectorMetrics();
    expect(m.shell, 'inspector-shell not found — is the L1 refactor wired?').not.toBeNull();
    expect(m.rail, 'inspector-rail not found').not.toBeNull();
  });

  test('rail has all expected category items', async () => {
    const m = await collectInspectorMetrics();
    expect(m.railItemCount).toBe(CATEGORIES.length);
    for (const cat of CATEGORIES) {
      expect(m.railItemCategories).toContain(cat);
    }
  });

  test('default active category renders correctly', async () => {
    const m = await collectInspectorMetrics();
    expect(m.activeCardCount).toBe(1);
    expect(m.activeCard).not.toBeNull();
    // Default should be the first category
    expect(m.activeCard!.category).toBe(CATEGORIES[0]);
  });

  test('only one category card is visible at a time', async () => {
    // Check each category switch produces exactly one active card
    for (const cat of CATEGORIES) {
      await clickRailItem(cat);
      const m = await collectInspectorMetrics();
      expect(m.activeCardCount, `expected 1 active card after clicking ${cat}`).toBe(1);
      expect(m.activeCard!.category).toBe(cat);
    }
  });

  test('clicking a rail icon switches the visible card', async () => {
    // Start from first category
    await clickRailItem('zoom');
    expect(await getActiveCategory()).toBe('zoom');

    // Switch to cursor
    await clickRailItem('cursor');
    expect(await getActiveCategory()).toBe('cursor');

    // Switch to highlights
    await clickRailItem('highlights');
    expect(await getActiveCategory()).toBe('highlights');

    // Switch to titles
    await clickRailItem('titles');
    expect(await getActiveCategory()).toBe('titles');

    // Switch back to zoom
    await clickRailItem('zoom');
    expect(await getActiveCategory()).toBe('zoom');
  });

  test('icon rail stays fixed width during category changes', async () => {
    await clickRailItem('zoom');
    const baseline = await collectInspectorMetrics();
    expect(baseline.rail).not.toBeNull();
    const railWidth = baseline.rail!.width;

    for (const cat of CATEGORIES) {
      await clickRailItem(cat);
      const m = await collectInspectorMetrics();
      expect(m.rail).not.toBeNull();
      expect(m.rail!.width, `rail width changed after switching to ${cat}`).toBeCloseTo(
        railWidth,
        0,
      );
    }
  });

  test('inspector stays within viewport during category changes', async () => {
    for (const cat of CATEGORIES) {
      await clickRailItem(cat);
      const m = await collectInspectorMetrics();

      if (m.shell) {
        expect(
          m.shell.right,
          `inspector overflows viewport after switching to ${cat}`,
        ).toBeLessThanOrEqual(m.innerWidth + 0.5);
      }

      if (m.activeCard) {
        expect(
          m.activeCard.right,
          `active card overflows viewport after switching to ${cat}`,
        ).toBeLessThanOrEqual(m.innerWidth + 0.5);
      }
    }
  });

  test('inspector width stays fixed during category changes', async () => {
    await clickRailItem('zoom');
    const baseline = await collectInspectorMetrics();
    expect(baseline.shell).not.toBeNull();
    const shellWidth = baseline.shell!.width;

    for (const cat of CATEGORIES) {
      await clickRailItem(cat);
      const m = await collectInspectorMetrics();
      expect(m.shell).not.toBeNull();
      expect(
        m.shell!.width,
        `inspector width changed after switching to ${cat}`,
      ).toBeCloseTo(shellWidth, 0);
    }
  });

  test('no new horizontal overflow after switching categories', async () => {
    for (const cat of CATEGORIES) {
      await clickRailItem(cat);
      const overflowCount = await page.evaluate(() => {
        const iw = window.innerWidth;
        return Array.from(document.querySelectorAll('*'))
          .filter((el): el is HTMLElement => el instanceof HTMLElement)
          .filter((el) => el.getBoundingClientRect().right > iw + 0.5).length;
      });
      expect(overflowCount, `horizontal overflow after switching to ${cat}`).toBe(0);
    }
  });
});
