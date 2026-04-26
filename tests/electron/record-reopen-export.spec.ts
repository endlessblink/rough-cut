import { execFile, execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { navigateToTab } from './fixtures/electron-app.js';

type FakeRecordingResult = {
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
};

test.describe('Record reopen export', () => {
  test('fresh recording survives relaunch, reopen, and export', async () => {
    test.setTimeout(240_000);

    const tempRoot = await mkdtemp(join(tmpdir(), 'rough-cut-record-reopen-export-'));
    const recordingPath = join(tempRoot, 'fresh-recording.webm');
    const projectPath = join(tempRoot, 'fresh-recording.roughcut');
    const exportPath = join(tempRoot, 'fresh-recording-export.mp4');

    let firstApp: ElectronApplication | null = null;
    let secondApp: ElectronApplication | null = null;

    try {
      await createFixtureRecording(recordingPath, true);
      const fileSize = Number((await stat(recordingPath)).size);

      firstApp = await launchApp();
      const firstPage = await waitForAppReady(firstApp);

      await fireRecordingAssetReady(firstApp, {
        filePath: recordingPath,
        durationFrames: 120,
        durationMs: 4000,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'vp8',
        fileSize,
        hasAudio: true,
        thumbnailPath: null,
        cursorEventsPath: null,
      });

      await firstPage.waitForFunction(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length === 1;
      });

      const saved = await firstPage.evaluate(async (targetPath) => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        const project = stores?.project.getState().project;
        return (window as unknown as { roughcut: { projectSave: (project: unknown, path: string) => Promise<boolean> } }).roughcut.projectSave(project, targetPath);
      }, projectPath);

      expect(saved).toBe(true);

      await expect
        .poll(() => existsSync(projectPath), { timeout: 30_000 })
        .toBe(true);

      await firstApp.close();
      firstApp = null;

      secondApp = await launchApp();
      const secondPage = await waitForAppReady(secondApp);

      const reopenedProject = await secondPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (path: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, projectPath);

      const reopenedRecording = (reopenedProject.assets as Array<Record<string, unknown>>).find(
        (asset) => asset.type === 'recording',
      );
      expect(reopenedRecording).toBeTruthy();
      expect(reopenedRecording?.filePath).toBe(recordingPath);

      await secondPage.evaluate(
        ({ project, projectPath, activeAssetId, exportPath }) => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          stores?.project.getState().setProject(project);
          stores?.project.getState().setProjectFilePath(projectPath);
          stores?.project.getState().setActiveAssetId(activeAssetId ?? null);
          stores?.transport.getState().seekToFrame(0);
          (
            window as unknown as { __roughcutTestOverrides?: { exportOutputPath?: string } }
          ).__roughcutTestOverrides = { exportOutputPath: exportPath };
        },
        {
          project: reopenedProject,
          projectPath,
          activeAssetId: reopenedRecording?.id ?? null,
          exportPath,
        },
      );

      await navigateToTab(secondPage, 'export');
      await secondPage.locator('[data-testid="btn-export"]').click();

      await expect
        .poll(() => (existsSync(exportPath) ? statSync(exportPath).size : 0), {
          timeout: 240_000,
        })
        .toBeGreaterThan(1024);

      const probe = JSON.parse(
        execFileSync(
          'ffprobe',
          ['-v', 'quiet', '-print_format', 'json', '-show_streams', exportPath],
          { encoding: 'utf-8' },
        ),
      ) as { streams?: Array<{ codec_type?: string }> };

      expect(probe.streams?.some((stream) => stream.codec_type === 'video')).toBe(true);
      expect(probe.streams?.some((stream) => stream.codec_type === 'audio')).toBe(true);
    } finally {
      if (firstApp) await firstApp.close().catch(() => {});
      if (secondApp) await secondApp.close().catch(() => {});
      await rm(tempRoot, { recursive: true, force: true });
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

async function createFixtureRecording(filePath: string, withAudio: boolean): Promise<void> {
  const args = ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:d=2:r=30'];

  if (withAudio) {
    args.push('-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-c:a', 'libopus');
  } else {
    args.push('-an');
  }

  args.push('-c:v', 'libvpx', filePath);
  await execFileAsync('ffmpeg', args);
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
