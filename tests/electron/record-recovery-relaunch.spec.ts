import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('Record recovery relaunch', () => {
  test('relaunch detects and recovers a partial take', async () => {
    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-'));
    const partialTakePath = join(recordingDir, 'partial-take.webm');
    await createFixtureRecording(partialTakePath);

    let firstApp: ElectronApplication | null = null;
    let secondApp: ElectronApplication | null = null;

    try {
      firstApp = await launchApp();
      const firstPage = await waitForAppReady(firstApp);

      await firstPage.evaluate(
        async ({ recordingDir, partialTakePath }) => {
          const api = (window as unknown as { roughcut: any }).roughcut;
          await api.debugSetRecordingRecovery(null);
          await api.debugSetRecordingRecovery({
            startedAt: '2026-04-19T10:00:00.000Z',
            recordingsDir: recordingDir,
            sourceId: 'screen:1:0',
            recordMode: 'screen',
            sessionState: 'recording',
            expectedArtifacts: {
              videoPath: partialTakePath,
              audioPath: null,
              cursorPath: null,
            },
          });
        },
        { recordingDir, partialTakePath },
      );

      await firstApp.close();
      firstApp = null;

      secondApp = await launchApp();
      const appPage = await waitForAppReady(secondApp);
      const panelPromise = secondApp.waitForEvent('window');
      await appPage.evaluate(() => {
        return (
          window as unknown as { roughcut: { openRecordingPanel: () => Promise<void> } }
        ).roughcut.openRecordingPanel();
      });
      const panelPage = await panelPromise;
      await panelPage.waitForLoadState('domcontentloaded');

      await expect(panelPage.getByTestId('panel-recovery-banner')).toBeVisible();
      await panelPage.getByTestId('panel-recovery-recover').click();

      await appPage.waitForFunction(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length === 1;
      });

      await expect
        .poll(async () => {
          return appPage.evaluate(() => {
            return (
              window as unknown as { roughcut: { recordingRecoveryGet: () => Promise<unknown> } }
            ).roughcut.recordingRecoveryGet();
          });
        })
        .toBeNull();
    } finally {
      if (secondApp) {
        const cleanupPage = await secondApp.firstWindow().catch(() => null);
        if (cleanupPage) {
          await cleanupPage
            .evaluate(() => {
              return (
                window as unknown as {
                  roughcut: { debugSetRecordingRecovery: (payload: null) => Promise<unknown> };
                }
              ).roughcut.debugSetRecordingRecovery(null);
            })
            .catch(() => {});
        }
      }
      if (firstApp) await firstApp.close().catch(() => {});
      if (secondApp) await secondApp.close().catch(() => {});
      await rm(recordingDir, { recursive: true, force: true });
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
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      if (!root || root.childElementCount === 0) return false;

      return Boolean(
        document.querySelector('[data-testid="app-header"]') ||
        document.querySelector('[data-testid="projects-tab-root"]') ||
        document.querySelector('[data-testid="record-tab-root"]') ||
        document.querySelector('[data-testid="edit-tab-root"]') ||
        document.querySelector('[data-testid="export-tab-root"]') ||
        document.querySelector('[data-testid="motion-tab-root"]') ||
        document.querySelector('[data-testid="ai-tab-root"]'),
      );
    },
    { timeout: 30_000 },
  );
  return page;
}

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30_000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve();
    });
  });
}

async function createFixtureRecording(filePath: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=320x240:d=1:r=30',
    '-c:v',
    'libvpx',
    filePath,
  ]);
}
