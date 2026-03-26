/**
 * Record tab layout regression tests.
 *
 * Launches the Electron app via Playwright and asserts that the
 * flex-based layout never overflows the viewport — the class of bug
 * we fixed with min-width: 0 / overflow: hidden on every flex container.
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

  // Let the app settle (React hydration, compositor init)
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
});

test.afterAll(async () => {
  await app?.close();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

interface LayoutMetrics {
  innerWidth: number;
  innerHeight: number;
  workspaceRow: { right: number; scrollWidth: number; clientWidth: number } | null;
  inspector: { right: number; width: number } | null;
  timeline: { bottom: number; height: number } | null;
  verticalSplit: { bottom: number; scrollHeight: number; clientHeight: number } | null;
  overflowCountX: number;
  overflowCountY: number;
}

async function collectMetrics(): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="workspace-row"]') as HTMLElement | null;
    const inspector = document.querySelector('[data-testid="record-inspector"]') as HTMLElement | null;
    const timeline = document.querySelector('[data-testid="record-timeline"]') as HTMLElement | null;
    const split = document.querySelector('[data-testid="vertical-split"]') as HTMLElement | null;

    const rr = row?.getBoundingClientRect();
    const ir = inspector?.getBoundingClientRect();
    const tr = timeline?.getBoundingClientRect();
    const sr = split?.getBoundingClientRect();

    const iw = window.innerWidth;
    const ih = window.innerHeight;

    // Count elements overflowing the viewport
    const allEls = Array.from(document.querySelectorAll('*')).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );

    return {
      innerWidth: iw,
      innerHeight: ih,
      workspaceRow: rr
        ? { right: rr.right, scrollWidth: row!.scrollWidth, clientWidth: row!.clientWidth }
        : null,
      inspector: ir ? { right: ir.right, width: ir.width } : null,
      timeline: tr ? { bottom: tr.bottom, height: tr.height } : null,
      verticalSplit: sr
        ? { bottom: sr.bottom, scrollHeight: split!.scrollHeight, clientHeight: split!.clientHeight }
        : null,
      overflowCountX: allEls.filter((el) => el.getBoundingClientRect().right > iw + 0.5).length,
      overflowCountY: allEls.filter((el) => el.getBoundingClientRect().bottom > ih + 0.5).length,
    };
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Record tab layout', () => {
  test('workspace row does not overflow horizontally', async () => {
    const m = await collectMetrics();
    expect(m.workspaceRow, 'workspace-row testid not found').not.toBeNull();
    expect(m.workspaceRow!.scrollWidth).toBeLessThanOrEqual(m.workspaceRow!.clientWidth + 1);
  });

  test('inspector right edge stays within viewport', async () => {
    const m = await collectMetrics();
    // Inspector may be null if sidebar is collapsed — that's fine
    if (m.inspector) {
      expect(m.inspector.right).toBeLessThanOrEqual(m.innerWidth + 0.5);
    }
  });

  test('timeline bottom edge stays within viewport', async () => {
    const m = await collectMetrics();
    if (m.timeline) {
      expect(m.timeline.bottom).toBeLessThanOrEqual(m.innerHeight + 0.5);
    }
  });

  test('vertical split does not overflow its container', async () => {
    const m = await collectMetrics();
    if (m.verticalSplit) {
      expect(m.verticalSplit.scrollHeight).toBeLessThanOrEqual(
        m.verticalSplit.clientHeight + 1,
      );
    }
  });

  test('no elements overflow the viewport horizontally', async () => {
    const m = await collectMetrics();
    expect(m.overflowCountX).toBe(0);
  });
});
