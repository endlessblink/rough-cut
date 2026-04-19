/**
 * Record tab layout regression tests.
 *
 * Verifies the Record workspace fits the viewport after entering the app from
 * the Projects tab.
 */
import { test, expect, navigateToTab } from './fixtures/electron-app.js';

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

async function collectMetrics(page: import('@playwright/test').Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="workspace-row"]') as HTMLElement | null;
    const inspector = document.querySelector(
      '[data-testid="record-inspector"]',
    ) as HTMLElement | null;
    const timeline = document.querySelector(
      '[data-testid="record-timeline"]',
    ) as HTMLElement | null;
    const split = document.querySelector('[data-testid="vertical-split"]') as HTMLElement | null;

    const rr = row?.getBoundingClientRect();
    const ir = inspector?.getBoundingClientRect();
    const tr = timeline?.getBoundingClientRect();
    const sr = split?.getBoundingClientRect();

    const iw = window.innerWidth;
    const ih = window.innerHeight;

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
        ? {
            bottom: sr.bottom,
            scrollHeight: split!.scrollHeight,
            clientHeight: split!.clientHeight,
          }
        : null,
      overflowCountX: allEls.filter((el) => el.getBoundingClientRect().right > iw + 0.5).length,
      overflowCountY: allEls.filter((el) => el.getBoundingClientRect().bottom > ih + 0.5).length,
    };
  });
}

test.describe('Record tab layout', () => {
  test.beforeEach(async ({ appPage }) => {
    await navigateToTab(appPage, 'record');
  });

  test('workspace row does not overflow horizontally', async ({ appPage }) => {
    const m = await collectMetrics(appPage);
    expect(m.workspaceRow, 'workspace-row testid not found').not.toBeNull();
    expect(m.workspaceRow!.scrollWidth).toBeLessThanOrEqual(m.workspaceRow!.clientWidth + 1);
  });

  test('inspector right edge stays within viewport', async ({ appPage }) => {
    const m = await collectMetrics(appPage);
    if (m.inspector) {
      expect(m.inspector.right).toBeLessThanOrEqual(m.innerWidth + 0.5);
    }
  });

  test('timeline bottom edge stays within viewport', async ({ appPage }) => {
    const m = await collectMetrics(appPage);
    if (m.timeline) {
      expect(m.timeline.bottom).toBeLessThanOrEqual(m.innerHeight + 0.5);
    }
  });

  test('vertical split does not overflow its container', async ({ appPage }) => {
    const m = await collectMetrics(appPage);
    if (m.verticalSplit) {
      expect(m.verticalSplit.scrollHeight).toBeLessThanOrEqual(m.verticalSplit.clientHeight + 1);
    }
  });

  test('no elements overflow the viewport horizontally', async ({ appPage }) => {
    const m = await collectMetrics(appPage);
    expect(m.overflowCountX).toBe(0);
  });
});
