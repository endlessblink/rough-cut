import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PIXELS_PER_FRAME,
  SNAP_PX,
  contentWidthPx,
  fitPixelsPerFrame,
  frameAtClientX,
  frameToContentX,
  resolvePixelsPerFrame,
  scrollLeftForAnchor,
  scrollLeftForPlayheadFollow,
  snapThresholdFrames,
  stepScrollLeftTowardTarget,
  zoomStep,
} from './timeline-viewport.mjs';

test('fitPixelsPerFrame divides view width across the timeline', () => {
  assert.equal(fitPixelsPerFrame(900, 9000), 0.1);
  assert.equal(fitPixelsPerFrame(0, 9000), 0);
  assert.equal(fitPixelsPerFrame(900, 0), 0);
});

test('resolvePixelsPerFrame: null means fit; values clamp to [fit, MAX]', () => {
  assert.equal(resolvePixelsPerFrame(null, 900, 9000), 0.1);
  assert.equal(resolvePixelsPerFrame(undefined, 900, 9000), 0.1);
  assert.equal(resolvePixelsPerFrame(0.05, 900, 9000), 0.1, 'below fit clamps to fit');
  assert.equal(resolvePixelsPerFrame(2, 900, 9000), 2);
  assert.equal(resolvePixelsPerFrame(99, 900, 9000), MAX_PIXELS_PER_FRAME);
});

test('frame↔x round-trips exactly across zoom levels and scroll offsets', () => {
  for (const ppf of [0.1, 0.5, 1, 2, MAX_PIXELS_PER_FRAME]) {
    for (const scroll of [0, 137.5, 4096]) {
      const contentRectLeft = 50 - scroll; // container at 50px, scrolled
      for (const frame of [0, 1, 299, 4500, 9000]) {
        const clientX = contentRectLeft + frameToContentX(frame, ppf);
        assert.equal(
          frameAtClientX(clientX, contentRectLeft, ppf, 9000),
          frame,
          `ppf=${ppf} scroll=${scroll} frame=${frame}`,
        );
      }
    }
  }
});

test('frameAtClientX clamps to [0, durationFrames]', () => {
  assert.equal(frameAtClientX(-500, 0, 1, 9000), 0);
  assert.equal(frameAtClientX(99999, 0, 1, 9000), 9000);
  assert.equal(frameAtClientX(100, 0, 0, 9000), 0, 'zero ppf is safe');
});

test('snap threshold is a constant screen distance, not duration-scaled', () => {
  // At fit on the reproduced 5-min case (587px / 9000 frames) the OLD model
  // reached ±92 frames; the new model stays at SNAP_PX worth of frames.
  const fitPpf = fitPixelsPerFrame(587.84375, 9000);
  const atFit = snapThresholdFrames(fitPpf);
  assert.ok(atFit < 125, `fit threshold ${atFit} stays bounded by SNAP_PX`);
  assert.equal(snapThresholdFrames(1), SNAP_PX);
  assert.equal(snapThresholdFrames(2), SNAP_PX / 2);
  // Pixel reach is identical at every zoom level.
  assert.equal(snapThresholdFrames(0.5) * 0.5, SNAP_PX);
  assert.equal(snapThresholdFrames(4) * 4, SNAP_PX);
});

test('contentWidthPx grows with zoom', () => {
  assert.equal(contentWidthPx(9000, 0.1), 900);
  assert.equal(contentWidthPx(9000, 2), 18000);
  assert.equal(contentWidthPx(0, 2), 0);
});

test('zoomStep zooms in by the step factor and clamps at MAX', () => {
  assert.equal(zoomStep(1, 1, 900, 9000), 1.5);
  assert.equal(zoomStep(3.9, 1, 900, 9000), MAX_PIXELS_PER_FRAME);
});

test('zoomStep returns null (fit) when stepping out to or below fit', () => {
  assert.equal(zoomStep(0.12, -1, 900, 9000), null, 'lands below fit → fit');
  assert.equal(zoomStep(null, -1, 900, 9000), null, 'already at fit stays fit');
  const stepOut = zoomStep(0.3, -1, 900, 9000);
  assert.ok(Math.abs(stepOut - 0.2) < 1e-9, `stays explicit while above fit (got ${stepOut})`);
});

test('scrollLeftForAnchor keeps the anchor frame under the pointer', () => {
  // Anchor frame 4500 at ppf 0.2 sits at 900px content-x; pointer at 300px
  // from container left → scrollLeft 600 keeps it under the pointer.
  assert.equal(scrollLeftForAnchor(4500, 0.2, 300), 600);
  assert.equal(scrollLeftForAnchor(10, 0.1, 300), 0, 'never negative');
});

test('scrollLeftForPlayheadFollow does nothing while the playhead is in the follow zone', () => {
  assert.equal(scrollLeftForPlayheadFollow(500, 100, 800, 2400), 100);
});

test('scrollLeftForPlayheadFollow scrolls right when the playhead exits the trailing zone', () => {
  assert.equal(scrollLeftForPlayheadFollow(900, 100, 800, 2400), 380);
});

test('scrollLeftForPlayheadFollow scrolls left when the playhead exits the leading zone', () => {
  assert.equal(scrollLeftForPlayheadFollow(250, 100, 800, 2400), 0);
});

test('scrollLeftForPlayheadFollow clamps at the timeline ends', () => {
  assert.equal(scrollLeftForPlayheadFollow(10, 300, 800, 2400), 0);
  assert.equal(scrollLeftForPlayheadFollow(3000, 300, 800, 2400), 1600);
});

test('scrollLeftForPlayheadFollow resets to start when content fits the viewport', () => {
  assert.equal(scrollLeftForPlayheadFollow(500, 100, 800, 700), 0);
});

test('stepScrollLeftTowardTarget eases toward the target without overshooting', () => {
  const first = stepScrollLeftTowardTarget(0, 300, { viewWidthPx: 800 });
  const second = stepScrollLeftTowardTarget(first, 300, { viewWidthPx: 800 });
  assert.ok(first > 0 && first < 300, `first step ${first} moves partially`);
  assert.ok(second > first && second < 300, `second step ${second} keeps moving toward target`);
});

test('stepScrollLeftTowardTarget moves monotonically left toward smaller targets', () => {
  const first = stepScrollLeftTowardTarget(300, 40, { viewWidthPx: 800 });
  const second = stepScrollLeftTowardTarget(first, 40, { viewWidthPx: 800 });
  assert.ok(first < 300 && first > 40, `first step ${first} moves left without overshoot`);
  assert.ok(second < first && second > 40, `second step ${second} keeps moving left`);
});

test('stepScrollLeftTowardTarget snaps on large discontinuities', () => {
  assert.equal(stepScrollLeftTowardTarget(0, 1200, { viewWidthPx: 800 }), 1200);
  assert.equal(stepScrollLeftTowardTarget(1400, 0, { snapDistancePx: 1000 }), 0);
});

test('stepScrollLeftTowardTarget settles at the target for tiny deltas', () => {
  assert.equal(stepScrollLeftTowardTarget(99.75, 100, { settlePx: 0.5 }), 100);
});
