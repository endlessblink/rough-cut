// TASK-227 reproduction harness: NLE Editor with a REAL-shaped recording —
// screen video + mic audio (muxed into the screen mp4, like ffmpeg-capture
// does) + a separate camera video. createProjectForRecording builds a Camera
// video track at index 1 ABOVE the screen track, and the canonical timeline
// links screen/camera/mic sources into a `linked:<assetId>` recording group.
//
// Gap behavior under test: a full-length camera clip on track index 1 must not
// mask a gap cut into the screen track. Timeline gaps are real timeline time:
// playback should dwell in the empty section, draw black/background, and then
// continue to the next clip without playing deleted source or full-frame
// camera material.
//
// Camera fixture is SOLID MAGENTA so canvas pixel stats can prove whether
// camera content is drawn in the gap.
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const DURATION_SECONDS = Number(process.env.ROUGH_CUT_NLE_LINKED_SECONDS || 120);
const FPS = 30;

const root = await mkdtemp(join(tmpdir(), 'rough-cut-nle-linked-'));
const screenPath = join(root, 'linked-screen.mp4');
const cameraPath = join(root, 'linked-camera.mp4');
const reportPath = join(root, 'nle-linked-clips-report.json');
const shots = {
  editorOpen: join(root, '01-editor-open.png'),
  afterDelete: join(root, '02-after-delete-middle.png'),
  pausedInGap: join(root, '03-paused-in-gap.png'),
  beforePlay: join(root, '04-before-play.png'),
  afterCross: join(root, '05-after-crossing-gap.png'),
};

await mkdir(root, { recursive: true });
// Screen: moving testsrc2 + sine "mic" audio muxed in (real recordings mux mic
// into the screen mp4; there is no separate mic file in this app's shape).
run('ffmpeg', [
  '-y',
  '-f', 'lavfi', '-i', `testsrc2=size=960x540:rate=${FPS}`,
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-t', String(DURATION_SECONDS),
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-shortest',
  '-movflags', '+faststart', screenPath,
]);
// Camera: solid magenta so canvas sampling can attribute pixels to it.
run('ffmpeg', [
  '-y',
  '-f', 'lavfi', '-i', `color=c=magenta:size=640x360:rate=${FPS}`,
  '-t', String(DURATION_SECONDS),
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', cameraPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + DURATION_SECONDS * 1000).toISOString(),
  rawPath: screenPath,
  outputPath: screenPath,
  width: 960,
  height: 540,
  fps: FPS,
  audio: { micSource: 'harness-test-mic', micGainPercent: 100 },
  camera: {
    outputPath: cameraPath,
    rawPath: cameraPath,
    width: 640,
    height: 360,
    devicePath: '/dev/video0',
  },
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

let report = {
  ok: false,
  root,
  projectPath: project.path,
  durationSeconds: DURATION_SECONDS,
  fps: FPS,
  screenshots: shots,
};
let failure;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await dismissPreRecordOverlay(page);
  await page.locator('nav.appViewTabStrip button.appViewTab', { hasText: 'Editor' }).click();
  await page.waitForSelector('.nleClipBlock', { timeout: 10000 });
  await page.waitForTimeout(800);

  const rulerLocator = page.locator('.nleTimelineRuler');

  // Lane census: zip lane headers with lane bodies so we can tell the Screen
  // lane from the Camera lane (both are data-track-kind="video").
  async function laneCensus() {
    return page.evaluate(() => {
      const headers = [...document.querySelectorAll('.nleTrackLaneHeader')]
        .filter((el) => el.getAttribute('data-track-kind') !== 'empty');
      const bodies = [...document.querySelectorAll('.nleTrackLaneBody')]
        .filter((el) => el.getAttribute('data-track-kind') !== 'empty');
      return headers.map((header, i) => ({
        label: header.textContent?.trim() ?? '',
        kind: header.getAttribute('data-track-kind'),
        clipCount: bodies[i] ? bodies[i].querySelectorAll('.nleClipBlock').length : null,
      }));
    });
  }

  function laneIndexByLabel(census, needle) {
    return census.findIndex((lane) => lane.label.toLowerCase().includes(needle));
  }

  const lanesInitial = await laneCensus();
  report.lanesInitial = lanesInitial;
  const screenLaneIdx = laneIndexByLabel(lanesInitial, 'screen');
  const cameraLaneIdx = laneIndexByLabel(lanesInitial, 'camera');
  if (screenLaneIdx < 0) throw new Error(`Harness: no Screen lane found. Lanes: ${JSON.stringify(lanesInitial)}`);
  if (cameraLaneIdx < 0) throw new Error(`Harness: no Camera lane found — fixture did not produce a camera track. Lanes: ${JSON.stringify(lanesInitial)}`);

  const laneBodies = page.locator('.nleTrackLaneBody:not(.empty)');
  const screenClips = laneBodies.nth(screenLaneIdx).locator('.nleClipBlock');
  const cameraClips = laneBodies.nth(cameraLaneIdx).locator('.nleClipBlock');

  // Seek by clicking the ruler at `fraction` of the lane CONTENT width (the
  // ruler spans the content inside the scrollable .nleLaneBodies, so its own
  // bounding box is the wrong coordinate space when zoomed/scrolled). Verifies
  // the playhead actually moved; falls back to dispatching a PointerEvent on
  // the ruler element directly, then throws with diagnostics if seek failed.
  const seekDiagnostics = [];
  report.seekDiagnostics = seekDiagnostics;
  async function clickRulerAt(fraction) {
    await page.evaluate(() => {
      document.querySelector('.nleLaneBodies')?.scrollTo?.(0, 0);
    });
    await page.waitForTimeout(100);
    const content = await requiredBox(page.locator('.nleLaneContent'), 'lane content');
    const ruler = await requiredBox(rulerLocator, 'ruler');
    const x = content.x + content.width * fraction;
    const y = ruler.y + ruler.height / 2;
    const hit = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}` : null;
    }, [x, y]);
    await page.mouse.click(x, y);
    await page.waitForTimeout(250);
    let state = await playheadState();
    const expected = Math.round(fraction * (state.durationFrames ?? 0));
    let method = 'mouse-click';
    if (state.playheadFrame === null || Math.abs(state.playheadFrame - expected) > 45) {
      // Fallback: synthesize pointerdown/up on the ruler element itself.
      await page.evaluate(([px, py]) => {
        const rulerEl = document.querySelector('.nleTimelineRuler');
        if (!rulerEl) return;
        const opts = { bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, pointerId: 7, isPrimary: true };
        rulerEl.dispatchEvent(new PointerEvent('pointerdown', opts));
        rulerEl.dispatchEvent(new PointerEvent('pointerup', opts));
      }, [x, y]);
      await page.waitForTimeout(250);
      state = await playheadState();
      method = 'dispatch-pointer-event';
    }
    seekDiagnostics.push({
      fraction,
      expectedFrame: expected,
      gotFrame: state.playheadFrame,
      method,
      elementAtPoint: hit,
      clickPoint: { x: Math.round(x), y: Math.round(y) },
    });
    if (state.playheadFrame === null || Math.abs(state.playheadFrame - expected) > 45) {
      throw new Error(`Harness: ruler seek to fraction ${fraction} failed (expected ~frame ${expected}, got ${state.playheadFrame}, elementAtPoint=${hit})`);
    }
  }

  // Index of the screen-lane clip whose rect contains `fraction` of the lane
  // content width. Locator clicks (auto scroll-into-view) then select it —
  // raw mouse coordinates miss when the lane is scrolled out of the viewport.
  async function screenClipIndexAtFraction(fraction) {
    return page.evaluate(({ laneIdx, frac }) => {
      const content = document.querySelector('.nleLaneContent');
      if (!content) return -1;
      const rect = content.getBoundingClientRect();
      const lanes = [...document.querySelectorAll('.nleTrackLaneBody')]
        .filter((el) => el.getAttribute('data-track-kind') !== 'empty');
      const clips = [...(lanes[laneIdx]?.querySelectorAll('.nleClipBlock') ?? [])];
      const x = rect.x + rect.width * frac;
      return clips.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return x >= r.x && x < r.x + r.width;
      });
    }, { laneIdx: screenLaneIdx, frac: fraction });
  }

  async function selectScreenClipAtFraction(fraction) {
    const index = await screenClipIndexAtFraction(fraction);
    if (index < 0) throw new Error(`Harness: no screen clip found at fraction ${fraction}`);
    await screenClips.nth(index).click({ timeout: 5000 });
    await page.waitForTimeout(150);
    const selected = await page.evaluate(() => document.querySelector('.nleClipBlock.selected') !== null);
    if (!selected) throw new Error(`Harness: clicking screen clip ${index} did not select it`);
  }

  // Canvas pixel stats: fraction of magenta-ish (camera) pixels, mean RGB,
  // black fraction. Sampled every 6px.
  async function canvasStats() {
    return page.evaluate(() => {
      const canvas = document.querySelector('.nleProgramMonitor canvas');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      let data;
      try {
        data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch {
        return null;
      }
      let n = 0; let magenta = 0; let black = 0; let r = 0; let g = 0; let b = 0;
      const stride = 6 * 4;
      const rowStride = 6;
      const width = canvas.width;
      const height = canvas.height;
      for (let y = 0; y < height; y += rowStride) {
        for (let x = 0; x < width; x += rowStride) {
          const i = (y * width + x) * 4;
          const pr = data[i]; const pg = data[i + 1]; const pb = data[i + 2];
          n += 1; r += pr; g += pg; b += pb;
          if (pr > 160 && pg < 90 && pb > 160) magenta += 1;
          if (pr < 24 && pg < 24 && pb < 24) black += 1;
        }
      }
      if (n === 0) return null;
      return {
        magentaFraction: magenta / n,
        blackFraction: black / n,
        meanRgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
        canvasSize: { w: width, h: height },
      };
    });
  }

  async function playheadState() {
    return page.evaluate(() => {
      // v2 exposes machine-readable frames on the toolbar status cluster;
      // the legacy header text is the fallback.
      const status = document.querySelector('.nleTimelineStatus');
      const ds = status instanceof HTMLElement ? status.dataset : null;
      const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
      const match = meta.match(/(\d+)\s*\/\s*(\d+)\s*frames/);
      const videos = [...document.querySelectorAll('.nleProgramMonitor video')].map((v) => ({
        src: (v.currentSrc || v.src || '').split('/').pop(),
        currentTime: v.currentTime,
        paused: v.paused,
      }));
      return {
        playheadFrame: ds?.playheadFrame !== undefined ? Number(ds.playheadFrame) : match ? Number(match[1]) : null,
        durationFrames: ds?.durationFrames !== undefined ? Number(ds.durationFrames) : match ? Number(match[2]) : null,
        videos,
      };
    });
  }

  const steps = [];
  report.steps = steps;
  async function snapshotStep(label) {
    const census = await laneCensus();
    const state = await playheadState();
    steps.push({
      label,
      playheadFrame: state.playheadFrame,
      lanes: census.map((lane) => `${lane.label}:${lane.clipCount}`),
      selected: await page.evaluate(() => document.querySelector('.nleClipBlock.selected') !== null),
    });
    return census;
  }

  await page.screenshot({ path: shots.editorOpen, fullPage: false });

  // --- Split the SCREEN clip at ~20% and ~40% of the timeline. ---
  await selectScreenClipAtFraction(0.1);
  await snapshotStep('select-screen-clip');
  await clickRulerAt(0.2);
  await page.waitForTimeout(150);
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  await snapshotStep('split-1');
  if (await screenClips.count() !== 2) {
    throw new Error(`Harness: first split did not take — screen lane has ${await screenClips.count()} clip(s), expected 2`);
  }

  // Splitting may move selection; re-select the screen segment containing 40%.
  await selectScreenClipAtFraction(0.3);
  await clickRulerAt(0.4);
  await page.waitForTimeout(150);
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  const censusAfterSplits = await snapshotStep('split-2');
  if (await screenClips.count() !== 3) {
    throw new Error(`Harness: second split did not take — screen lane has ${await screenClips.count()} clip(s), expected 3`);
  }

  const screenClipsBeforeDelete = await screenClips.count();
  const cameraClipsBeforeDelete = await cameraClips.count();

  // --- Delete the MIDDLE screen segment (select it at ~30%). ---
  if (screenClipsBeforeDelete !== 3) {
    throw new Error(`Harness: refusing to Delete — screen lane has ${screenClipsBeforeDelete} clip(s), expected 3 post-split segments`);
  }
  await selectScreenClipAtFraction(0.3);
  await snapshotStep('select-middle');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await snapshotStep('delete-middle');
  const screenClipsAfterDelete = await screenClips.count();
  const cameraClipsAfterDelete = await cameraClips.count();
  await page.screenshot({ path: shots.afterDelete, fullPage: false });

  if (screenClipsBeforeDelete !== 3 || screenClipsAfterDelete !== 2) {
    report.harnessWarning = `expected screen lane 3→2 clips, got ${screenClipsBeforeDelete}→${screenClipsAfterDelete}`;
  }

  // --- Gap geometry from the surviving screen clips. ---
  const liveDurationFrames = (await playheadState()).durationFrames;
  const clipRects = await page.evaluate((laneIdx) => {
    const content = document.querySelector('.nleLaneContent');
    if (!content) return null;
    const contentRect = content.getBoundingClientRect();
    const lanes = [...document.querySelectorAll('.nleTrackLaneBody')].filter((el) => el.getAttribute('data-track-kind') !== 'empty');
    const lane = lanes[laneIdx];
    return [...(lane?.querySelectorAll('.nleClipBlock') ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        leftRatio: (r.x - contentRect.x) / contentRect.width,
        rightRatio: (r.x + r.width - contentRect.x) / contentRect.width,
      };
    }).sort((a, b) => a.leftRatio - b.leftRatio);
  }, screenLaneIdx);
  const gapStartFrame = Math.round((clipRects?.[0]?.rightRatio ?? 0.2) * liveDurationFrames);
  const gapEndFrame = Math.round((clipRects?.[1]?.leftRatio ?? 0.4) * liveDurationFrames);
  const gapStartSec = gapStartFrame / FPS;
  const gapEndSec = gapEndFrame / FPS;

  // --- Paused in the middle of the gap: what does the preview show? ---
  const midGapFraction = ((gapStartFrame + gapEndFrame) / 2) / liveDurationFrames;
  await clickRulerAt(midGapFraction);
  await page.waitForTimeout(600);
  const pausedInGap = {
    ...(await playheadState()),
    canvas: await canvasStats(),
  };
  await page.screenshot({ path: shots.pausedInGap, fullPage: false });

  // --- Play across the gap, sampling playhead + videos + canvas. ---
  const startFrame = Math.max(0, gapStartFrame - 2 * FPS);
  await clickRulerAt(startFrame / liveDurationFrames);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shots.beforePlay, fullPage: false });
  await page.keyboard.press(' ');

  const sampleCount = Math.min(420, Math.max(60, Math.ceil((((gapEndFrame - startFrame) / FPS) + 6) * 10)));
  const samples = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const state = await playheadState();
    samples.push({
      t: i * 0.1,
      playheadFrame: state.playheadFrame,
      videos: state.videos,
      canvas: await canvasStats(),
      debug: await page.evaluate(() => window.__roughCutTimelinePlaybackDebug ?? null),
    });
    await page.waitForTimeout(100);
  }
  await page.keyboard.press(' ');
  await page.screenshot({ path: shots.afterCross, fullPage: false });

  // --- Analysis ---
  const tolFrames = 3;
  const tolSec = tolFrames / FPS;
  const screenVideoOf = (sample) => sample.videos.find((v) => v.src?.includes('linked-screen')) ?? sample.videos[0] ?? null;

  const linkedDeleteTogether = cameraClipsAfterDelete < cameraClipsBeforeDelete;
  const playheadInGap = samples.filter((s) => s.playheadFrame !== null && s.playheadFrame > gapStartFrame + tolFrames && s.playheadFrame < gapEndFrame - tolFrames);
  const deletedSourcePlayed = samples.filter((s) => {
    const v = screenVideoOf(s);
    return v && v.paused === false && v.currentTime > gapStartSec + tolSec && v.currentTime < gapEndSec - tolSec;
  });
  const crossedToSecondClip = samples.some((s) => {
    const v = screenVideoOf(s);
    return v && v.currentTime >= gapEndSec - tolSec;
  });
  const gapCanvasSamples = playheadInGap.map((s) => s.canvas).filter(Boolean);
  const magentaInGap = gapCanvasSamples.filter((c) => c.magentaFraction > 0.2);
  const pausedGapShowsCamera = (pausedInGap.canvas?.magentaFraction ?? 0) > 0.2;
  const pausedGapShowsContent = (pausedInGap.canvas?.blackFraction ?? 1) < 0.85;

  report = {
    ...report,
    ok: true,
    lanesInitial,
    censusAfterSplits,
    screenClipsBeforeDelete,
    cameraClipsBeforeDelete,
    screenClipsAfterDelete,
    cameraClipsAfterDelete,
    linkedDeleteTogether,
    liveDurationFrames,
    gapStartFrame,
    gapEndFrame,
    gapStartSec,
    gapEndSec,
    pausedInGap,
    sampleCount: samples.length,
    playheadInGapSampleCount: playheadInGap.length,
    playheadInGapFrames: playheadInGap.slice(0, 10).map((s) => s.playheadFrame),
    deletedSourcePlayedCount: deletedSourcePlayed.length,
    deletedSourcePlayedSamples: deletedSourcePlayed.slice(0, 8).map((s) => ({ t: s.t, playheadFrame: s.playheadFrame, screenVideo: screenVideoOf(s) })),
    crossedToSecondClip,
    gapCanvasMagentaSampleCount: magentaInGap.length,
    pausedGapCanvas: pausedInGap.canvas,
    firstSamples: samples.slice(0, 6),
    lastSamples: samples.slice(-4),
    problems: [
      ...(linkedDeleteTogether
        ? []
        : [`linked group did NOT delete together: deleting the middle screen clip left the camera lane at ${cameraClipsAfterDelete} clip(s) spanning the gap (camera ${cameraClipsBeforeDelete}→${cameraClipsAfterDelete})`]),
      ...(playheadInGap.length < 3
        ? [`playhead did not play through the deleted gap (${playheadInGap.length}/60 in-gap samples, frames ${gapStartFrame}–${gapEndFrame})`]
        : []),
      ...(deletedSourcePlayed.length > 0
        ? [`screen <video> played ${deletedSourcePlayed.length} samples of DELETED source material (${gapStartSec.toFixed(1)}s–${gapEndSec.toFixed(1)}s)`]
        : []),
      ...(!crossedToSecondClip
        ? ['playback never reached the clip after the gap during the sample window']
        : []),
      ...(magentaInGap.length > 0
        ? [`canvas showed CAMERA (magenta) content for ${magentaInGap.length} in-gap samples — camera masks the screen-track gap`]
        : []),
      ...(pausedGapShowsCamera
        ? [`paused in the gap, the preview shows the CAMERA full-frame (magentaFraction=${(pausedInGap.canvas?.magentaFraction ?? 0).toFixed(2)}) instead of an empty gap`]
        : []),
      ...(!pausedGapShowsCamera && pausedGapShowsContent
        ? [`paused in the gap, the preview still shows non-background content (meanRgb=${JSON.stringify(pausedInGap.canvas?.meanRgb)}) instead of an empty gap`]
        : []),
    ],
  };
} catch (error) {
  failure = error;
  report.failure = String(error?.message ?? error).slice(0, 500);
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({
  ok: report.ok,
  reportPath,
  root,
  linkedDeleteTogether: report.linkedDeleteTogether,
  playheadInGapSampleCount: report.playheadInGapSampleCount,
  deletedSourcePlayedCount: report.deletedSourcePlayedCount,
  crossedToSecondClip: report.crossedToSecondClip,
  gapCanvasMagentaSampleCount: report.gapCanvasMagentaSampleCount,
  pausedGapCanvas: report.pausedGapCanvas,
  problems: report.problems ?? [],
}, null, 2));
if (failure) throw failure;

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
