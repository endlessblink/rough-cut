/**
 * AI Tab — Acceptance Tests vs MVP Spec (Section 4.5)
 *
 * Red = missing feature. Green = implemented.
 * The AI tab is currently a placeholder — ALL tests should fail.
 */
import { test, expect } from './fixtures/electron-app.js';

function nav(appPage: import('@playwright/test').Page) {
  return appPage.click('[data-testid="tab-ai"]').then(() =>
    appPage.waitForSelector('[data-testid="ai-tab-root"]', { timeout: 5_000 })
  );
}

test.describe('AI Tab — MVP Acceptance', () => {

  // Note: AI and Motion are currently merged as "AI Motion" placeholder.
  // MVP spec requires them as separate tabs (TASK-033).

  // ── 4.5.0: AI tab exists as separate tab ──────────────────────────────
  test('4.5.0 — AI exists as its own tab (not merged with Motion)', async ({ appPage }) => {
    const aiTab = appPage.locator('[data-testid="tab-ai"]');
    const count = await aiTab.count();
    expect(count, 'AI should be a separate tab from Motion (TASK-033)').toBeGreaterThan(0);
  });

  // ── 4.5.1: Feature selector (Auto-Captions | Smart Zoom) ─────────────
  // Feature gap: AI tab placeholder — Auto-Captions/Smart Zoom selector unimplemented.
  test.fixme('4.5.1 — feature selector for Auto-Captions and Smart Zoom', async ({ appPage }) => {
    await nav(appPage);
    const captions = appPage.locator('text=Auto-Captions')
      .or(appPage.locator('text=Captions'));
    const zoom = appPage.locator('text=Smart Zoom');
    const captionCount = await captions.count();
    const zoomCount = await zoom.count();
    expect(captionCount, 'Auto-Captions feature option should exist').toBeGreaterThan(0);
    expect(zoomCount, 'Smart Zoom feature option should exist').toBeGreaterThan(0);
  });

  // ── 4.5.2: Source selector for assets ─────────────────────────────────
  test('4.5.2 — source selector lists project assets', async ({ appPage }) => {
    await nav(appPage);
    const sourceList = appPage.locator('[data-testid="ai-source-list"]')
      .or(appPage.locator('text=Select asset'));
    const count = await sourceList.count();
    expect(count, 'AI source selector should list project assets').toBeGreaterThan(0);
  });

  // ── 4.5.3: Analyze button triggers AI pipeline ────────────────────────
  test('4.5.3 — Analyze button exists', async ({ appPage }) => {
    await nav(appPage);
    const analyzeBtn = appPage.locator('text=Analyze')
      .or(appPage.locator('[data-testid="btn-analyze"]'));
    const count = await analyzeBtn.count();
    expect(count, 'Analyze button should exist').toBeGreaterThan(0);
  });

  // ── 4.5.4: Results panel with Accept/Reject/Edit ──────────────────────
  // Feature gap: AI results panel unimplemented.
  test.fixme('4.5.4 — results panel with Accept/Reject per annotation', async ({ appPage }) => {
    await nav(appPage);
    const resultsPanel = appPage.locator('[data-testid="ai-results"]')
      .or(appPage.locator('text=Results'));
    const count = await resultsPanel.count();
    expect(count, 'AI results panel should exist').toBeGreaterThan(0);
  });

  // ── 4.5.8: "Apply Accepted to Timeline" button ────────────────────────
  // Feature gap: "Apply Accepted to Timeline" button unimplemented.
  test.fixme('4.5.8 — "Apply Accepted to Timeline" button', async ({ appPage }) => {
    await nav(appPage);
    const applyBtn = appPage.locator('text=Apply Accepted')
      .or(appPage.locator('text=Apply to Timeline'))
      .or(appPage.locator('[data-testid="btn-apply-ai"]'));
    const count = await applyBtn.count();
    expect(count, '"Apply Accepted to Timeline" button should exist').toBeGreaterThan(0);
  });

  // ── 4.5.11: Error message if AI provider unavailable ──────────────────
  test('4.5.11 — shows setup instructions when AI provider missing', async ({ appPage }) => {
    await nav(appPage);
    // Should show a clear message about setting up Whisper or API key
    const providerUI = appPage.locator('text=Provider')
      .or(appPage.locator('text=Whisper'))
      .or(appPage.locator('text=API key'))
      .or(appPage.locator('[data-testid="ai-provider-config"]'));
    const count = await providerUI.count();
    expect(count, 'AI provider configuration/error UI should exist').toBeGreaterThan(0);
  });
});
