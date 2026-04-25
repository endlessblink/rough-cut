import { test, expect, navigateToTab } from './fixtures/electron-app.js';

type RoughcutApi = {
  recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
  debugSetCaptureSources: (
    payload: Array<{
      id: string;
      name: string;
      type: 'screen' | 'window';
      displayId: string | null;
      thumbnailDataUrl: string;
    }> | null,
  ) => Promise<unknown>;
};

const DEBUG_SCREEN_SOURCE = {
  id: 'screen:debug-screen:0',
  name: 'Debug Screen',
  type: 'screen' as const,
  displayId: 'debug-display',
  thumbnailDataUrl: '',
};

async function waitForSelectedSourceId(
  page: import('@playwright/test').Page,
  expected: string | null,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.recordingConfig?.getState?.().selectedSourceId ?? null;
      }),
    )
    .toBe(expected);
}

async function refreshRecordSources(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.describe('Live preview states', () => {
  test.beforeEach(async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources(null);
      await api.recordingConfigUpdate({
        recordMode: 'fullscreen',
        selectedSourceId: null,
      });
    });

    await navigateToTab(appPage, 'record');
  });

  test.afterEach(async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources(null);
      await api.recordingConfigUpdate({ selectedSourceId: null });
    });
  });

  test('shows an empty preview state when no source is selected', async ({ appPage }) => {
    await waitForSelectedSourceId(appPage, null);

    const preview = appPage.locator('[data-testid="record-preview-status"]');

    await expect(preview).toHaveAttribute('data-preview-state', 'empty');
    await expect(preview).toContainText('Choose a screen to preview');
    await expect(preview).toContainText(
      'Choose the screen that Rough Cut should capture before you record.',
    );
    await expect(appPage.locator('[data-testid="record-preview-mode-badge"]')).toHaveCount(0);
  });

  test('shows an acquiring preview state while a source is connecting', async ({ appPage }) => {
    await appPage.evaluate(async ({ debugSource }) => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
          ?.mandatory;
        if (mandatory?.chromeMediaSource === 'desktop') {
          return await new Promise<MediaStream>(() => {});
        }
        return originalGetUserMedia(constraints);
      };

      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources([debugSource]);
      await api.recordingConfigUpdate({
        recordMode: 'fullscreen',
        selectedSourceId: debugSource.id,
      });
    }, { debugSource: DEBUG_SCREEN_SOURCE });

    await refreshRecordSources(appPage);
    await waitForSelectedSourceId(appPage, DEBUG_SCREEN_SOURCE.id);

    const preview = appPage.locator('[data-testid="record-preview-status"]');
    await expect(preview).toHaveAttribute('data-preview-state', 'acquiring');
    await expect(preview).toContainText('Acquiring live preview');
  });

  test('shows a failed preview state when the source cannot be previewed', async ({ appPage }) => {
    await appPage.evaluate(async ({ debugSource }) => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
          ?.mandatory;
        if (mandatory?.chromeMediaSource === 'desktop') {
          throw new Error('Preview pipeline rejected the selected source.');
        }
        return originalGetUserMedia(constraints);
      };

      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources([debugSource]);
      await api.recordingConfigUpdate({
        recordMode: 'fullscreen',
        selectedSourceId: debugSource.id,
      });
    }, { debugSource: DEBUG_SCREEN_SOURCE });

    await refreshRecordSources(appPage);
    await waitForSelectedSourceId(appPage, DEBUG_SCREEN_SOURCE.id);

    const preview = appPage.locator('[data-testid="record-preview-status"]');
    await expect(preview).toHaveAttribute('data-preview-state', 'failed');
    await expect(preview).toContainText('Preview unavailable');
    await expect(preview).toContainText('Preview pipeline rejected the selected source.');
  });

  // The "renders a live preview canvas" test was removed in TASK-178. Two
  // reasons: (1) since commit 37836c6 the main Record tab no longer renders a
  // live-preview-canvas (recursive screen-capture fix); (2) the test's source
  // selection path didn't produce a stable `livePreviewStatus=live` state from
  // outside the panel (DOM snapshot during failure showed `Source: None`).
  //
  // The live-preview→live-source behaviour is already covered deterministically
  // by tests/electron/record-readiness.spec.ts (golden path: blank project
  // to saved take stays truthful) which exercises the same transition using
  // the panel's own lifecycle. The three remaining tests in this file cover
  // the empty/acquiring/failed overlay states without needing a live source.
  // See TASK-178 for release-gate suite scope.
});
