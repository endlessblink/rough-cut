/**
 * Ad-hoc probe: reproduce the "camera preview goes black when screen source
 * changes" bug and capture [camera-diag] console output.
 *
 * This is NOT a regression test — it's a diagnostic harness. The assertions
 * at the end just keep Playwright happy; the real output is the printed log.
 */
import { test, expect, navigateToTab } from './fixtures/electron-app.js';

type DiagEntry = { time: number; text: string };

test.setTimeout(60_000);

test('adhoc — camera preview state across screen-source switch', async ({
  appPage,
  electronApp,
}) => {
  // 1. Collect captured logs from BOTH windows.
  const diag: DiagEntry[] = [];
  const t0 = Date.now();
  const capture = (source: string) => (msg: import('@playwright/test').ConsoleMessage) => {
    const text = msg.text();
    if (
      text.includes('[camera-diag]') ||
      text.includes('[PanelApp]') ||
      text.includes('getDisplayMedia') ||
      text.includes('getUserMedia')
    ) {
      diag.push({ time: Date.now() - t0, text: `[${source}] ${text}` });
    }
  };
  appPage.on('console', capture('renderer'));

  // 2. Get to Record tab and configure defaults.
  await navigateToTab(appPage, 'record');
  await appPage.evaluate(async () => {
    await (
      window as unknown as {
        roughcut: {
          recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).roughcut.recordingConfigUpdate({
      recordMode: 'fullscreen',
      selectedSourceId: null,
      selectedMicDeviceId: null,
      selectedCameraDeviceId: null,
      selectedSystemAudioSourceId: null,
      micEnabled: false,
      sysAudioEnabled: false,
      cameraEnabled: true,
      countdownSeconds: 3,
    });
  });

  // 3. Open the panel window.
  const panelPromise = electronApp.waitForEvent('window');
  await appPage.locator('[data-testid="record-open-setup-panel"]').click();
  const panelPage = await panelPromise;
  await panelPage.waitForLoadState('domcontentloaded');
  panelPage.on('console', capture('panel'));

  // 4. Discover real sources via main-process IPC.
  const sources: Array<{ id: string; name: string; type: string }> = await appPage.evaluate(
    async () => {
      const api = (
        window as unknown as {
          roughcut: {
            recordingGetSources: () => Promise<Array<{ id: string; name: string; type: string }>>;
          };
        }
      ).roughcut;
      return api.recordingGetSources();
    },
  );
  const screenSources = sources.filter((s) => s.type === 'screen');
  console.log(`[probe] Discovered ${screenSources.length} screen sources:`);
  for (const s of screenSources) {
    console.log(`[probe]   - ${s.id} (${s.name})`);
  }

  test.skip(screenSources.length < 2, 'Need at least 2 screens to probe the bug');

  // 5. Select source A (first screen), wait for camera preview to come up.
  const srcA = screenSources[0]!;
  const srcB = screenSources[1]!;
  console.log(`[probe] Selecting source A: ${srcA.id}`);
  await panelPage.evaluate(async (id: string) => {
    await (
      window as unknown as {
        roughcut: {
          recordingConfigUpdate: (p: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).roughcut.recordingConfigUpdate({ selectedSourceId: id });
  }, srcA.id);

  // Wait for camera stream to acquire + overlay effect to run.
  await panelPage.waitForTimeout(2500);

  const stateA = await panelPage.evaluate(() => {
    const v = document.querySelector('video[playsinline]') as HTMLVideoElement | null;
    const stream = v?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0] ?? null;
    return {
      haveVideo: !!v,
      videoPaused: v?.paused,
      videoReadyState: v?.readyState,
      videoWidth: v?.videoWidth,
      videoHeight: v?.videoHeight,
      haveStream: !!stream,
      trackReadyState: track?.readyState,
      trackMuted: track?.muted,
      trackEnabled: track?.enabled,
      trackLabel: track?.label,
    };
  });
  console.log('[probe] State after source A:', JSON.stringify(stateA, null, 2));
  expect(stateA.trackReadyState).toBe('live');
  expect(stateA.videoPaused).toBe(false);

  // 6. Switch to source B — this is where the bug reportedly fires.
  console.log(`[probe] Switching to source B: ${srcB.id}`);
  await panelPage.evaluate(async (id: string) => {
    await (
      window as unknown as {
        roughcut: {
          recordingConfigUpdate: (p: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).roughcut.recordingConfigUpdate({ selectedSourceId: id });
  }, srcB.id);

  await panelPage.waitForTimeout(2500);

  const stateB = await panelPage.evaluate(() => {
    const v = document.querySelector('video[playsinline]') as HTMLVideoElement | null;
    const stream = v?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0] ?? null;
    return {
      haveVideo: !!v,
      videoPaused: v?.paused,
      videoReadyState: v?.readyState,
      videoWidth: v?.videoWidth,
      videoHeight: v?.videoHeight,
      haveStream: !!stream,
      trackReadyState: track?.readyState,
      trackMuted: track?.muted,
      trackEnabled: track?.enabled,
      trackLabel: track?.label,
    };
  });
  console.log('[probe] State after switching to source B:', JSON.stringify(stateB, null, 2));
  expect(stateB.trackReadyState).toBe('live');
  expect(stateB.videoPaused).toBe(false);

  // 7. Switch back to A.
  console.log(`[probe] Switching back to source A: ${srcA.id}`);
  await panelPage.evaluate(async (id: string) => {
    await (
      window as unknown as {
        roughcut: {
          recordingConfigUpdate: (p: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).roughcut.recordingConfigUpdate({ selectedSourceId: id });
  }, srcA.id);
  await panelPage.waitForTimeout(2500);

  const stateA2 = await panelPage.evaluate(() => {
    const v = document.querySelector('video[playsinline]') as HTMLVideoElement | null;
    const stream = v?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0] ?? null;
    return {
      haveVideo: !!v,
      videoPaused: v?.paused,
      videoReadyState: v?.readyState,
      videoWidth: v?.videoWidth,
      videoHeight: v?.videoHeight,
      haveStream: !!stream,
      trackReadyState: track?.readyState,
      trackMuted: track?.muted,
      trackEnabled: track?.enabled,
    };
  });
  console.log('[probe] State after switching back to A:', JSON.stringify(stateA2, null, 2));
  expect(stateA2.trackReadyState).toBe('live');
  expect(stateA2.videoPaused).toBe(false);

  // 8. Dump diagnostic log in temporal order.
  console.log('\n──────── DIAGNOSTIC LOG TIMELINE ────────');
  for (const entry of diag) {
    console.log(`+${String(entry.time).padStart(5, ' ')}ms ${entry.text}`);
  }
  console.log('──────── END DIAGNOSTIC LOG ────────\n');
});
