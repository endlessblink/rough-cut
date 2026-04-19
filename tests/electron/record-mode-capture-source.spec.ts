import { test, expect } from './fixtures/electron-app.js';

type RoughcutApi = {
  recordingGetSources: () => Promise<Array<{ id: string; type: 'screen' | 'window' }>>;
  recordingConfigGet: () => Promise<{ recordMode: string; selectedSourceId: string | null }>;
  recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
  openRecordingPanel: () => Promise<void>;
  closeRecordingPanel: () => Promise<void>;
  debugSetCaptureSources: (
    payload:
      | Array<{ id: string; name: string; type: 'screen' | 'window'; displayId: string | null }>
      | null,
  ) => Promise<unknown>;
  debugGetLastDisplayMediaSelection: () => Promise<{
    requestedRecordMode: string | null;
    configuredSelectedSourceId: string | null;
    grantedSourceId: string | null;
    grantedSourceType: 'screen' | 'window' | null;
  } | null>;
};

test.describe('Record mode capture source selection', () => {
  test('display-media handler only grants explicitly valid sources for the current mode', async ({ appPage }) => {
    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources([
        {
          id: 'screen:debug-screen:0',
          name: 'Debug Screen',
          type: 'screen',
          displayId: 'debug-display',
        },
        {
          id: 'window:debug-window:0',
          name: 'Debug Window',
          type: 'window',
          displayId: null,
        },
      ]);
    });

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

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (window as unknown as { roughcut: RoughcutApi }).roughcut.recordingConfigGet();
        }),
      )
      .toMatchObject({
        recordMode: 'fullscreen',
        selectedSourceId: initialScreenSourceId,
      });

    await appPage.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Invalid source states reject; the handler output is asserted below.
      }
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
        requestedRecordMode: 'fullscreen',
        grantedSourceId: expect.stringMatching(/^screen:/),
        grantedSourceType: 'screen',
      });

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.recordingConfigUpdate({ recordMode: 'window', selectedSourceId: null });
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (window as unknown as { roughcut: RoughcutApi }).roughcut.recordingConfigGet();
        }),
      )
      .toMatchObject({
        recordMode: 'window',
        selectedSourceId: null,
      });

    await appPage.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Invalid source states reject; the handler output is asserted below.
      }
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
        configuredSelectedSourceId: null,
        grantedSourceId: null,
        grantedSourceType: null,
      });

    const initialWindowSourceId = sourceSummary.windowIds[0];
    expect(initialWindowSourceId).toBeTruthy();

    await appPage.evaluate(
      async ({ sourceId }) => {
        const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
        await api.recordingConfigUpdate({
          recordMode: 'window',
          selectedSourceId: sourceId,
        });
      },
      { sourceId: initialWindowSourceId },
    );

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (window as unknown as { roughcut: RoughcutApi }).roughcut.recordingConfigGet();
        }),
      )
      .toMatchObject({
        recordMode: 'window',
        selectedSourceId: initialWindowSourceId,
      });

    await appPage.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Invalid source states reject; the handler output is asserted below.
      }
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
        configuredSelectedSourceId: expect.stringMatching(/^window:/),
        grantedSourceId: expect.stringMatching(/^window:/),
        grantedSourceType: 'window',
      });

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.recordingConfigUpdate({ recordMode: 'region', selectedSourceId: null });
    });

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (window as unknown as { roughcut: RoughcutApi }).roughcut.recordingConfigGet();
        }),
      )
      .toMatchObject({
        recordMode: 'region',
        selectedSourceId: null,
      });

    await appPage.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Invalid source states reject; the handler output is asserted below.
      }
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
        configuredSelectedSourceId: null,
        grantedSourceId: null,
        grantedSourceType: null,
      });

    await appPage.evaluate(
      async ({ sourceId }) => {
        const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
        await api.recordingConfigUpdate({
          recordMode: 'region',
          selectedSourceId: sourceId,
        });
      },
      { sourceId: initialScreenSourceId },
    );

    await expect
      .poll(async () =>
        appPage.evaluate(() => {
          return (window as unknown as { roughcut: RoughcutApi }).roughcut.recordingConfigGet();
        }),
      )
      .toMatchObject({
        recordMode: 'region',
        selectedSourceId: initialScreenSourceId,
      });

    await appPage.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Invalid source states reject; the handler output is asserted below.
      }
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
        configuredSelectedSourceId: expect.stringMatching(/^screen:/),
        grantedSourceId: expect.stringMatching(/^screen:/),
        grantedSourceType: 'screen',
      });

    await appPage.evaluate(async () => {
      const api = (window as unknown as { roughcut: RoughcutApi }).roughcut;
      await api.debugSetCaptureSources(null);
    });
  });
});
