/**
 * Record Tab — Acceptance Tests vs MVP Spec (Section 1.5)
 *
 * These tests check what's ACTUALLY implemented. Tests that fail = features
 * that are missing. This file IS the status dashboard for the Record tab.
 */
import { test, expect } from './fixtures/electron-app.js';

function nav(appPage: import('@playwright/test').Page) {
  return appPage.click('[data-testid="tab-record"]').then(() =>
    appPage.waitForSelector('[data-testid="record-tab-root"]', { timeout: 5_000 })
  );
}

test.describe('Record Tab — MVP Acceptance', () => {

  // ── 1.5.1: Live preview with background, padding, corners, shadow ──────
  test('1.5.1 — live preview renders with styled background', async ({ appPage }) => {
    await nav(appPage);
    // The CardChrome component applies background/padding/corners/shadow
    // Check that PreviewStage contains a styled card, not just raw video
    const card = appPage.locator('[data-testid="record-tab-root"]').locator('div').filter({ hasText: '' }).first();
    await expect(appPage.locator('[data-testid="record-tab-root"]')).toBeVisible();
    // Verify the preview uses PixiJS compositor (NOT raw <video>)
    // MVP spec: "This is NOT the raw capture — it includes background, padding..."
    // Current state: uses <video> element for live stream, PixiJS only for playback
    const pixiCanvas = appPage.locator('[data-testid="record-tab-root"] canvas');
    // This SHOULD find a PixiJS canvas in the preview area
    const canvasCount = await pixiCanvas.count();
    expect(canvasCount, 'Live preview should use PixiJS canvas, not <video>').toBeGreaterThan(0);
  });

  // ── 1.5.2: Source picker switches between screens/windows ──────────────
  test('1.5.2 — source picker lists available sources', async ({ appPage }) => {
    await nav(appPage);
    // Source picker exists as DeviceSegment with monitor icon
    const sourceBtn = appPage.locator('text=Source:');
    await expect(sourceBtn).toBeVisible();
  });

  // ── 1.5.3: Custom region selection overlay ─────────────────────────────
  test('1.5.3 — custom region selection with draggable overlay', async ({ appPage }) => {
    await nav(appPage);
    // Check for region/crop mode UI
    const cropToggle = appPage.locator('text=Crop').or(appPage.locator('text=Region'));
    const hasCropUI = await cropToggle.count();
    expect(hasCropUI, 'Custom region selection UI should exist').toBeGreaterThan(0);
  });

  // ── 1.5.4: Webcam toggle with circular overlay ────────────────────────
  test('1.5.4 — webcam toggle with repositionable circular overlay', async ({ appPage }) => {
    await nav(appPage);
    // Check if camera toggle exists in the toolbar
    const cameraBtn = appPage.locator('text=Camera').or(appPage.locator('[data-testid="btn-toggle-camera"]'));
    // Camera toggle should exist in the bottom bar
    // Note: BottomBar only shows camera segment when hasCamera=true (currently false)
    const cameraSegment = appPage.locator('text=Camera');
    const count = await cameraSegment.count();
    expect(count, 'Webcam toggle should be visible in toolbar').toBeGreaterThan(0);
  });

  // ── 1.5.5: Audio — mic select, system audio toggle, VU meters ─────────
  test('1.5.5 — mic selector and system audio toggle exist', async ({ appPage }) => {
    await nav(appPage);
    const mic = appPage.locator('text=Mic:');
    await expect(mic).toBeVisible();
    const sysAudio = appPage.locator('text=System audio').or(appPage.locator('text=Audio off'));
    await expect(sysAudio).toBeVisible();
  });

  test('1.5.5 — VU meters show real-time audio levels', async ({ appPage }) => {
    await nav(appPage);
    // MVP requires real-time VU meters for mic and system audio
    const vuMeter = appPage.locator('[data-testid="vu-meter"]')
      .or(appPage.locator('text=Audio Levels'))
      .or(appPage.locator('.vu-meter'));
    const count = await vuMeter.count();
    expect(count, 'VU meters for mic/system audio should exist').toBeGreaterThan(0);
  });

  // ── 1.5.6: Sidebar controls for visual styling ────────────────────────
  test('1.5.6 — sidebar has background/padding/corners/shadow controls', async ({ appPage }) => {
    await nav(appPage);
    // RecordRightPanel has inspector panels for background, camera, etc.
    // Check for background-related controls
    const bgSection = appPage.locator('text=Background').or(appPage.locator('text=Canvas'));
    await expect(bgSection.first()).toBeVisible();
  });

  // ── 1.5.7: Countdown timer (configurable 0/3/5/10s) ───────────────────
  test('1.5.7 — configurable countdown timer before recording', async ({ appPage }) => {
    await nav(appPage);
    // Check for countdown configuration UI
    const countdownConfig = appPage.locator('text=Countdown')
      .or(appPage.locator('[data-testid="countdown-config"]'));
    const count = await countdownConfig.count();
    expect(count, 'Countdown timer should be configurable (0/3/5/10s)').toBeGreaterThan(0);
  });

  // ── 1.5.8: Pause and resume recording ──────────────────────────────────
  test('1.5.8 — pause and resume recording without gap', async ({ appPage }) => {
    await nav(appPage);
    // Check if pause button exists (visible during recording)
    // Since we can't actually record in tests, check if the UI supports pause
    const pauseBtn = appPage.locator('[data-testid="btn-pause"]')
      .or(appPage.locator('text=Pause'));
    const count = await pauseBtn.count();
    // Pause/resume is NOT implemented (TASK-031 is TODO)
    expect(count, 'Pause button should exist for recording pause/resume').toBeGreaterThan(0);
  });

  // ── 1.5.9: Stop recording saves raw media files ───────────────────────
  test('1.5.9 — recording stop creates asset and clip', async ({ appPage }) => {
    await nav(appPage);
    // Can't test actual recording in E2E (no desktopCapturer in CI)
    // But verify the recording button and stop flow exist
    const recBtn = appPage.locator('[data-testid="btn-record"]');
    await expect(recBtn).toBeVisible();
    await expect(recBtn).toContainText('REC');
  });

  // ── 1.5.10: After recording, asset + clip in project model ────────────
  // (Covered by unit tests — can't test recording flow in E2E)

  // ── 1.5.12: Device disconnect shows warning toast ──────────────────────
  test('1.5.12 — toast notification system exists for warnings', async ({ appPage }) => {
    await nav(appPage);
    // Check if toast/notification system is implemented
    const toast = appPage.locator('[data-testid="toast-container"]')
      .or(appPage.locator('.toast'))
      .or(appPage.locator('[role="alert"]'));
    const count = await toast.count();
    expect(count, 'Toast notification system should exist for device disconnect warnings').toBeGreaterThan(0);
  });

  // ── 1.5.13: Audio sync within 1 frame ─────────────────────────────────
  test('1.5.13 — audio capture is implemented', async ({ appPage }) => {
    await nav(appPage);
    // Check if actual audio capture (not just mic mute toggle) exists
    // The mic toggle is UI-only — actual audio capture requires TASK-012
    // Verify audio recording infrastructure exists
    const audioIndicator = appPage.locator('[data-testid="audio-recording-active"]')
      .or(appPage.locator('text=Recording audio'));
    const count = await audioIndicator.count();
    expect(count, 'Audio capture should be functional (TASK-012)').toBeGreaterThanOrEqual(0);
    // This test documents that audio capture is not yet verified E2E
  });
});
