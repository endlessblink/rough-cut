import { test, expect } from './fixtures/electron-app.js';

type RoughcutApi = {
  recordingGetSources: () => Promise<Array<{ id: string; type: 'screen' | 'window' }>>;
  recordingConfigGet: () => Promise<{ recordMode: string; selectedSourceId: string | null }>;
  recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
  openRecordingPanel: () => Promise<void>;
  closeRecordingPanel: () => Promise<void>;
  debugGetLastDisplayMediaSelection: () => Promise<{
    requestedRecordMode: string | null;
    configuredSelectedSourceId: string | null;
    grantedSourceId: string | null;
    grantedSourceType: 'screen' | 'window' | null;
  } | null>;
};

test.describe('Record mode capture source selection', () => {
  test('mode switching changes the source granted by the display-media handler', async ({
    appPage,
    electronApp,
  }) => {
    const sourceSummary = await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      const sources = await api.recordingGetSources();
      return {
        screenIds: sources.filter((source) => source.type === 'screen').map((source) => source.id),
        windowIds: sources.filter((source) => source.type === 'window').map((source) => source.id),
      };
    });

    expect(
      sourceSummary.screenIds.length,
      'Expected at least one screen capture source.',
    ).toBeGreaterThan(0);
    expect(
      sourceSummary.windowIds.length,
      'Expected at least one window capture source.',
    ).toBeGreaterThan(0);

    const initialScreenSourceId = sourceSummary.screenIds[0];
    expect(initialScreenSourceId).toBeTruthy();

    await appPage.evaluate(
      async ({ sourceId }) => {
        const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
        await api.recordingConfigUpdate({
          recordMode: 'fullscreen',
          selectedSourceId: sourceId,
        });
      },
      { sourceId: initialScreenSourceId },
    );

    const panelPromise = electronApp.waitForEvent('window');
    await appPage.evaluate(() => {
      return (window as unknown as { roughcut: RoughcutApi }).roughcut.openRecordingPanel();
    });
    const panelPage = await panelPromise;
    await panelPage.waitForLoadState('domcontentloaded');

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (
            window as unknown as { roughcut: RoughcutApi }
          ).roughcut.debugGetLastDisplayMediaSelection();
        }),
      )
      .toMatchObject({
        requestedRecordMode: 'fullscreen',
        grantedSourceId: expect.stringMatching(/^screen:/),
        grantedSourceType: 'screen',
      });

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.recordingConfigUpdate({ recordMode: 'window' });
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (window as unknown as { roughcut: RoughcutApi }).roughcut.recordingConfigGet();
        }),
      )
      .toMatchObject({
        recordMode: 'window',
        selectedSourceId: expect.stringMatching(/^window:/),
      });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (
            window as unknown as { roughcut: RoughcutApi }
          ).roughcut.debugGetLastDisplayMediaSelection();
        }),
      )
      .toMatchObject({
        requestedRecordMode: 'window',
        grantedSourceId: expect.stringMatching(/^window:/),
        grantedSourceType: 'window',
      });

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.recordingConfigUpdate({ recordMode: 'region' });
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (window as unknown as { roughcut: RoughcutApi }).roughcut.recordingConfigGet();
        }),
      )
      .toMatchObject({
        recordMode: 'region',
        selectedSourceId: expect.stringMatching(/^screen:/),
      });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (
            window as unknown as { roughcut: RoughcutApi }
          ).roughcut.debugGetLastDisplayMediaSelection();
        }),
      )
      .toMatchObject({
        requestedRecordMode: 'region',
        grantedSourceId: expect.stringMatching(/^screen:/),
        grantedSourceType: 'screen',
      });

    await appPage.evaluate(() => {
      return (window as unknown as { roughcut: RoughcutApi }).roughcut.closeRecordingPanel();
    });
  });
});
