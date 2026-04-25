import { test, expect } from './fixtures/electron-app.js';
import { loadZoomFixture } from './fixtures/zoom-fixture.js';

test.describe('Cursor sub-frame interpolation', () => {
  test('moves within held frames during sequential playback and forward jumps', async ({ appPage }) => {
    test.setTimeout(90_000);

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
      const transportStore = stores?.transport;
      const recording = projectState?.project.assets.find(
        (asset: any) => asset.type === 'recording' && asset.metadata?.isCamera !== true,
      );
      const clip = projectState?.project.composition.tracks
        .flatMap((track: any) => track.clips)
        .find((entry: any) => entry.assetId === recording?.id);
      if (!recording?.id || !clip || !transportStore) {
        return { found: false as const, reason: 'missing recording, clip, or transport store' };
      }

      const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      const sampleCursor = () => {
        const canvas = document.querySelector('canvas[data-source-frame]') as HTMLCanvasElement | null;
        if (!canvas || canvas.dataset.cursorVisible !== 'true') return null;
        return {
          frame: Number(canvas.dataset.projectFrame ?? '-1'),
          x: Number(canvas.dataset.cursorX ?? 'NaN'),
          y: Number(canvas.dataset.cursorY ?? 'NaN'),
        };
      };

      const startFrame = Math.max(0, clip.timelineIn ?? 0);
      const endFrame = Math.max(startFrame + 1, clip.timelineOut ?? startFrame + 1);
      const visibleSamples: Array<{ frame: number; x: number; y: number }> = [];

      for (let frame = startFrame; frame < endFrame; frame += 1) {
        transportStore.setState({ playheadFrame: frame, isPlaying: false });
        await sleep(8);
        const sample = sampleCursor();
        if (sample && Number.isFinite(sample.x) && Number.isFinite(sample.y)) {
          visibleSamples.push(sample);
        }
      }

      for (let i = 1; i < visibleSamples.length - 1; i += 1) {
        const prev = visibleSamples[i - 1]!;
        const curr = visibleSamples[i]!;
        if (curr.frame !== prev.frame + 1) continue;

        const delta = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        if (delta < 0.03) continue;

        const jumpIndex = visibleSamples.findIndex((candidate, index) => {
          if (index <= i || candidate.frame < curr.frame + 3) return false;
          const previous = visibleSamples[index - 1];
          if (!previous || candidate.frame !== previous.frame + 1) return false;
          return Math.hypot(candidate.x - previous.x, candidate.y - previous.y) >= 0.03;
        });
        if (jumpIndex < 0) continue;
        const jump = visibleSamples[jumpIndex]!;

        return {
          found: true as const,
          prevProjectFrame: prev.frame,
          currProjectFrame: curr.frame,
          jumpProjectFrame: jump.frame,
          prevNorm: { x: prev.x, y: prev.y },
          currNorm: { x: curr.x, y: curr.y },
          jumpNorm: { x: jump.x, y: jump.y },
          movementPx: delta,
        };
      }

      return {
        found: false as const,
        reason: `no visible fast sequential cursor pair found across ${visibleSamples.length} sampled frames`,
      };
    });

    expect(target.found, target.found ? undefined : target.reason).toBe(true);
    if (!target.found) return;
    const samples = await appPage.evaluate(async (frames) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      const transportStore = stores?.transport;

      const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

      const sampleCursor = () => {
        const canvas = document.querySelector('canvas[data-source-frame]') as HTMLCanvasElement | null;
        if (!canvas) {
          return { found: false as const, reason: 'cursor canvas missing' };
        }
        if (canvas.dataset.cursorVisible !== 'true') {
          return {
            found: false as const,
            reason: 'cursor canvas reports hidden cursor',
            playheadFrame: Number(canvas.dataset.projectFrame ?? '-1'),
            sourceFrame: Number(canvas.dataset.sourceFrame ?? '-1'),
            interpolating: canvas.dataset.interpolating === 'true',
            interpolationT: Number(canvas.dataset.interpolationT ?? '0'),
          };
        }

        return {
          found: true as const,
          x: Number(canvas.dataset.cursorX ?? 'NaN'),
          y: Number(canvas.dataset.cursorY ?? 'NaN'),
          playheadFrame: Number(canvas.dataset.projectFrame ?? '-1'),
          sourceFrame: Number(canvas.dataset.sourceFrame ?? '-1'),
          interpolating: canvas.dataset.interpolating === 'true',
          interpolationT: Number(canvas.dataset.interpolationT ?? '0'),
        };
      };

      const waitForCursor = async () => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const sample = sampleCursor();
          if (sample.found) return sample;
          await sleep(16);
        }
        return sampleCursor();
      };

      transportStore?.setState({ playheadFrame: frames.prevProjectFrame, isPlaying: false });
      await sleep(48);
      const pausedPrev = await waitForCursor();

      transportStore?.setState({ playheadFrame: frames.prevProjectFrame, isPlaying: true });
      await sleep(16);
      transportStore?.setState({ playheadFrame: frames.currProjectFrame });
      await sleep(16);
      await sleep(6);
      const sequentialEarly = await waitForCursor();
      await sleep(10);
      const sequentialLate = await waitForCursor();

      transportStore?.setState({ playheadFrame: frames.jumpProjectFrame });
      await sleep(16);
      await sleep(6);
      const jumpedEarly = await waitForCursor();
      await sleep(10);
      const jumpedLate = await waitForCursor();

      transportStore?.setState({ isPlaying: false });

      return { pausedPrev, sequentialEarly, sequentialLate, jumpedEarly, jumpedLate };
    }, target);

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

    expect(dist(samples.pausedPrev, target.prevNorm)).toBeLessThan(0.03);
    expect(sequentialMotion).toBeGreaterThan(0.005);
    expect(jumpMotion).toBeGreaterThan(0.005);
    expect(samples.sequentialEarly.interpolating).toBe(true);
    expect(samples.jumpedEarly.interpolating).toBe(true);
    expect(earlyToPrev).toBeLessThan(lateToPrev);
    expect(lateToCurr).toBeLessThan(earlyToCurr);
    expect(dist(samples.jumpedLate, target.jumpNorm)).toBeLessThan(0.03);
  });
});
