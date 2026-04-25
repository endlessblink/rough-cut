import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

test.describe('Cursor sub-frame interpolation', () => {
  test('moves within a held sequential frame but stays stable after a jump', async ({ appPage }) => {
    test.setTimeout(90_000);

    await appPage.waitForSelector('[data-testid="tab-record"]', { timeout: 60_000 });
    await navigateToTab(appPage, 'record');
    await loadZoomFixture(appPage, { preserveCursorEvents: true });

    await appPage.waitForFunction(
      () =>
        document.querySelector('[data-testid="recording-playback-video"]')?.getAttribute('data-ready') ===
        'true',
      null,
      { timeout: 15_000 },
    );

    const target = await appPage.evaluate(async () => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const projectState = stores?.project.getState();
      const recording = projectState?.project.assets.find(
        (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
      );
      const clip = projectState?.project.composition.tracks
        .flatMap((track: any) => track.clips)
        .find((entry: any) => entry.assetId === recording?.id);
      const cursorEventsPath = recording?.metadata?.cursorEventsPath as string | null;
      if (!recording?.id || !clip || !cursorEventsPath) {
        return { found: false as const, reason: 'missing recording, clip, or cursor sidecar' };
      }

      const content = await (window as unknown as any).roughcut.readTextFile(cursorEventsPath);
      const events = String(content)
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { frame: number; x: number; y: number })
        .filter((event) => Number.isFinite(event.frame) && Number.isFinite(event.x) && Number.isFinite(event.y));

      const sourceWidth = Number(recording?.metadata?.width) || 1920;
      const sourceHeight = Number(recording?.metadata?.height) || 1080;
      const inBounds = events.filter(
        (event) =>
          event.x >= 0 && event.y >= 0 && event.x <= sourceWidth && event.y <= sourceHeight && event.frame >= 2,
      );

      let best:
        | {
            prev: { frame: number; nx: number; ny: number };
            curr: { frame: number; nx: number; ny: number };
            jump: { frame: number; nx: number; ny: number };
            delta: number;
          }
        | null = null;

      for (let i = 1; i < inBounds.length - 1; i += 1) {
        const prev = inBounds[i - 1]!;
        const curr = inBounds[i]!;
        if (curr.frame !== prev.frame + 1) continue;

        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const delta = Math.hypot(dx, dy);
        if (delta < 80) continue;

        const jump = inBounds.slice(i + 1).find((candidate) => candidate.frame >= curr.frame + 3);
        if (!jump) continue;

        best = {
          prev: { frame: prev.frame, nx: prev.x / sourceWidth, ny: prev.y / sourceHeight },
          curr: { frame: curr.frame, nx: curr.x / sourceWidth, ny: curr.y / sourceHeight },
          jump: { frame: jump.frame, nx: jump.x / sourceWidth, ny: jump.y / sourceHeight },
          delta,
        };
      }

      if (!best) {
        return { found: false as const, reason: 'no fast sequential cursor motion found in fixture' };
      }

      const toProjectFrame = (sourceFrame: number) =>
        Math.max(0, (clip.timelineIn ?? 0) + sourceFrame - (clip.sourceIn ?? 0));

      return {
        found: true as const,
        prevProjectFrame: toProjectFrame(best.prev.frame),
        currProjectFrame: toProjectFrame(best.curr.frame),
        jumpProjectFrame: toProjectFrame(best.jump.frame),
        prevNorm: { x: best.prev.nx, y: best.prev.ny },
        currNorm: { x: best.curr.nx, y: best.curr.ny },
        jumpNorm: { x: best.jump.nx, y: best.jump.ny },
        movementPx: best.delta,
      };
    });

    expect(target.found, target.found ? undefined : target.reason).toBe(true);
    if (!target.found) return;
    const samples = await appPage.evaluate(async (frames) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const transportStore = stores?.transport;

      const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

      const sampleCursor = (expectedPositions: Array<{ x: number; y: number }>) => {
        const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
        let best:
          | {
              x: number;
              y: number;
              pixels: number;
              playheadFrame: number;
            }
          | null = null;
        let bestCount = 0;

        for (const canvas of canvases) {
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          const width = canvas.width;
          const height = canvas.height;
          if (width <= 0 || height <= 0) continue;

          const expectedXs = expectedPositions.map((position) => Math.round(position.x * width));
          const expectedYs = expectedPositions.map((position) => Math.round(position.y * height));
          const minX = Math.max(0, Math.min(...expectedXs) - 160);
          const maxX = Math.min(width, Math.max(...expectedXs) + 160);
          const minY = Math.max(0, Math.min(...expectedYs) - 160);
          const maxY = Math.min(height, Math.max(...expectedYs) + 160);
          const sampleWidth = Math.max(1, maxX - minX);
          const sampleHeight = Math.max(1, maxY - minY);

          const pixels = ctx.getImageData(minX, minY, sampleWidth, sampleHeight).data;
          let count = 0;
          let sumX = 0;
          let sumY = 0;
          for (let y = 0; y < sampleHeight; y += 1) {
            for (let x = 0; x < sampleWidth; x += 1) {
              const alpha = pixels[(y * sampleWidth + x) * 4 + 3];
              if (alpha > 0) {
                sumX += minX + x;
                sumY += minY + y;
                count += 1;
              }
            }
          }

          if (count > bestCount) {
            bestCount = count;
            best = {
              x: sumX / count / width,
              y: sumY / count / height,
              pixels: count,
              playheadFrame: transportStore?.getState().playheadFrame ?? -1,
            };
          }
        }

        if (!best) {
          return { found: false as const, reason: 'no non-empty 2d canvas near expected cursor window' };
        }

        return {
          found: true as const,
          x: best.x,
          y: best.y,
          pixels: best.pixels,
          playheadFrame: best.playheadFrame,
        };
      };

      const waitForCursor = async (expectedPositions: Array<{ x: number; y: number }>) => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const sample = sampleCursor(expectedPositions);
          if (sample.found) return sample;
          await sleep(16);
        }
        return sampleCursor(expectedPositions);
      };

      transportStore?.setState({ playheadFrame: frames.prevProjectFrame, isPlaying: false });
      await sleep(48);
      const pausedPrev = await waitForCursor([frames.prevNorm]);

      transportStore?.setState({ playheadFrame: frames.prevProjectFrame, isPlaying: true });
      await sleep(16);
      transportStore?.setState({ playheadFrame: frames.currProjectFrame });
      await sleep(16);
      await sleep(6);
      const sequentialEarly = await waitForCursor([frames.prevNorm, frames.currNorm]);
      await sleep(26);
      const sequentialLate = await waitForCursor([frames.prevNorm, frames.currNorm]);

      transportStore?.setState({ playheadFrame: frames.jumpProjectFrame });
      await sleep(16);
      await sleep(6);
      const jumpedEarly = await waitForCursor([frames.jumpNorm]);
      await sleep(26);
      const jumpedLate = await waitForCursor([frames.jumpNorm]);

      transportStore?.setState({ isPlaying: false });

      return { pausedPrev, sequentialEarly, sequentialLate, jumpedEarly, jumpedLate };
    }, target);
    console.log('cursor-subframe samples', JSON.stringify(samples));

    expect(samples.pausedPrev.found).toBe(true);
    expect(samples.sequentialEarly.found).toBe(true);
    expect(samples.sequentialLate.found).toBe(true);
    expect(samples.jumpedEarly.found).toBe(true);
    expect(samples.jumpedLate.found).toBe(true);

    if (
      !samples.pausedPrev.found ||
      !samples.sequentialEarly.found ||
      !samples.sequentialLate.found ||
      !samples.jumpedEarly.found ||
      !samples.jumpedLate.found
    ) {
      return;
    }

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const sequentialMotion = dist(samples.sequentialEarly, samples.sequentialLate);
    const jumpMotion = dist(samples.jumpedEarly, samples.jumpedLate);
    const earlyToPrev = dist(samples.sequentialEarly, target.prevNorm);
    const lateToPrev = dist(samples.sequentialLate, target.prevNorm);
    const earlyToCurr = dist(samples.sequentialEarly, target.currNorm);
    const lateToCurr = dist(samples.sequentialLate, target.currNorm);

    expect(samples.pausedPrev.playheadFrame).toBe(target.prevProjectFrame);
    expect(samples.sequentialEarly.playheadFrame).toBe(target.currProjectFrame);
    expect(samples.sequentialLate.playheadFrame).toBe(target.currProjectFrame);
    expect(samples.jumpedEarly.playheadFrame).toBe(target.jumpProjectFrame);
    expect(samples.jumpedLate.playheadFrame).toBe(target.jumpProjectFrame);

    expect(sequentialMotion).toBeGreaterThan(0.005);
    expect(jumpMotion).toBeLessThan(0.003);
    expect(earlyToPrev).toBeLessThan(lateToPrev);
    expect(lateToCurr).toBeLessThan(earlyToCurr);
    expect(dist(samples.jumpedLate, target.jumpNorm)).toBeLessThan(0.03);
  });
});
