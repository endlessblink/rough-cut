import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('TASK-196 stop pill live verify', () => {
  test('Linux recording creates and removes the Stop pill window', async ({
    appPage,
    electronApp,
  }) => {
    test.skip(process.platform !== 'linux', 'Linux-only verification');
    test.setTimeout(90_000);

    await navigateToTab(appPage, 'record');

    const sources = await appPage.evaluate(async () => {
      const api = (window as unknown as {
        roughcut: {
          recordingGetSources: () => Promise<Array<{ id: string; type: 'screen' | 'window' }>>;
          recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<void>;
        };
      }).roughcut;

      const sources = await api.recordingGetSources();
      const screenSource = sources.find((source) => source.type === 'screen') ?? null;
      if (!screenSource) return null;

      await api.recordingConfigUpdate({
        recordMode: 'fullscreen',
        selectedSourceId: screenSource.id,
        selectedMicDeviceId: null,
        selectedCameraDeviceId: null,
        selectedSystemAudioSourceId: null,
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
        countdownSeconds: 0,
      });

      return { selectedSourceId: screenSource.id };
    });

    test.skip(!sources, 'No screen capture source available for live stop-pill verification');

    const windowsBefore = await electronApp.evaluate(async ({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().map((win) => ({
        bounds: win.getBounds(),
        visible: win.isVisible(),
        destroyed: win.isDestroyed(),
        url: win.webContents.getURL(),
      }));
    });

    await appPage.evaluate(async () => {
      const api = (window as unknown as {
        roughcut: { recordingSessionStart: () => Promise<unknown> };
      }).roughcut;
      await api.recordingSessionStart();
    });

    const stopPillDuringRecording = await expect
      .poll(async () => {
        return electronApp.evaluate(async ({ BrowserWindow }) => {
          const wins = BrowserWindow.getAllWindows().map((win) => ({
            bounds: win.getBounds(),
            visible: win.isVisible(),
            destroyed: win.isDestroyed(),
            url: win.webContents.getURL(),
          }));
          return (
            wins.find(
              (win) =>
                !win.destroyed &&
                win.visible &&
                win.bounds.width === 180 &&
                win.bounds.height === 40 &&
                /stop-pill-\d+\.html$/.test(win.url),
            ) ?? null
          );
        });
      }, { timeout: 20_000 })
      .not.toBeNull()
      .then(async () =>
        electronApp.evaluate(async ({ BrowserWindow }) => {
          const wins = BrowserWindow.getAllWindows().map((win) => ({
            bounds: win.getBounds(),
            visible: win.isVisible(),
            destroyed: win.isDestroyed(),
            url: win.webContents.getURL(),
          }));
          return (
            wins.find(
              (win) =>
                !win.destroyed &&
                win.visible &&
                win.bounds.width === 180 &&
                win.bounds.height === 40 &&
                /stop-pill-\d+\.html$/.test(win.url),
            ) ?? null
          );
        }),
      );

    expect(stopPillDuringRecording).toBeTruthy();
    expect(stopPillDuringRecording?.url).toMatch(/stop-pill-\d+\.html$/);
    expect(stopPillDuringRecording?.bounds.width).toBe(180);
    expect(stopPillDuringRecording?.bounds.height).toBe(40);

    await appPage.evaluate(async () => {
      const api = (window as unknown as {
        roughcut: { panelStopRecording: () => Promise<void> };
      }).roughcut;
      await api.panelStopRecording();
    });

    await expect
      .poll(async () => {
        return electronApp.evaluate(async ({ BrowserWindow }) => {
          const wins = BrowserWindow.getAllWindows().map((win) => ({
            bounds: win.getBounds(),
            visible: win.isVisible(),
            destroyed: win.isDestroyed(),
            url: win.webContents.getURL(),
          }));
          return wins.some(
            (win) =>
              !win.destroyed &&
              win.visible &&
              win.bounds.width === 180 &&
              win.bounds.height === 40 &&
              /stop-pill-\d+\.html$/.test(win.url),
          );
        });
      }, { timeout: 20_000 })
      .toBe(false);

    const windowsAfter = await electronApp.evaluate(async ({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().map((win) => ({
        bounds: win.getBounds(),
        visible: win.isVisible(),
        destroyed: win.isDestroyed(),
        url: win.webContents.getURL(),
      }));
    });

    expect(windowsAfter.length).toBeLessThanOrEqual(windowsBefore.length + 1);
  });
});
