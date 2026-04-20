import { test, expect } from './fixtures/electron-app.js';
import { loadPlaybackFixture } from './fixtures/playback-fixture.js';

test('record playback stays monotonic during first second after space resume', async ({ appPage }) => {
  test.setTimeout(45_000);

  await loadPlaybackFixture(appPage, 'record');

  const timeline = appPage.locator('[data-testid="record-timeline"]').first();
  const playButton = appPage
    .locator('[data-testid="record-timeline"] button[title*="Play"], [data-testid="record-timeline"] button[title*="Pause"]')
    .last();
  await timeline.click();

  await playButton.click();
  await appPage.waitForTimeout(700);
  await playButton.click();

  await expect
    .poll(
      async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return stores?.transport.getState().isPlaying ?? true;
        }),
      { timeout: 5_000 },
    )
    .toBe(false);

  const pausedFrame = await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.transport.getState().playheadFrame ?? -1;
  });

  await playButton.click();

  await expect
    .poll(
      async () =>
        appPage.evaluate(() => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          return stores?.transport.getState().isPlaying ?? false;
        }),
      { timeout: 5_000 },
    )
    .toBe(true);

  const samples = await sampleRecordPlayback(appPage, 1_200, 80);
  expect(samples[0]?.playheadFrame ?? -1).toBeGreaterThanOrEqual(pausedFrame - 1);
  expect(samples.at(-1)?.playheadFrame ?? -1).toBeGreaterThan(pausedFrame);
  expect(countBackwardSteps(samples.map((sample) => sample.playheadFrame), 1)).toBe(0);
  expect(countDistinct(samples.map((sample) => sample.canvasHash), 1)).toBeGreaterThanOrEqual(3);
});

async function sampleRecordPlayback(
  page: import('@playwright/test').Page,
  durationMs: number,
  intervalMs: number,
): Promise<Array<{ playheadFrame: number; canvasHash: number }>> {
  const canvas = page.locator('[data-testid="recording-playback-canvas"]').first();
  const samples: Array<{ playheadFrame: number; canvasHash: number }> = [];
  const startedAt = Date.now();

  while (Date.now() - startedAt < durationMs) {
    const [playheadFrame, screenshot] = await Promise.all([
      page.evaluate(() => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        return stores?.transport.getState().playheadFrame ?? -1;
      }),
      canvas.screenshot({ timeout: 5_000 }),
    ]);

    samples.push({ playheadFrame, canvasHash: hashBytes(screenshot) });
    await page.waitForTimeout(intervalMs);
  }

  return samples;
}

function countBackwardSteps(values: number[], tolerance: number): number {
  let count = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1] - tolerance) count += 1;
  }
  return count;
}

function countDistinct(values: Array<number | null>, tolerance: number): number {
  const distinct: number[] = [];
  for (const value of values) {
    if (value == null) continue;
    if (!distinct.some((candidate) => Math.abs(candidate - value) <= tolerance)) {
      distinct.push(value);
    }
  }
  return distinct.length;
}

function hashBytes(buffer: Buffer): number {
  let hash = 0;
  for (const value of buffer.values()) {
    hash = (hash * 33 + value) % 2147483647;
  }
  return hash;
}
