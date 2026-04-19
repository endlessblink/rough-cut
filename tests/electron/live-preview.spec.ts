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
    const preview = appPage.locator('[data-testid="record-preview-status"]');

    await expect(preview).toHaveAttribute('data-preview-state', 'empty');
    await expect(preview).toContainText('Choose a screen to preview');
    await expect(preview).toContainText('Pick a screen to make the Record tab reflect the real capture source.');
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

    const preview = appPage.locator('[data-testid="record-preview-status"]');
    await expect(preview).toHaveAttribute('data-preview-state', 'failed');
    await expect(preview).toContainText('Preview unavailable');
    await expect(preview).toContainText('Preview pipeline rejected the selected source.');
  });

  test('renders a live preview canvas for the selected source', async ({ appPage }) => {
    await appPage.evaluate(async ({ debugSource }) => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const stubStream = document.createElement('canvas').captureStream(1);
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const mandatory = (constraints?.video as { mandatory?: { chromeMediaSource?: string } })
          ?.mandatory;
        if (mandatory?.chromeMediaSource === 'desktop') {
          return stubStream;
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

    await expect(appPage.locator('[data-testid="live-preview-canvas"]')).toBeVisible();
    await expect(appPage.locator('[data-testid="record-preview-status"]')).toHaveCount(0);
  });
});
