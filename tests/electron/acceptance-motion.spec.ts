/**
 * Motion Tab — Acceptance Tests vs MVP Spec (Section 3.5)
 *
 * Red = missing feature. Green = implemented.
 * The Motion tab is currently a placeholder — ALL tests should fail.
 */
import { test, expect } from './fixtures/electron-app.js';

function nav(appPage: import('@playwright/test').Page) {
  return appPage.click('[data-testid="tab-motion"]').then(() =>
    appPage.waitForSelector('[data-testid="motion-tab-root"]', { timeout: 5_000 })
  );
}

test.describe('Motion Tab — MVP Acceptance', () => {

  // ── 3.5.1: Template library with 8+ templates ─────────────────────────
  // Feature gap: Motion tab MVP UI (template cards, search, params, apply) unimplemented.
  test.fixme('3.5.1 — template library with 8+ browseable templates', async ({ appPage }) => {
    await nav(appPage);
    const templateCards = appPage.locator('[data-testid="template-card"]')
      .or(appPage.locator('.template-card'));
    const count = await templateCards.count();
    expect(count, 'Template library should show 8+ template cards').toBeGreaterThanOrEqual(8);
  });

  // ── 3.5.2: Click template → animation plays in preview ────────────────
  // Feature gap: Motion tab MVP UI (template cards, search, params, apply) unimplemented.
  test.fixme('3.5.2 — clicking template plays animation preview', async ({ appPage }) => {
    await nav(appPage);
    const previewCanvas = appPage.locator('canvas').or(appPage.locator('[data-testid="motion-preview"]'));
    const count = await previewCanvas.count();
    expect(count, 'Motion preview canvas should exist').toBeGreaterThan(0);
  });

  // ── 3.5.3: Parameter editor (text, colors, duration, easing) ──────────
  // Feature gap: Motion tab MVP UI (template cards, search, params, apply) unimplemented.
  test.fixme('3.5.3 — parameter editor panel with text/color/duration controls', async ({ appPage }) => {
    await nav(appPage);
    const paramPanel = appPage.locator('[data-testid="template-params"]')
      .or(appPage.locator('text=Parameters'));
    const count = await paramPanel.count();
    expect(count, 'Template parameter editor should exist').toBeGreaterThan(0);
  });

  // ── 3.5.4: Search templates by name ────────────────────────────────────
  // Feature gap: Motion tab MVP UI (template cards, search, params, apply) unimplemented.
  test.fixme('3.5.4 — template search by name', async ({ appPage }) => {
    await nav(appPage);
    const searchInput = appPage.locator('input[placeholder*="search" i]')
      .or(appPage.locator('[data-testid="template-search"]'));
    const count = await searchInput.count();
    expect(count, 'Template search input should exist').toBeGreaterThan(0);
  });

  // ── 3.5.5: Filter by category ─────────────────────────────────────────
  // Feature gap: Motion tab MVP UI (template cards, search, params, apply) unimplemented.
  test.fixme('3.5.5 — category filter for templates', async ({ appPage }) => {
    await nav(appPage);
    const categoryFilter = appPage.locator('text=Intros')
      .or(appPage.locator('[data-testid="category-filter"]'));
    const count = await categoryFilter.count();
    expect(count, 'Category filter (Intros, Outros, etc.) should exist').toBeGreaterThan(0);
  });

  // ── 3.5.6: "Apply to Timeline" button ─────────────────────────────────
  // Feature gap: Motion tab MVP UI (template cards, search, params, apply) unimplemented.
  test.fixme('3.5.6 — "Apply to Timeline" button exists', async ({ appPage }) => {
    await nav(appPage);
    const applyBtn = appPage.locator('text=Apply to Timeline')
      .or(appPage.locator('[data-testid="btn-apply-template"]'));
    const count = await applyBtn.count();
    expect(count, '"Apply to Timeline" button should exist').toBeGreaterThan(0);
  });
});
