import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import {
  createAsset,
  createClip,
  createDefaultRecordingPresentation,
  createProject,
} from '../../packages/project-model/src/index.js';

async function getFreePort(): Promise<number> {
  const { createServer } = await import('node:net');

  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port')));
        return;
      }

      server.close((closeError) => {
        if (closeError) reject(closeError);
        else resolvePort(address.port);
      });
    });
  });
}

async function waitForServer(url: string, child: ChildProcessWithoutNullStreams): Promise<void> {
  const startedAt = Date.now();
  let stderr = '';

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  while (Date.now() - startedAt < 30_000) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready: ${stderr}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}

    await delay(250);
  }

  throw new Error(`Timed out waiting for Vite at ${url}: ${stderr}`);
}

async function startRendererServer() {
  const port = await getFreePort();
  const rendererUrl = `http://127.0.0.1:${port}`;
  const viteBin = resolve(process.cwd(), 'apps/desktop', 'node_modules', '.bin', 'vite');
  const viteProcess = spawn(
    viteBin,
    [
      '--config',
      resolve(process.cwd(), 'apps/desktop/vite.config.ts'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
    },
  );

  await waitForServer(rendererUrl, viteProcess);

  return {
    rendererUrl,
    viteProcess,
  };
}

async function stopRendererServer(viteProcess: ChildProcessWithoutNullStreams) {
  viteProcess.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => viteProcess.once('exit', resolveExit)),
    delay(5_000).then(() => viteProcess.kill('SIGKILL')),
  ]);
}

async function navigateToTab(page: Page, tabId: string) {
  const tabButtonSelector = `[data-testid="tab-${tabId}"]`;
  const tabRootSelector = `[data-testid="${tabId}-tab-root"]`;
  const tabRoot = page.locator(tabRootSelector);
  if (await tabRoot.isVisible().catch(() => false)) {
    return;
  }

  const switchedDirectly = await page
    .evaluate((nextTab) => {
      const setter = (window as unknown as { __roughcutSetActiveTab?: (tab: string) => void })
        .__roughcutSetActiveTab;
      if (!setter) return false;
      setter(nextTab);
      return true;
    }, tabId)
    .catch(() => false);

  if (switchedDirectly) {
    await page.waitForSelector(tabRootSelector, { timeout: 30_000 });
    return;
  }

  const tabButton = page.locator(tabButtonSelector);
  await tabButton.waitFor({ state: 'visible', timeout: 30_000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await tabButton.click();

    const navigated = await page
      .waitForFunction((selector) => Boolean(document.querySelector(selector)), tabRootSelector, {
        timeout: 5_000,
      })
      .then(() => true)
      .catch(() => false);

    if (navigated) {
      return;
    }
  }

  await page.waitForSelector(tabRootSelector, { timeout: 30_000 });
}

async function getAppPage(electronApp: ElectronApplication, rendererUrl: string) {
  const page = await electronApp.firstWindow();

  await page.waitForURL((url) => url.href.startsWith(rendererUrl), { timeout: 90_000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
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
    { timeout: 90_000 },
  );

  return page;
}

async function createClickSoundFixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'rough-cut-click-sound-'));
  const recordingPath = join(tempRoot, 'recording.mp4');
  const cursorEventsPath = join(tempRoot, 'recording.cursor.ndjson');
  const exportWithClickSoundsPath = join(tempRoot, 'with-click-sounds.mp4');
  const exportWithoutClickSoundsPath = join(tempRoot, 'without-click-sounds.mp4');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=640x360:r=30:d=2',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-an',
      recordingPath,
    ],
    { stdio: 'ignore' },
  );

  await writeFile(
    cursorEventsPath,
    [
      JSON.stringify({ frame: 0, x: 120, y: 120, type: 'move', button: 0 }),
      JSON.stringify({ frame: 30, x: 140, y: 140, type: 'down', button: 0 }),
      JSON.stringify({ frame: 36, x: 140, y: 140, type: 'up', button: 0 }),
    ].join('\n') + '\n',
    'utf-8',
  );

  const project = createProject({ name: 'Click Sound E2E Fixture' });
  const videoTrack = project.composition.tracks.find((track) => track.type === 'video');
  if (!videoTrack) throw new Error('expected a video track in default project');

  const presentation = createDefaultRecordingPresentation();
  const asset = createAsset('recording', recordingPath, {
    duration: 60,
    metadata: {
      width: 640,
      height: 360,
      cursorEventsPath,
      cursorEventsFps: 60,
    },
    presentation: {
      ...presentation,
      cursor: {
        ...presentation.cursor,
        clickSoundEnabled: false,
      },
      camera: {
        ...presentation.camera,
        visible: false,
      },
    },
  });
  const clip = createClip(asset.id, videoTrack.id, {
    timelineIn: 0,
    timelineOut: 60,
    sourceIn: 0,
    sourceOut: 60,
  });

  return {
    tempRoot,
    assetId: asset.id,
    exportWithClickSoundsPath,
    exportWithoutClickSoundsPath,
    project: {
      ...project,
      assets: [asset],
      composition: {
        ...project.composition,
        duration: 60,
        tracks: project.composition.tracks.map((track) => {
          if (track.id === videoTrack.id) {
            return { ...track, clips: [clip] };
          }
          return { ...track, clips: [] };
        }),
      },
    },
  };
}

function exportHasAudio(filePath: string): boolean {
  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', filePath], {
      encoding: 'utf-8',
    }),
  ) as { streams?: Array<{ codec_type?: string }> };

  return probe.streams?.some((stream) => stream.codec_type === 'audio') ?? false;
}

async function resetClickSoundCounter(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __roughcutClickSoundStarts?: number }).__roughcutClickSoundStarts = 0;
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    stores?.transport.getState().seekToFrame(0);
  });
}

async function getClickSoundCounter(page: Page) {
  return page.evaluate(() => {
    return (window as unknown as { __roughcutClickSoundStarts?: number })
      .__roughcutClickSoundStarts ?? 0;
  });
}

async function playRecordPreview(page: Page) {
  await page.getByTitle('Play (Space)').click();
  await page.waitForTimeout(1200);
  await page.getByTitle('Pause (Space)').click().catch(() => {});
}

test.describe('click sound flow', () => {
  test('Record preview and Export keep/disable click sounds stay truthful', async () => {
    test.setTimeout(240_000);

    const fixture = await createClickSoundFixture();
    const { rendererUrl, viteProcess } = await startRendererServer();
    const electronApp = await electron.launch({
      args: ['--no-sandbox', 'apps/desktop'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ROUGH_CUT_RENDERER_URL: rendererUrl,
      },
    });

    try {
      const appPage = await getAppPage(electronApp, rendererUrl);
      await appPage.evaluate(({ project, assetId }) => {
        const testWindow = window as unknown as {
          __roughcutStores?: any;
          __roughcutClickSoundStarts?: number;
          AudioContext?: new () => AudioContext;
        };

        class FakeBufferSource {
          buffer: unknown;

          connect() {
            return this;
          }

          start() {
            testWindow.__roughcutClickSoundStarts =
              (testWindow.__roughcutClickSoundStarts ?? 0) + 1;
          }
        }

        class FakeGain {
          gain = {
            setValueAtTime() {},
          };

          connect() {}
        }

        class FakeAudioContext {
          destination = {} as AudioDestinationNode;
          currentTime = 0;
          state: AudioContextState = 'running';

          async decodeAudioData() {
            return {} as AudioBuffer;
          }

          createBufferSource() {
            return new FakeBufferSource() as unknown as AudioBufferSourceNode;
          }

          createGain() {
            return new FakeGain() as unknown as GainNode;
          }

          async resume() {}

          async close() {}
        }

        testWindow.__roughcutClickSoundStarts = 0;
        testWindow.AudioContext = FakeAudioContext as unknown as typeof AudioContext;

        const stores = testWindow.__roughcutStores;
        stores?.project.getState().setProject(project);
        stores?.project.getState().setProjectFilePath(null);
        stores?.project.getState().setActiveAssetId(assetId);
        stores?.transport.getState().seekToFrame(0);
      }, fixture);

      await navigateToTab(appPage, 'record');
      await appPage.waitForFunction(() => {
        return (
          document.querySelector('[data-testid="recording-playback-video"]')?.getAttribute('data-ready') ===
          'true'
        );
      });
      await appPage.waitForTimeout(300);

      await appPage
        .locator('[data-testid="inspector-rail-item"][data-category="cursor"]')
        .click({ force: true });
      const clickSoundToggle = appPage.getByRole('button', { name: /click sound/i });
      await expect(clickSoundToggle).toContainText('Off');

      await resetClickSoundCounter(appPage);
      await playRecordPreview(appPage);
      expect(await getClickSoundCounter(appPage)).toBe(0);

      await clickSoundToggle.click();
      await expect(clickSoundToggle).toContainText('On');

      await resetClickSoundCounter(appPage);
      await playRecordPreview(appPage);
      expect(await getClickSoundCounter(appPage)).toBeGreaterThan(0);

      await navigateToTab(appPage, 'export');
      const exportClickSoundToggle = appPage.locator('[data-testid="export-keep-click-sounds-toggle"]');
      await expect(exportClickSoundToggle).toContainText('On');

      await appPage.evaluate((exportPath) => {
        (window as unknown as { __roughcutTestOverrides?: { exportOutputPath?: string } })
          .__roughcutTestOverrides = { exportOutputPath: exportPath };
      }, fixture.exportWithClickSoundsPath);
      await appPage.locator('[data-testid="btn-export"]').click();

      await expect
        .poll(() =>
          existsSync(fixture.exportWithClickSoundsPath)
            ? statSync(fixture.exportWithClickSoundsPath).size
            : 0,
        )
        .toBeGreaterThan(1024);
      expect(exportHasAudio(fixture.exportWithClickSoundsPath)).toBe(true);

      await exportClickSoundToggle.click();
      await expect(exportClickSoundToggle).toContainText('Off');

      await appPage.evaluate((exportPath) => {
        (window as unknown as { __roughcutTestOverrides?: { exportOutputPath?: string } })
          .__roughcutTestOverrides = { exportOutputPath: exportPath };
      }, fixture.exportWithoutClickSoundsPath);
      await appPage.locator('[data-testid="btn-export"]').click();

      await expect
        .poll(() =>
          existsSync(fixture.exportWithoutClickSoundsPath)
            ? statSync(fixture.exportWithoutClickSoundsPath).size
            : 0,
        )
        .toBeGreaterThan(1024);
      expect(exportHasAudio(fixture.exportWithoutClickSoundsPath)).toBe(false);
    } finally {
      await electronApp.close();
      await stopRendererServer(viteProcess);
      await rm(fixture.tempRoot, { recursive: true, force: true });
    }
  });
});
