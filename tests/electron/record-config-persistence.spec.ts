import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type RecordingConfigSnapshot = {
  hydrated: boolean;
  recordMode: string;
  micEnabled: boolean;
  sysAudioEnabled: boolean;
  cameraEnabled: boolean;
  countdownSeconds: number;
};

async function launchApp(configRoot: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['--no-sandbox', 'apps/desktop'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configRoot,
    },
  });
}

async function waitForAppPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForURL(/127\.0\.0\.1:7544/, { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      if (!root || root.childElementCount === 0) return false;
      return Boolean(document.querySelector('[data-testid="app-header"]'));
    },
    { timeout: 30_000 },
  );
  return page;
}

async function navigateToRecordTab(page: Page) {
  const tabRoot = page.locator('[data-testid="record-tab-root"]');
  if (await tabRoot.isVisible().catch(() => false)) return;
  await page.click('[data-testid="tab-record"]');
  await page.waitForSelector('[data-testid="record-tab-root"]', { timeout: 30_000 });
}

async function readRecordingConfigStore(page: Page): Promise<RecordingConfigSnapshot | null> {
  return page.evaluate(() => {
    const stores = (
      window as unknown as {
        __roughcutStores?: {
          recordingConfig?: {
            getState: () => RecordingConfigSnapshot;
          };
        };
      }
    ).__roughcutStores;
    return stores?.recordingConfig?.getState() ?? null;
  });
}

test('record config survives app restart', async () => {
  const configRoot = await mkdtemp(join(tmpdir(), 'rough-cut-record-config-'));

  try {
    const firstApp = await launchApp(configRoot);
    const firstPage = await waitForAppPage(firstApp);
    await navigateToRecordTab(firstPage);

    await firstPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({
        recordMode: 'window',
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
        countdownSeconds: 10,
      });
    });

    await expect
      .poll(async () => readRecordingConfigStore(firstPage))
      .toMatchObject({
        hydrated: true,
        recordMode: 'window',
        micEnabled: false,
        sysAudioEnabled: false,
        cameraEnabled: false,
        countdownSeconds: 10,
      });

    await firstApp.close();

    const secondApp = await launchApp(configRoot);
    try {
      const secondPage = await waitForAppPage(secondApp);
      await navigateToRecordTab(secondPage);

      await expect
        .poll(async () => readRecordingConfigStore(secondPage))
        .toMatchObject({
          hydrated: true,
          recordMode: 'window',
          micEnabled: false,
          sysAudioEnabled: false,
          cameraEnabled: false,
          countdownSeconds: 10,
        });
    } finally {
      await secondApp.close();
    }
  } finally {
    await rm(configRoot, { recursive: true, force: true });
  }
});

test('unsupported region mode is normalized to fullscreen and stays normalized after restart', async () => {
  const configRoot = await mkdtemp(join(tmpdir(), 'rough-cut-record-config-region-'));

  try {
    const firstApp = await launchApp(configRoot);
    const firstPage = await waitForAppPage(firstApp);
    await navigateToRecordTab(firstPage);

    await firstPage.evaluate(async () => {
      await (
        window as unknown as {
          roughcut: { recordingConfigUpdate: (patch: Record<string, unknown>) => Promise<unknown> };
        }
      ).roughcut.recordingConfigUpdate({ recordMode: 'region' });
    });

    await expect
      .poll(async () => readRecordingConfigStore(firstPage))
      .toMatchObject({ hydrated: true, recordMode: 'fullscreen' });

    await firstApp.close();

    const secondApp = await launchApp(configRoot);
    try {
      const secondPage = await waitForAppPage(secondApp);
      await navigateToRecordTab(secondPage);

      await expect
        .poll(async () => readRecordingConfigStore(secondPage))
        .toMatchObject({ hydrated: true, recordMode: 'fullscreen' });
    } finally {
      await secondApp.close();
    }
  } finally {
    await rm(configRoot, { recursive: true, force: true });
  }
});
