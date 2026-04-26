import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

test.describe('Record shutdown paths', () => {
  test('panel close during recording falls back to save and returns to idle', async () => {
    let electronApp: ElectronApplication | null = null;

    try {
      electronApp = await launchApp();
      await waitForAppReady(electronApp);

      const result = await electronApp.evaluate(async () => {
        const mod = globalThis.__roughCutSessionManagerTestApi;
        mod.__resetSessionManagerForTests();

        const createFakeWindow = ({ rendererAlive }) => {
          const webContents = {
            destroyed: !rendererAlive,
            sent: [],
            isDestroyed() {
              return this.destroyed;
            },
            send(channel, ...args) {
              this.sent.push({ channel, args });
            },
          };

          return {
            destroyed: false,
            wasShown: false,
            wasShownInactive: false,
            webContents,
            isDestroyed() {
              return this.destroyed;
            },
            destroy() {
              this.destroyed = true;
            },
            show() {
              this.wasShown = true;
            },
            showInactive() {
              this.wasShownInactive = true;
            },
          };
        };

        const fakeMainWindow = createFakeWindow({ rendererAlive: false });
        const fakePanelWindow = createFakeWindow({ rendererAlive: false });

        mod.__setSessionManagerTestHooks({
          stopActiveCaptureResources: async () => {},
          trySaveFromCaptureFiles: async () => ({
            filePath: '/tmp/lane3-panel-close.webm',
            durationFrames: 90,
            durationMs: 3000,
            width: 1920,
            height: 1080,
            fps: 30,
            codec: 'vp8',
            fileSize: 1234,
            hasAudio: true,
            thumbnailPath: null,
          }),
          clearRecoveryMarker: async () => {},
        });

        mod.__setSessionManagerTestState({
          state: 'recording',
          mainWindow: fakeMainWindow,
          panelWindow: fakePanelWindow,
          recordingStartMs: Date.now() - 3000,
          activeRecoveryMarker: {
            startedAt: '2026-04-20T00:00:00.000Z',
            recordingsDir: '/tmp',
            sessionState: 'recording',
          },
        });

        const saved = await mod.__requestSessionShutdownForTests('panel-closed', {
          preferRendererSave: false,
        });

        return {
          saved,
          state: mod.__getSessionManagerTestState(),
          panelDestroyed: fakePanelWindow.destroyed,
          mainShown: fakeMainWindow.wasShown,
        };
      });

      expect(result.saved?.filePath).toBe('/tmp/lane3-panel-close.webm');
      expect(result.state.state).toBe('idle');
      expect(result.state.activeRecoveryMarker).toBeNull();
      expect(result.panelDestroyed).toBe(true);
      expect(result.mainShown).toBe(true);
    } finally {
      if (electronApp) await electronApp.close().catch(() => {});
    }
  });

  test('before-quit during recording waits for shutdown and then quits cleanly', async () => {
    let electronApp: ElectronApplication | null = null;

    try {
      electronApp = await launchApp();
      await waitForAppReady(electronApp);

      const result = await electronApp.evaluate(async () => {
        const mod = globalThis.__roughCutSessionManagerTestApi;
        mod.__resetSessionManagerForTests();

        const createFakeWindow = ({ rendererAlive }) => {
          const webContents = {
            destroyed: !rendererAlive,
            sent: [],
            isDestroyed() {
              return this.destroyed;
            },
            send(channel, ...args) {
              this.sent.push({ channel, args });
            },
          };

          return {
            destroyed: false,
            wasShown: false,
            wasShownInactive: false,
            webContents,
            isDestroyed() {
              return this.destroyed;
            },
            destroy() {
              this.destroyed = true;
            },
            show() {
              this.wasShown = true;
            },
            showInactive() {
              this.wasShownInactive = true;
            },
          };
        };

        const fakeMainWindow = createFakeWindow({ rendererAlive: false });
        const fakePanelWindow = createFakeWindow({ rendererAlive: false });
        const event = {
          prevented: false,
          preventDefault() {
            this.prevented = true;
          },
        };
        let quitCalled = false;

        mod.__setSessionManagerTestHooks({
          stopActiveCaptureResources: async () => {},
          trySaveFromCaptureFiles: async () => ({
            filePath: '/tmp/lane3-app-quit.webm',
            durationFrames: 120,
            durationMs: 4000,
            width: 1920,
            height: 1080,
            fps: 30,
            codec: 'vp8',
            fileSize: 4321,
            hasAudio: true,
            thumbnailPath: null,
          }),
          clearRecoveryMarker: async () => {},
          quitApplication: () => {
            quitCalled = true;
          },
        });

        mod.__setSessionManagerTestState({
          state: 'recording',
          mainWindow: fakeMainWindow,
          panelWindow: fakePanelWindow,
          recordingStartMs: Date.now() - 4000,
          activeRecoveryMarker: {
            startedAt: '2026-04-20T00:00:00.000Z',
            recordingsDir: '/tmp',
            sessionState: 'recording',
          },
        });

        await mod.__handleBeforeQuitForTests(event);
        const startedAt = Date.now();
        while (!quitCalled && Date.now() - startedAt < 1000) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        return {
          prevented: event.prevented,
          quitCalled,
          state: mod.__getSessionManagerTestState(),
          panelDestroyed: fakePanelWindow.destroyed,
        };
      });

      expect(result.prevented).toBe(true);
      expect(result.quitCalled).toBe(true);
      expect(result.state.state).toBe('idle');
      expect(result.state.allowAppQuit).toBe(true);
      expect(result.state.activeRecoveryMarker).toBeNull();
      expect(result.panelDestroyed).toBe(true);
    } finally {
      if (electronApp) await electronApp.close().catch(() => {});
    }
  });
});

async function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: ['--no-sandbox', 'apps/desktop'],
    cwd: process.cwd(),
  });
}

async function waitForAppReady(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForURL(/127\.0\.0\.1:7544/, { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  return page;
}
