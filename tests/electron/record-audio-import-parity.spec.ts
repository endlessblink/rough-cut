import { test, expect } from './fixtures/electron-app.js';
import type { Page } from '@playwright/test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface FakeRecordingResult {
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
}

test.describe('Record audio import parity', () => {
  test('import creates an audio clip when the final recording result has audio', async ({
    electronApp,
    appPage,
  }) => {
    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-import-audio-'));
    await stubProjectAutoSave(appPage, '/tmp/rough-cut-audio-import-with-audio.roughcut');

    const filePath = join(recordingDir, 'with-audio.webm');
    await createFixtureRecording(filePath, true);
    const fileSize = Number((await stat(filePath)).size);

    try {
      await fireRecordingAssetReady(electronApp, {
        filePath,
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

      await appPage.waitForFunction(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length === 1;
      });

      const snapshot = await readProjectSnapshot(appPage);
      expect(snapshot.assetHasAudio).toBe(true);
      expect(snapshot.audioClipCount).toBe(1);
    } finally {
      await rm(recordingDir, { recursive: true, force: true });
    }
  });

  test('import does not create an audio clip when the final recording result is silent', async ({
    electronApp,
    appPage,
  }) => {
    const recordingDir = await mkdtemp(join(tmpdir(), 'rough-cut-import-silent-'));
    await stubProjectAutoSave(appPage, '/tmp/rough-cut-audio-import-silent.roughcut');

    const filePath = join(recordingDir, 'silent.webm');
    await createFixtureRecording(filePath, false);
    const fileSize = Number((await stat(filePath)).size);

    try {
      await fireRecordingAssetReady(electronApp, {
        filePath,
        durationFrames: 120,
        durationMs: 4000,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'vp8',
        fileSize,
        hasAudio: false,
        thumbnailPath: null,
        cursorEventsPath: null,
      });

      await appPage.waitForFunction(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.project.getState().project.assets.length === 1;
      });

      const snapshot = await readProjectSnapshot(appPage);
      expect(snapshot.assetHasAudio).toBe(false);
      expect(snapshot.audioClipCount).toBe(0);
    } finally {
      await rm(recordingDir, { recursive: true, force: true });
    }
  });
});

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve();
    });
  });
}

async function createFixtureRecording(filePath: string, withAudio: boolean): Promise<void> {
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=320x240:d=1:r=30',
  ];

  if (withAudio) {
    args.push('-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', '-c:a', 'libopus');
  } else {
    args.push('-an');
  }

  args.push('-c:v', 'libvpx', filePath);
  await execFileAsync('ffmpeg', args);
}

async function stubProjectAutoSave(page: Page, stubPath: string): Promise<void> {
  await page.evaluate((path) => {
    const rough = (window as unknown as { roughcut?: any }).roughcut;
    if (rough) {
      rough.projectAutoSave = async () => path;
    }
  }, stubPath);
}

async function fireRecordingAssetReady(
  electronApp: import('@playwright/test').ElectronApplication,
  payload: FakeRecordingResult,
): Promise<void> {
  await electronApp.evaluate(async ({ BrowserWindow }, p) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents && !w.isDestroyed());
    if (!win) throw new Error('No BrowserWindow available to emit RECORDING_ASSET_READY');
    win.webContents.send('recording:asset-ready', p);
  }, payload);
}

async function readProjectSnapshot(page: Page): Promise<{ audioClipCount: number; assetHasAudio: boolean | null }> {
  return page.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const state = stores?.project?.getState?.();
    const project = state?.project;
    const audioTrack = project?.composition?.tracks?.find((track: any) => track.type === 'audio');
    const activeAssetId = state?.activeAssetId ?? null;
    const activeAsset = project?.assets?.find((asset: any) => asset.id === activeAssetId) ?? null;

    return {
      audioClipCount: audioTrack?.clips?.length ?? 0,
      assetHasAudio: activeAsset?.metadata?.hasAudio ?? null,
    };
  });
}
