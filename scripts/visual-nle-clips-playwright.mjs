// Phase 0 reproduction harness for NLE Editor clip interactions.
// Seeds a multi-minute recording project, opens the NLE "Editor" tab, and
// exercises the real clip gestures (select / split / trim / drag / jitter /
// pointercancel) against .nleClipBlock DOM. Reports measurements + screenshots
// so clip-interaction bugs are OBSERVED, not inferred. Reproduction-first:
// this script documents current behavior; assertions are reported, not thrown,
// unless the harness itself cannot run.
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const DURATION_SECONDS = Number(process.env.ROUGH_CUT_NLE_REPRO_SECONDS || 300);
const FPS = 30;

const root = await mkdtemp(join(tmpdir(), 'rough-cut-nle-clips-'));
const mediaPath = join(root, 'nle-clips-source.mp4');
const reportPath = join(root, 'nle-clips-report.json');
const shots = {
  editorOpen: join(root, '01-editor-open.png'),
  afterSplit: join(root, '02-after-split.png'),
  afterTrim: join(root, '03-after-trim.png'),
  afterClick: join(root, '04-after-click-select.png'),
  afterJitter: join(root, '05-after-jitter-click.png'),
  afterDrag: join(root, '06-after-drag.png'),
  afterCancel: join(root, '07-after-pointercancel.png'),
  afterZoom: join(root, '08-after-zoom.png'),
  afterFit: join(root, '09-after-fit.png'),
  afterBlade: join(root, '10-after-blade.png'),
};

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y', '-f', 'lavfi', '-i',
  `testsrc2=size=960x540:rate=${FPS}`,
  '-t', String(DURATION_SECONDS),
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + DURATION_SECONDS * 1000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: FPS,
});

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: join(process.cwd(), 'apps/desktop/node_modules/.bin/electron'),
  args: ['--no-sandbox', '--force-color-profile=srgb', '.'],
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: project.path,
  },
});
const electronProcess = app.process();

let report = { ok: false, root, projectPath: project.path, durationSeconds: DURATION_SECONDS, fps: FPS, screenshots: shots };
let failure;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await dismissPreRecordOverlay(page);

  // Switch to the NLE "Editor" tab.
  await page.locator('nav.appViewTabStrip button.appViewTab', { hasText: 'Editor' }).click();
  await page.waitForSelector('.nleLaneBodies', { timeout: 10000 });
  await page.waitForSelector('.nleClipBlock', { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shots.editorOpen, fullPage: false });

  // --- Geometry/precision measurements (root cause 1 & 2) ---
  const bodies = await requiredBox(page.locator('.nleLaneBodies'), 'lane bodies');
  const durationFrames = DURATION_SECONDS * FPS;
  const pxPerFrame = bodies.width / durationFrames;
  const framesPerPx = durationFrames / bodies.width;
  const snapThresholdFrames = 6 * framesPerPx;

  // --- Split at middle: scrub via ruler, select clip, press S ---
  const ruler = await requiredBox(page.locator('.nleTimelineRuler'), 'ruler');
  await page.mouse.click(ruler.x + ruler.width * 0.5, ruler.y + ruler.height / 2);
  await page.waitForTimeout(200);
  const videoClip = page.locator('.nleTrackLaneBody[data-track-kind="video"] .nleClipBlock').first();
  await videoClip.click();
  await page.waitForTimeout(200);
  const clipCountBefore = await page.locator('.nleClipBlock').count();
  await page.keyboard.press('s');
  await page.waitForTimeout(300);
  const clipCountAfterSplit = await page.locator('.nleClipBlock').count();
  await page.screenshot({ path: shots.afterSplit, fullPage: false });
  const split = {
    clipCountBefore,
    clipCountAfterSplit,
    splitWorked: clipCountAfterSplit > clipCountBefore,
  };

  // Identify the right-hand video clip (post-split) for the rest of the tests.
  const videoClips = page.locator('.nleTrackLaneBody[data-track-kind="video"] .nleClipBlock');
  const rightClip = videoClips.nth((await videoClips.count()) - 1);

  // --- Trim: open a gap by dragging the right clip's LEFT handle rightward ---
  await rightClip.click();
  await page.waitForTimeout(200);
  const rightBefore = await requiredBox(rightClip, 'right clip before trim');
  const leftHandle = page.locator('.nleClipTrimHandle.left');
  const handleBox = await requiredBox(leftHandle, 'left trim handle');
  const trimTargetX = handleBox.x + handleBox.width / 2 + Math.max(40, bodies.width * 0.06);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(trimTargetX, handleBox.y + handleBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const rightAfterTrim = await requiredBox(rightClip, 'right clip after trim');
  await page.screenshot({ path: shots.afterTrim, fullPage: false });
  const trim = {
    requestedDeltaPx: trimTargetX - (handleBox.x + handleBox.width / 2),
    observedDeltaPx: rightAfterTrim.x - rightBefore.x,
    widthBeforePx: rightBefore.width,
    widthAfterPx: rightAfterTrim.width,
    trimWorked: rightAfterTrim.x > rightBefore.x + 5 && rightAfterTrim.width < rightBefore.width - 5,
  };

  // --- Phantom move A: pure click (no movement) should select, not move ---
  const stateBeforeClick = await selectedClipState(page, rightClip);
  await page.mouse.click(rightAfterTrim.x + rightAfterTrim.width * 0.5, rightAfterTrim.y + rightAfterTrim.height / 2);
  await page.waitForTimeout(250);
  const stateAfterClick = await selectedClipState(page, rightClip);
  await page.screenshot({ path: shots.afterClick, fullPage: false });
  const clickSelect = {
    inBefore: stateBeforeClick.inFrame,
    inAfter: stateAfterClick.inFrame,
    movedFrames: stateAfterClick.inFrame - stateBeforeClick.inFrame,
    selected: stateAfterClick.selected,
    cleanSelect: stateAfterClick.selected && stateAfterClick.inFrame === stateBeforeClick.inFrame,
  };

  // --- Phantom move B: 1-2px jitter between down and up (realistic click) ---
  const jitterStart = await requiredBox(rightClip, 'right clip before jitter');
  const jx = jitterStart.x + jitterStart.width * 0.5;
  const jy = jitterStart.y + jitterStart.height / 2;
  const jitterBefore = await selectedClipState(page, rightClip);
  // Jitter LEFT, toward the gap opened by the trim — a rightward jitter on the
  // tail clip gets clamped by the timeline end and would mask the bug.
  await page.mouse.move(jx, jy);
  await page.mouse.down();
  await page.mouse.move(jx - 2, jy + 1, { steps: 1 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const jitterAfter = await selectedClipState(page, rightClip);
  await page.screenshot({ path: shots.afterJitter, fullPage: false });
  const jitterClick = {
    inBefore: jitterBefore.inFrame,
    inAfter: jitterAfter.inFrame,
    movedFrames: jitterAfter.inFrame - jitterBefore.inFrame,
    framesPerPx,
    noPhantomMove: jitterAfter.inFrame === jitterBefore.inFrame,
  };

  // --- Deliberate drag: move right clip left by ~10% of lane width ---
  const dragStart = await requiredBox(rightClip, 'right clip before drag');
  const dragFromX = dragStart.x + dragStart.width * 0.5;
  const dragY = dragStart.y + dragStart.height / 2;
  const dragDeltaPx = -Math.max(40, bodies.width * 0.05);
  const dragBefore = await selectedClipState(page, rightClip);
  await page.mouse.move(dragFromX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragFromX + dragDeltaPx, dragY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const dragAfter = await selectedClipState(page, rightClip);
  await page.screenshot({ path: shots.afterDrag, fullPage: false });
  const expectedDragFrames = Math.round(dragDeltaPx * framesPerPx);
  const drag = {
    requestedDeltaPx: dragDeltaPx,
    expectedDeltaFrames: expectedDragFrames,
    observedDeltaFrames: dragAfter.inFrame - dragBefore.inFrame,
    errorFrames: (dragAfter.inFrame - dragBefore.inFrame) - expectedDragFrames,
    snapThresholdFrames,
    dragWorked: Math.abs(dragAfter.inFrame - dragBefore.inFrame) > 0,
  };

  // --- pointercancel mid-drag: does the UI get stuck in dragging state? ---
  const cancelStart = await requiredBox(rightClip, 'right clip before cancel test');
  const cx = cancelStart.x + cancelStart.width * 0.5;
  const cy = cancelStart.y + cancelStart.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy, { steps: 4 });
  await page.waitForTimeout(100);
  // Fire a real pointercancel at the element + window, as the browser would
  // on touch interruption / native DnD takeover. The current handlers only
  // listen for pointerup, so this is expected to strand the drag session.
  await page.evaluate(() => {
    const el = document.querySelector('.nleClipBlock.dragging') ?? document.querySelector('.nleClipBlock.selected');
    const ev = new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 });
    el?.dispatchEvent(ev);
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
  });
  await page.waitForTimeout(200);
  const stuckDraggingAfterCancel = await page.evaluate(() => document.querySelector('.nleClipBlock.dragging') !== null);
  const stateWhileStuck = await selectedClipState(page, rightClip);
  await page.screenshot({ path: shots.afterCancel, fullPage: false });
  // Clean up the still-armed window listeners so the app doesn't fight us.
  await page.mouse.up();
  await page.waitForTimeout(200);
  const stateAfterCleanup = await selectedClipState(page, rightClip);
  const cancel = {
    stuckDraggingAfterCancel,
    inWhileStuck: stateWhileStuck.inFrame,
    // The leaked pointerup handler commits the move even though the gesture
    // was cancelled — measure whether a commit happened after cleanup.
    committedMoveAfterCancelFrames: stateAfterCleanup.inFrame - stateWhileStuck.inFrame,
    cancelHandled: !stuckDraggingAfterCancel,
  };

  // --- Playback through a gap: the edit must drive what plays -------------
  // The timeline now has a real gap (left clip out → right clip in). Playing
  // across it must SKIP the gap (jump cut), not play the removed source
  // content straight through.
  const gapBounds = await page.evaluate(() => {
    const lane = document.querySelector('.nleTrackLaneBody[data-track-kind="video"]');
    const content = document.querySelector('.nleLaneContent');
    const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
    const durationMatch = meta.match(/\/\s*(\d+)\s*frames/);
    if (!lane || !content || !durationMatch) return null;
    const total = Number(durationMatch[1]);
    const contentRect = content.getBoundingClientRect();
    const clips = [...lane.querySelectorAll('.nleClipBlock')]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          inFrame: Math.round(((rect.left - contentRect.left) / contentRect.width) * total),
          outFrame: Math.round(((rect.right - contentRect.left) / contentRect.width) * total),
        };
      })
      .sort((a, b) => a.inFrame - b.inFrame);
    for (let i = 1; i < clips.length; i += 1) {
      const gap = clips[i].inFrame - clips[i - 1].outFrame;
      if (gap > 30) return { gapStart: clips[i - 1].outFrame, gapEnd: clips[i].inFrame, total };
    }
    return null;
  });
  let gapPlayback = { gapFound: Boolean(gapBounds) };
  if (gapBounds) {
    // Park the playhead ~2s before the gap, then play across it.
    const preRollFrame = Math.max(0, gapBounds.gapStart - 2 * FPS);
    await page.evaluate(() => { document.querySelector('.nleLaneBodies')?.scrollTo?.(0, 0); });
    const content2 = await requiredBox(page.locator('.nleLaneContent'), 'content for gap seek');
    const ruler2 = await requiredBox(page.locator('.nleTimelineRuler'), 'ruler for gap seek');
    await page.mouse.click(content2.x + (preRollFrame / gapBounds.total) * content2.width, ruler2.y + ruler2.height / 2);
    await page.waitForTimeout(400);
    await page.keyboard.press(' ');
    const samples = await page.evaluate(async () => {
      const out = [];
      const read = () => {
        const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
        const match = meta.match(/(\d+)\s*\/\s*\d+\s*frames/);
        return match ? Number(match[1]) : null;
      };
      for (let i = 0; i < 60; i += 1) {
        out.push(read());
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return out;
    });
    await page.keyboard.press(' ');
    await page.waitForTimeout(200);
    const inGap = samples.filter((frame) => frame !== null && frame > gapBounds.gapStart + 10 && frame < gapBounds.gapEnd - 10);
    const reachedAfterGap = samples.some((frame) => frame !== null && frame >= gapBounds.gapEnd);
    const playbackDebug = await page.evaluate(() => (window).__roughCutTimelinePlaybackDebug ?? null);
    gapPlayback = {
      gapFound: true,
      gapStart: gapBounds.gapStart,
      gapEnd: gapBounds.gapEnd,
      gapFrames: gapBounds.gapEnd - gapBounds.gapStart,
      samples,
      samplesInsideGap: inGap.length,
      reachedAfterGap,
      skippedGap: inGap.length <= 2 && reachedAfterGap,
      playbackDebug,
    };
  }

  // --- Zoom (Phase 1): zoom in, verify precision + alignment, fit back ---
  const zoomIn = page.locator('button[aria-label="Zoom timeline in"]');
  const zoomAvailable = await zoomIn.count() > 0;
  let zoom = { available: zoomAvailable };
  if (zoomAvailable) {
    // Earlier steps may have shortened the composition (tail drag); read the
    // LIVE duration from the editor header instead of assuming the seeded one.
    const liveDurationFrames = await page.evaluate(() => {
      const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
      const match = meta.match(/\/\s*(\d+)\s*frames/);
      return match ? Number(match[1]) : null;
    }) ?? durationFrames;
    const fitGeometry = await zoomGeometry(page);
    for (let i = 0; i < 4; i += 1) await zoomIn.click();
    await page.waitForTimeout(300);
    const zoomedGeometry = await zoomGeometry(page);
    await page.screenshot({ path: shots.afterZoom, fullPage: false });

    // Clip alignment at zoom: rendered x must equal committed In * ppf.
    const alignment = await page.evaluate(() => {
      const content = document.querySelector('.nleLaneContent');
      const selected = document.querySelector('.nleClipBlock.selected');
      const readout = document.querySelector('.nleTimelineReadout')?.textContent ?? '';
      const match = readout.match(/In\s+(-?\d+)/);
      if (!content || !selected || !match) return null;
      const contentRect = content.getBoundingClientRect();
      const clipRect = selected.getBoundingClientRect();
      return { inFrame: Number(match[1]), clipOffsetPx: clipRect.x - contentRect.x, contentWidthPx: contentRect.width };
    });
    const zoomedPpf = zoomedGeometry.contentWidthPx / liveDurationFrames;
    const alignmentErrorPx = alignment
      ? Math.abs(alignment.clipOffsetPx - alignment.inFrame * zoomedPpf)
      : null;

    // Drag precision at zoom: small drag should land within snap reach.
    const zClip = page.locator('.nleTrackLaneBody[data-track-kind="video"] .nleClipBlock').last();
    await zClip.scrollIntoViewIfNeeded();
    const zBox = await requiredBox(zClip, 'clip at zoom');
    const zBefore = await selectedClipState(page, zClip);
    const zDeltaPx = -40;
    await page.mouse.move(zBox.x + Math.min(zBox.width * 0.5, 200), zBox.y + zBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(zBox.x + Math.min(zBox.width * 0.5, 200) + zDeltaPx, zBox.y + zBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const zAfter = await selectedClipState(page, zClip);
    const zExpected = Math.round(zDeltaPx / zoomedPpf);
    const zObserved = zAfter.inFrame - zBefore.inFrame;

    // Ctrl+wheel zoom and Fit.
    const lane = await requiredBox(page.locator('.nleLaneBodies'), 'lane bodies for wheel');
    await page.mouse.move(lane.x + lane.width * 0.5, lane.y + lane.height * 0.5);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);
    const wheelGeometry = await zoomGeometry(page);
    await page.locator('button[aria-label="Fit timeline"]').click();
    await page.waitForTimeout(250);
    const fitBack = await zoomGeometry(page);
    await page.screenshot({ path: shots.afterFit, fullPage: false });

    zoom = {
      available: true,
      fitPpf: fitGeometry.contentWidthPx / liveDurationFrames,
      liveDurationFrames,
      zoomedPpf,
      framesPerPxZoomed: 1 / zoomedPpf,
      contentGrew: zoomedGeometry.contentWidthPx > fitGeometry.contentWidthPx * 3,
      scrollable: zoomedGeometry.scrollWidth > zoomedGeometry.clientWidth + 1,
      alignmentErrorPx,
      aligned: alignmentErrorPx !== null && alignmentErrorPx <= 2,
      dragAtZoom: {
        requestedDeltaPx: zDeltaPx,
        expectedDeltaFrames: zExpected,
        observedDeltaFrames: zObserved,
        errorFrames: zObserved - zExpected,
        snapReachFrames: 8 / zoomedPpf,
      },
      wheelZoomChanged: Math.abs(wheelGeometry.contentWidthPx - zoomedGeometry.contentWidthPx) > 1,
      fitRestored: Math.abs(fitBack.contentWidthPx - fitGeometry.contentWidthPx) < 2,
    };
  }

  // --- Blade mode (Phase 3): B key, click cuts the clip under the cursor ---
  const modeToolbarPresent = await page.locator('.nleModeToolbar').count() > 0;
  let blade = { available: modeToolbarPresent };
  if (modeToolbarPresent) {
    await page.keyboard.press('b');
    await page.waitForTimeout(150);
    const bladeActive = await page.evaluate(() => document.querySelector('button[aria-label="Blade mode"]')?.getAttribute('aria-pressed') === 'true');
    const bladeClipCountBefore = await page.locator('.nleClipBlock').count();
    const bladeTarget = page.locator('.nleTrackLaneBody[data-track-kind="video"] .nleClipBlock').first();
    const bladeBox = await requiredBox(bladeTarget, 'blade target clip');
    const cutX = bladeBox.x + bladeBox.width * 0.5;
    // Expected cut frame from the content strip geometry.
    const expectedCutFrame = await page.evaluate((clientX) => {
      const content = document.querySelector('.nleLaneContent');
      const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
      const match = meta.match(/\/\s*(\d+)\s*frames/);
      if (!content || !match) return null;
      const rect = content.getBoundingClientRect();
      return Math.round(((clientX - rect.left) / rect.width) * Number(match[1]));
    }, cutX);
    await page.mouse.click(cutX, bladeBox.y + bladeBox.height / 2);
    await page.waitForTimeout(250);
    const bladeClipCountAfter = await page.locator('.nleClipBlock').count();
    // The selected clip after blade is the right segment; its In is the cut.
    const cutState = await selectedClipState(page, bladeTarget);
    await page.screenshot({ path: shots.afterBlade, fullPage: false });
    // Back to selection mode; handles must come back for the selected clip.
    await page.keyboard.press('a');
    await page.waitForTimeout(150);
    const selectActive = await page.evaluate(() => document.querySelector('button[aria-label="Selection mode"]')?.getAttribute('aria-pressed') === 'true');
    const handlesBack = await page.locator('.nleClipTrimHandle').count();
    blade = {
      available: true,
      bladeActive,
      clipCountBefore: bladeClipCountBefore,
      clipCountAfter: bladeClipCountAfter,
      cutHappened: bladeClipCountAfter > bladeClipCountBefore,
      expectedCutFrame,
      observedCutFrame: cutState.inFrame,
      cutErrorFrames: cutState.inFrame !== null && expectedCutFrame !== null ? cutState.inFrame - expectedCutFrame : null,
      selectModeRestored: selectActive,
      handlesBackInSelectMode: handlesBack > 0,
    };
  }

  // --- Trim-handle coverage on a short clip (handles are fixed 20px) ---
  const handleCoverage = await page.evaluate(() => {
    const selected = document.querySelector('.nleClipBlock.selected');
    if (!selected) return null;
    const rect = selected.getBoundingClientRect();
    const handles = selected.querySelectorAll('.nleClipTrimHandle');
    let handlePx = 0;
    handles.forEach((h) => { handlePx += h.getBoundingClientRect().width; });
    return { clipWidthPx: rect.width, totalHandlePx: handlePx, handlesCoverRatio: handlePx / rect.width };
  });

  report = {
    ...report,
    geometry: {
      laneWidthPx: bodies.width,
      durationFrames,
      pxPerFrame,
      framesPerPx,
      snapThresholdFrames,
      frameAddressable: pxPerFrame >= 1,
    },
    split,
    trim,
    clickSelect,
    jitterClick,
    drag,
    cancel,
    gapPlayback,
    zoom,
    blade,
    handleCoverage,
  };
  const problems = [];
  // Fit-view precision is only a defect when there is no zoom to reach frames.
  if (!report.geometry.frameAddressable && !zoom.available) problems.push(`precision: 1px = ${framesPerPx.toFixed(1)} frames — individual frames unaddressable, snap reach ±${snapThresholdFrames.toFixed(0)} frames`);
  if (!split.splitWorked) problems.push('split: S at playhead did not produce a new clip');
  if (!trim.trimWorked) problems.push('trim: left-handle drag did not trim the clip');
  if (!clickSelect.cleanSelect) problems.push(`click-select: pure click moved clip by ${clickSelect.movedFrames} frames (or failed to select)`);
  if (!jitterClick.noPhantomMove) problems.push(`jitter-click: 2px jitter moved clip by ${jitterClick.movedFrames} frames`);
  if (!drag.dragWorked) problems.push('drag: deliberate drag did not move the clip');
  else if (Math.abs(drag.errorFrames) > snapThresholdFrames) problems.push(`drag accuracy: landed ${drag.errorFrames} frames off target (beyond snap reach)`);
  if (!cancel.cancelHandled) problems.push('pointercancel: drag session stuck (clip stays in dragging state, listeners leaked)');
  if (cancel.committedMoveAfterCancelFrames !== 0) problems.push(`pointercancel: cancelled gesture still committed a ${cancel.committedMoveAfterCancelFrames}-frame move on cleanup`);
  if (zoom.available) {
    if (!zoom.contentGrew) problems.push('zoom: content width did not grow when zooming in');
    if (!zoom.scrollable) problems.push('zoom: lane bodies did not become horizontally scrollable');
    if (!zoom.aligned) problems.push(`zoom: clip rendered ${zoom.alignmentErrorPx}px off its committed frame position`);
    if (Math.abs(zoom.dragAtZoom.errorFrames) > zoom.dragAtZoom.snapReachFrames) problems.push(`zoom drag: landed ${zoom.dragAtZoom.errorFrames} frames off target`);
    if (!zoom.wheelZoomChanged) problems.push('zoom: ctrl+wheel did not change zoom');
    if (!zoom.fitRestored) problems.push('zoom: Fit did not restore fit-to-width');
  } else {
    problems.push('zoom: controls not present (Phase 1 pending)');
  }
  if (!gapPlayback.gapFound) problems.push('gap-playback: no gap found on the video lane to test');
  else if (!gapPlayback.skippedGap) problems.push(`gap-playback: playback did NOT skip the gap (${gapPlayback.samplesInsideGap} samples inside gap, reachedAfterGap=${gapPlayback.reachedAfterGap}) — edits are disregarded during playback`);
  if (blade.available) {
    if (!blade.bladeActive) problems.push('blade: B key did not activate blade mode');
    if (!blade.cutHappened) problems.push('blade: click did not cut the clip');
    if (blade.cutErrorFrames === null || Math.abs(blade.cutErrorFrames) > 2) problems.push(`blade: cut landed ${blade.cutErrorFrames} frames from the cursor`);
    if (!blade.selectModeRestored) problems.push('blade: A key did not restore selection mode');
    if (!blade.handlesBackInSelectMode) problems.push('blade: trim handles missing after returning to selection mode');
  } else {
    problems.push('blade: mode toolbar not present (Phase 3 pending)');
  }
  report.problems = problems;
  report.ok = true; // harness ran end-to-end; problems[] is the reproduction payload
} catch (error) {
  failure = error;
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({ ok: report.ok, reportPath, root, problems: report.problems ?? [], screenshots: shots }, null, 2));
if (failure) throw failure;

// Read the committed state of the currently relevant clip. Prefers the
// timeline readout (shows In/Out frames for the selected clip); falls back
// to geometry if nothing is selected.
async function selectedClipState(page, clipLocator) {
  return page.evaluate(() => {
    const readout = document.querySelector('.nleTimelineReadout');
    const selected = document.querySelector('.nleClipBlock.selected');
    let inFrame = null;
    const text = readout?.textContent ?? '';
    const match = text.match(/In\s+(-?\d+)/);
    if (match) inFrame = Number(match[1]);
    if (inFrame === null && selected instanceof HTMLElement) {
      const lane = selected.closest('.nleTrackLaneBody');
      const laneRect = lane?.getBoundingClientRect();
      const rect = selected.getBoundingClientRect();
      if (laneRect && laneRect.width > 0) inFrame = Math.round(((rect.x - laneRect.x) / laneRect.width) * 1e6); // proportional fallback
    }
    return { inFrame, selected: selected !== null, readout: text };
  });
}

async function zoomGeometry(page) {
  return page.evaluate(() => {
    const bodies = document.querySelector('.nleLaneBodies');
    const content = document.querySelector('.nleLaneContent');
    return {
      clientWidth: bodies?.clientWidth ?? 0,
      scrollWidth: bodies?.scrollWidth ?? 0,
      scrollLeft: bodies?.scrollLeft ?? 0,
      contentWidthPx: content?.getBoundingClientRect().width ?? 0,
    };
  });
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} bounding box was unavailable.`);
  return box;
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
