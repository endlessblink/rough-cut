import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import type { ElectronApplication } from '@playwright/test';

interface FakeRecordingResult {
  filePath: string;
  durationFrames: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
  hasAudio: boolean;
  thumbnailPath: string | null;
  cursorEventsPath: string | null;
  cameraFilePath?: string;
  audioCapture?: {
    requested: {
      micEnabled: boolean;
      sysAudioEnabled: boolean;
    };
    resolved: {
      micSource: string | null;
      systemAudioSource: string | null;
    };
    final: {
      hasAudio: boolean;
    };
  };
}

test.describe('Record post-take review flow', () => {
  test('shows explicit keep-reviewing action for a fresh take', async ({ electronApp, appPage }) => {
    await navigateToTab(appPage, 'record');

    await fireRecordingAssetReady(electronApp, fakeRecordingResult('keep-reviewing'));

    const reviewCard = appPage.locator('[data-testid="record-post-take-decision"]');
    await expect(reviewCard).toBeVisible();
    await expect(appPage.locator('[data-testid="record-post-take-keep-reviewing"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-post-take-retry"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-post-take-continue-edit"]')).toBeVisible();

    await appPage.locator('[data-testid="record-post-take-keep-reviewing"]').click();
    await expect(reviewCard).toBeHidden();
  });

  test('retry opens the pre-recording panel without discarding the current take', async ({
    electronApp,
    appPage,
  }) => {
    await navigateToTab(appPage, 'record');

    await fireRecordingAssetReady(electronApp, fakeRecordingResult('retry-opens-picker'));

    await expect(appPage.locator('[data-testid="record-post-take-decision"]')).toBeVisible();

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.locator('[data-testid="record-post-take-retry"]').click();
    const panelPage = await panelPromise;
    await expect(panelPage.locator('[data-testid="panel-source-select"]')).toBeVisible();
  });

  test('can continue directly into Edit from the post-take review card', async ({
    electronApp,
    appPage,
  }) => {
    await navigateToTab(appPage, 'record');

    await fireRecordingAssetReady(electronApp, fakeRecordingResult('continue-edit'));

    await expect(appPage.locator('[data-testid="record-post-take-decision"]')).toBeVisible();
    await appPage.locator('[data-testid="record-post-take-continue-edit"]').click();
    await expect(appPage.locator('[data-testid="edit-tab-root"]')).toBeVisible();
  });

  test('shows multi-source audio review for a mixed saved take', async ({ electronApp, appPage }) => {
    await navigateToTab(appPage, 'record');

    await fireRecordingAssetReady(electronApp, fakeRecordingResult('audio-review'));

    await expect(appPage.locator('[data-testid="record-audio-review-card"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-audio-review-track-microphone"]')).toHaveAttribute(
      'data-captured',
      'true',
    );
    await expect(appPage.locator('[data-testid="record-audio-review-track-system"]')).toHaveAttribute(
      'data-captured',
      'true',
    );
    await expect(appPage.locator('[data-testid="record-audio-review-mixed-note"]')).toBeVisible();
  });
});

function fakeRecordingResult(label: string): FakeRecordingResult {
  return {
    filePath: `/tmp/rough-cut-post-take-${label}-${Date.now()}.webm`,
    durationFrames: 120,
    durationMs: 4000,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'vp8',
    fileSize: 1,
    hasAudio: true,
    thumbnailPath: null,
    cursorEventsPath: null,
    audioCapture: {
      requested: { micEnabled: true, sysAudioEnabled: true },
      resolved: {
        micSource: 'alsa_input.usb-mic.stereo',
        systemAudioSource: 'alsa_output.hdmi.monitor',
      },
      final: { hasAudio: true },
    },
  };
}

async function fireRecordingAssetReady(
  electronApp: ElectronApplication,
  payload: FakeRecordingResult,
): Promise<void> {
  await electronApp.evaluate(async ({ BrowserWindow }, p) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents && !w.isDestroyed());
    if (!win) throw new Error('No BrowserWindow available to emit RECORDING_ASSET_READY');
    win.webContents.send('recording:asset-ready', p);
  }, payload);
}
