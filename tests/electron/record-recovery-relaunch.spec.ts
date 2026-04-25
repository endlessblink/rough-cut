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
      const appPage = await secondApp.firstWindow();
      await appPage.waitForURL(/127\.0\.0\.1:7544/, { timeout: 30_000 });
      await appPage.waitForLoadState('domcontentloaded', { timeout: 30_000 });
      await appPage.waitForFunction(() => Boolean((window as unknown as { roughcut?: unknown }).roughcut), {
        timeout: 30_000,
      });
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

  test('recovery restores the autosaved project snapshot before importing the partial take', async () => {
    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-recovery-project-'));
    const partialTakePath = join(recordingDir, 'partial-take.webm');
    await createFixtureRecording(partialTakePath);

    let firstApp: ElectronApplication | null = null;
    let secondApp: ElectronApplication | null = null;

    try {
      firstApp = await launchApp();
      const firstPage = await waitForAppReady(firstApp);

      const projectSnapshotPath = await firstPage.evaluate(async ({ recordingDir, partialTakePath }) => {
        const win = window as unknown as {
          roughcut: {
            projectAutoSave: (project: unknown, filePath?: string) => Promise<string>;
            debugSetRecordingRecovery: (payload: unknown) => Promise<unknown>;
          };
          __roughcutStores?: { project?: { getState: () => any } };
        };
        const projectStore = win.__roughcutStores?.project;
        const state = projectStore?.getState();
        state.updateProject((project: any) => ({
          ...project,
          name: 'Recovered Context',
          assets: [
            ...project.assets,
            {
              id: 'fixture-existing-asset',
              type: 'video',
              filePath: `${recordingDir}/existing-asset.webm`,
              duration: 1,
              metadata: {},
            },
          ],
        }));

        const updatedState = projectStore?.getState();
        const snapshotPath = await win.roughcut.projectAutoSave(updatedState?.project, undefined);
        await win.roughcut.debugSetRecordingRecovery(null);
        await win.roughcut.debugSetRecordingRecovery({
          startedAt: '2026-04-19T10:00:00.000Z',
          recordingsDir: recordingDir,
          projectName: 'Recovered Context',
          projectSnapshotPath: snapshotPath,
          projectSnapshotTakenAt: '2026-04-25T10:00:00.000Z',
          sourceId: 'screen:1:0',
          recordMode: 'screen',
          sessionState: 'recording',
          expectedArtifacts: {
            videoPath: partialTakePath,
            audioPath: null,
            cursorPath: null,
          },
        });
        return snapshotPath;
      }, { recordingDir, partialTakePath });

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
        const state = stores?.project.getState();
        return state?.project?.name === 'Recovered Context' && state.project.assets.length === 2;
      });

      await expect
        .poll(async () => {
          return appPage.evaluate(() => {
            const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
            return {
              projectName: stores?.project.getState().project.name ?? null,
              assetCount: stores?.project.getState().project.assets.length ?? 0,
              projectFilePath: stores?.project.getState().projectFilePath ?? null,
            };
          });
        })
        .toEqual({
          projectName: 'Recovered Context',
          assetCount: 2,
          projectFilePath: projectSnapshotPath,
        });
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
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const api = (window as unknown as { roughcut?: unknown }).roughcut;
      return Boolean(document.getElementById('root') && api && stores?.project);
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
