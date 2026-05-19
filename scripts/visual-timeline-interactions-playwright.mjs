import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-visual-timeline-'));
const mediaPath = join(root, 'timeline-source.mp4');
const reportPath = join(root, 'visual-timeline-report.json');
const beforePath = join(root, 'before.png');
const afterScrubPath = join(root, 'after-scrub.png');
const afterCutPath = join(root, 'after-cut.png');
const afterTrimEndPath = join(root, 'after-trim-end.png');
const afterTrimStartPath = join(root, 'after-trim-start.png');
const afterClipMovePath = join(root, 'after-clip-move.png');
const afterRestorePath = join(root, 'after-restore.png');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildFilter(),
  '-t',
  '6',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + 6000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: 30,
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

let report;
let failure;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await dismissPreRecordOverlay(page);
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 10000 });
  await page.addScriptTag({ content: `window.__timelineMonitor = (${createCanvasMonitor.toString()})();` });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    return video && video.readyState >= 2 && canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
  });
  await page.waitForFunction(() => window.__timelineMonitor.inspect().stats.ok, null, { timeout: 10000 });
  await page.waitForTimeout(800);
  await captureViewport(page, beforePath);

  const activeToolBefore = await activeTool(page);
  const scrubber = page.locator('input[aria-label="Scrub timeline"]');
  const scrubberBox = await requiredBox(scrubber, 'timeline scrubber');
  const coordinateBefore = await timelineCoordinates(page);
  const coordinateAlignedBefore = coordinateBefore.scrubberMatchesTrack && coordinateBefore.playheadWithinTrack && coordinateBefore.clipLeftAnchored;

  const wheel = await assertWheelStable(page, scrubber, scrubberBox);
  const rangeWheel = await assertRangeWheelStable(page);

  await page.evaluate(() => window.__timelineMonitor.start());
  await page.mouse.move(scrubberBox.x + scrubberBox.width * 0.08, scrubberBox.y + scrubberBox.height / 2);
  await page.mouse.down();
  for (const position of [0.18, 0.36, 0.54, 0.72]) {
    await page.mouse.move(scrubberBox.x + scrubberBox.width * position, scrubberBox.y + scrubberBox.height / 2, { steps: 8 });
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  const scrubMonitor = await page.evaluate(() => window.__timelineMonitor.stop());
  await captureViewport(page, afterScrubPath);

  const cutTool = await assertCutTool(page);
  await captureViewport(page, afterCutPath);

  const trimEndResult = await dragTrimHandle(page, 'Trim end', 0.72);
  const trimEndMonitor = trimEndResult.monitor;
  await captureViewport(page, afterTrimEndPath);

  const trimStartResult = await dragTrimHandle(page, 'Trim start', 0.12);
  const trimStartMonitor = trimStartResult.monitor;
  await captureViewport(page, afterTrimStartPath);

  const clipMoveResult = await dragScreenClip(page, 0.18);
  await captureViewport(page, afterClipMovePath);

  const recovery = await restoreFullSource(page);
  await captureViewport(page, afterRestorePath);

  const activeToolAfter = await activeTool(page);
  const coordinateAfter = await timelineCoordinates(page);
  const coordinateAlignedAfter = coordinateAfter.scrubberMatchesTrack && coordinateAfter.playheadWithinTrack && coordinateAfter.clipLeftAnchored;
  const keptActiveTool = activeToolBefore === activeToolAfter && trimEndResult.activeToolStable && trimStartResult.activeToolStable;

  report = {
    ok: coordinateAlignedBefore
      && coordinateAlignedAfter
      && keptActiveTool
      && wheel.stable
      && rangeWheel.stable
      && cutTool.active
      && cutTool.created
      && cutTool.restored
      && cutTool.activeToolStable
      && trimEndResult.changed
      && trimStartResult.changed
      && clipMoveResult.changed
      && clipMoveResult.widthStable
      && clipMoveResult.activeToolStable
      && recovery.hiddenControlsVisible
      && recovery.restored
      && recovery.activeToolStable
      && scrubMonitor.frameCount >= 50
      && scrubMonitor.badFrames.length === 0
      && trimEndMonitor.frameCount >= 25
      && trimEndMonitor.badFrames.length === 0
      && trimStartMonitor.frameCount >= 25
      && trimStartMonitor.badFrames.length === 0,
    root,
    projectPath: project.path,
    screenshots: { beforePath, afterScrubPath, afterCutPath, afterTrimEndPath, afterTrimStartPath, afterClipMovePath, afterRestorePath },
    activeTool: { before: activeToolBefore, after: activeToolAfter, stable: keptActiveTool },
    wheel,
    rangeWheel,
    coordinateBefore,
    coordinateAfter,
    trimEnd: trimEndResult,
    trimStart: trimStartResult,
    clipMove: clipMoveResult,
    cutTool,
    recovery,
    scrubMonitor,
    trimEndMonitor,
    trimStartMonitor,
  };
  if (!report.ok) {
    failure = new Error(`Timeline interaction regression failed: ${JSON.stringify(summarizeFailure(reportPath, report))}`);
  }
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({
  ok: report?.ok ?? false,
  reportPath,
  root,
  projectPath: project.path,
  activeToolStable: report?.activeTool?.stable ?? false,
  wheelStable: report?.wheel?.stable ?? false,
  rangeWheelStable: report?.rangeWheel?.stable ?? false,
  coordinateAlignedBefore: report ? report.coordinateBefore.scrubberMatchesTrack && report.coordinateBefore.playheadWithinTrack && report.coordinateBefore.clipLeftAnchored : false,
  coordinateAlignedAfter: report ? report.coordinateAfter.scrubberMatchesTrack && report.coordinateAfter.playheadWithinTrack && report.coordinateAfter.clipLeftAnchored : false,
  scrubFrameCount: report?.scrubMonitor?.frameCount ?? 0,
  scrubBadFrameCount: report?.scrubMonitor?.badFrames?.length ?? 0,
  trimEndFrameCount: report?.trimEndMonitor?.frameCount ?? 0,
  trimEndBadFrameCount: report?.trimEndMonitor?.badFrames?.length ?? 0,
  trimStartFrameCount: report?.trimStartMonitor?.frameCount ?? 0,
  trimStartBadFrameCount: report?.trimStartMonitor?.badFrames?.length ?? 0,
  clipMoveChanged: report?.clipMove?.changed ?? false,
  clipMoveWidthStable: report?.clipMove?.widthStable ?? false,
  cutToolCreated: report?.cutTool?.created ?? false,
  cutToolRestored: report?.cutTool?.restored ?? false,
  cutToolActive: report?.cutTool?.active ?? false,
  recoveryRestored: report?.recovery?.restored ?? false,
  hiddenControlsVisible: report?.recovery?.hiddenControlsVisible ?? false,
}, null, 2));
if (failure) throw failure;

async function dragTrimHandle(page, label, targetRatio) {
  const beforeTool = await activeTool(page);
  const clipBefore = await requiredBox(page.locator('[data-timeline-lane="screen"] .clipBar'), 'screen clip');
  const handle = page.locator(`button[aria-label="${label}"]`);
  const handleBox = await requiredBox(handle, label);
  const trackLocator = page.locator('[data-timeline-lane="screen"] .laneTrack');
  const track = await requiredBox(page.locator('[data-timeline-lane="screen"] .laneTrack'), 'screen lane track');

  await page.evaluate(() => window.__timelineMonitor.start());
  await handle.dragTo(trackLocator, {
    sourcePosition: { x: handleBox.width / 2, y: handleBox.height / 2 },
    targetPosition: { x: track.width * targetRatio, y: handleBox.y + handleBox.height / 2 - track.y },
  });
  await page.waitForFunction(({ previousX, previousWidth }) => {
    const clip = document.querySelector('[data-timeline-lane="screen"] .clipBar');
    if (!(clip instanceof HTMLElement)) return false;
    const rect = clip.getBoundingClientRect();
    return Math.abs(rect.width - previousWidth) > 6 || Math.abs(rect.x - previousX) > 6;
  }, { previousX: clipBefore.x, previousWidth: clipBefore.width }, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(700);
  const monitor = await page.evaluate(() => window.__timelineMonitor.stop());

  const clipAfter = await requiredBox(page.locator('[data-timeline-lane="screen"] .clipBar'), 'screen clip after drag');
  const afterTool = await activeTool(page);
  return {
    label,
    changed: Math.abs(clipAfter.width - clipBefore.width) > 6 || Math.abs(clipAfter.x - clipBefore.x) > 6,
    leftAnchored: Math.abs(clipAfter.x - track.x) < 3 || label === 'Trim start',
    activeToolStable: beforeTool === afterTool,
    before: { x: clipBefore.x, width: clipBefore.width },
    after: { x: clipAfter.x, width: clipAfter.width },
    monitor,
  };
}

async function dragScreenClip(page, targetDeltaRatio) {
  const beforeTool = await activeTool(page);
  const clip = page.locator('[data-timeline-lane="screen"] .clipBar');
  const clipBefore = await requiredBox(clip, 'screen clip before move');
  const track = await requiredBox(page.locator('[data-timeline-lane="screen"] .laneTrack'), 'screen lane track');

  await page.mouse.move(clipBefore.x + clipBefore.width / 2, clipBefore.y + clipBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(clipBefore.x + clipBefore.width / 2 + track.width * targetDeltaRatio, clipBefore.y + clipBefore.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(({ previousX }) => {
    const clip = document.querySelector('[data-timeline-lane="screen"] .clipBar');
    if (!(clip instanceof HTMLElement)) return false;
    const rect = clip.getBoundingClientRect();
    return Math.abs(rect.x - previousX) > 6;
  }, { previousX: clipBefore.x }, { timeout: 10000 }).catch(() => undefined);

  const clipAfter = await requiredBox(clip, 'screen clip after move');
  const afterTool = await activeTool(page);
  return {
    changed: Math.abs(clipAfter.x - clipBefore.x) > 6,
    widthStable: Math.abs(clipAfter.width - clipBefore.width) < 3,
    activeToolStable: beforeTool === afterTool,
    before: { x: clipBefore.x, width: clipBefore.width },
    after: { x: clipAfter.x, width: clipAfter.width },
  };
}

async function assertCutTool(page) {
  const beforeTool = await activeTool(page);
  const cutButton = page.locator('button[aria-label="Cut tool"]');
  const track = await requiredBox(page.locator('[data-timeline-lane="screen"] .laneTrack'), 'screen lane track');

  await cutButton.click();
  const active = await cutButton.getAttribute('aria-pressed') === 'true';
  await page.mouse.move(track.x + track.width * 0.28, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.44, track.y + track.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelectorAll('.hiddenCutRange').length > 0, null, { timeout: 10000 }).catch(() => undefined);

  const hiddenCutCount = await page.locator('.hiddenCutRange').count();
  if (hiddenCutCount > 0) await page.locator('.hiddenCutRange').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.hiddenCutRange').length === 0, null, { timeout: 10000 }).catch(() => undefined);
  await cutButton.click();

  const afterTool = await activeTool(page);
  const restoredCount = await page.locator('.hiddenCutRange').count();
  return {
    active,
    created: hiddenCutCount > 0,
    restored: hiddenCutCount > 0 && restoredCount === 0,
    activeToolStable: beforeTool === afterTool,
  };
}

async function captureViewport(page, path) {
  await page.screenshot({ path, fullPage: false, timeout: 10000 });
}

async function restoreFullSource(page) {
  const beforeTool = await activeTool(page);
  const track = await requiredBox(page.locator('[data-timeline-lane="screen"] .laneTrack'), 'screen lane track');
  const clipBefore = await requiredBox(page.locator('[data-timeline-lane="screen"] .clipBar'), 'trimmed screen clip');
  const hiddenStartVisible = await page.locator('button[aria-label="Restore hidden start"]').count() > 0;
  const hiddenEndVisible = await page.locator('button[aria-label="Restore hidden end"]').count() > 0;
  const restore = page.locator('button[aria-label="Restore full source"]');
  if (await restore.count() > 0) await restore.click();
  await page.waitForFunction((trackWidth) => {
    const clip = document.querySelector('[data-timeline-lane="screen"] .clipBar');
    if (!(clip instanceof HTMLElement)) return false;
    return Math.abs(clip.getBoundingClientRect().width - trackWidth) < 8;
  }, track.width, { timeout: 10000 }).catch(() => undefined);
  const clipAfter = await requiredBox(page.locator('[data-timeline-lane="screen"] .clipBar'), 'restored screen clip');
  const afterTool = await activeTool(page);
  return {
    hiddenControlsVisible: hiddenStartVisible || hiddenEndVisible,
    restored: clipAfter.width > clipBefore.width + 6 && Math.abs(clipAfter.width - track.width) < 8,
    activeToolStable: beforeTool === afterTool,
    before: { x: clipBefore.x, width: clipBefore.width },
    after: { x: clipAfter.x, width: clipAfter.width },
    track: { x: track.x, width: track.width },
  };
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

async function assertWheelStable(page, scrubber, box) {
  const before = await scrubber.inputValue();
  await scrubber.focus();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(250);
  const after = await scrubber.inputValue();
  return { stable: before === after, before, after };
}

async function assertRangeWheelStable(page) {
  const input = page.locator('label:has-text("Padding") input[type="range"]').first();
  const box = await requiredBox(input, 'padding range');
  const before = await input.inputValue();
  await input.focus();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(250);
  const after = await input.inputValue();
  return { stable: before === after, before, after };
}

async function timelineCoordinates(page) {
  return page.evaluate(() => {
    const scrubber = document.querySelector('input[aria-label="Scrub timeline"]');
    const track = document.querySelector('[data-timeline-lane="screen"] .laneTrack');
    const clip = document.querySelector('[data-timeline-lane="screen"] .clipBar');
    const playhead = document.querySelector('.playhead');
    if (!(scrubber instanceof HTMLElement) || !(track instanceof HTMLElement) || !(clip instanceof HTMLElement) || !(playhead instanceof HTMLElement)) {
      return { scrubberMatchesTrack: false, playheadWithinTrack: false, clipLeftAnchored: false, reason: 'missing-element' };
    }
    const scrubberRect = scrubber.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const clipRect = clip.getBoundingClientRect();
    const playheadRect = playhead.getBoundingClientRect();
    return {
      scrubberMatchesTrack: Math.abs(scrubberRect.x - trackRect.x) < 3 && Math.abs(scrubberRect.width - trackRect.width) < 3,
      playheadWithinTrack: playheadRect.left >= trackRect.left - 3 && playheadRect.left <= trackRect.right + 3,
      clipLeftAnchored: Math.abs(clipRect.left - trackRect.left) < 3,
      scrubber: { x: scrubberRect.x, width: scrubberRect.width },
      track: { x: trackRect.x, width: trackRect.width },
      clip: { x: clipRect.x, width: clipRect.width },
      playhead: { x: playheadRect.x, width: playheadRect.width },
    };
  });
}

async function activeTool(page) {
  return page.evaluate(() => document.querySelector('.toolButton.active')?.getAttribute('aria-label') ?? null);
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} bounding box was unavailable.`);
  return box;
}

function summarizeFailure(path, result) {
  return {
    reportPath: path,
    activeTool: result.activeTool,
    wheel: result.wheel,
    rangeWheel: result.rangeWheel,
    coordinateBefore: result.coordinateBefore,
    coordinateAfter: result.coordinateAfter,
    trimEnd: { ...result.trimEnd, monitor: undefined },
    trimStart: { ...result.trimStart, monitor: undefined },
    cutTool: result.cutTool,
    recovery: result.recovery,
    scrubBadFrameCount: result.scrubMonitor.badFrames.length,
    trimEndBadFrameCount: result.trimEndMonitor.badFrames.length,
    trimStartBadFrameCount: result.trimStartMonitor.badFrames.length,
    firstScrubBadFrames: result.scrubMonitor.badFrames.slice(0, 5),
    firstTrimEndBadFrames: result.trimEndMonitor.badFrames.slice(0, 5),
    firstTrimStartBadFrames: result.trimStartMonitor.badFrames.slice(0, 5),
  };
}

function buildFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc2=size=960x540:rate=30',
    `drawtext=fontfile=${font}:text='TIMELINE INTERACTION TEST':fontcolor=white:fontsize=40:x=40:y=40:box=1:boxcolor=0x00000099`,
    'drawbox=x=40:y=420:w=120:h=80:color=0xff0000:t=fill',
    'drawbox=x=420:y=420:w=120:h=80:color=0x00ff00:t=fill',
    'drawbox=x=800:y=420:w=120:h=80:color=0x0000ff:t=fill',
  ].join(',');
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

function createCanvasMonitor() {
  const state = { running: false, rafId: 0, frameCount: 0, badFrames: [], worstFrames: [] };

  function readCanvasColorStats() {
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) return { saturation: 0, contrast: 0, darkRatio: 1, grayRatio: 1, ok: false, reason: 'missing-canvas' };
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { saturation: 0, contrast: 0, darkRatio: 1, grayRatio: 1, ok: false, reason: 'missing-context' };
    const sampleWidth = Math.min(220, canvas.width);
    const sampleHeight = Math.min(124, canvas.height);
    const data = context.getImageData(Math.floor((canvas.width - sampleWidth) / 2), Math.floor((canvas.height - sampleHeight) / 2), sampleWidth, sampleHeight).data;
    let saturation = 0;
    let minLuma = 255;
    let maxLuma = 0;
    let dark = 0;
    let gray = 0;
    const pixels = data.length / 4;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
      saturation += Math.max(red, green, blue) - Math.min(red, green, blue);
      if (luma < 16) dark += 1;
      if (Math.abs(red - green) < 5 && Math.abs(green - blue) < 5) gray += 1;
    }
    const stats = { saturation: saturation / pixels, contrast: maxLuma - minLuma, darkRatio: dark / pixels, grayRatio: gray / pixels };
    const looksBad = stats.saturation < 12 || stats.contrast < 20 || stats.darkRatio > 0.96 || stats.grayRatio > 0.9;
    return { ...stats, ok: !looksBad, reason: looksBad ? 'gray-or-blank' : null };
  }

  function sample(now) {
    if (!state.running) return;
    const video = document.querySelector('video');
    const stats = readCanvasColorStats();
    const frame = {
      index: state.frameCount,
      now,
      stats,
      video: video ? { currentTime: video.currentTime, readyState: video.readyState, seeking: video.seeking, paused: video.paused } : null,
    };
    state.frameCount += 1;
    state.worstFrames.push(frame);
    state.worstFrames.sort((a, b) => (a.stats.contrast + a.stats.saturation) - (b.stats.contrast + b.stats.saturation));
    state.worstFrames = state.worstFrames.slice(0, 20);
    if (!stats.ok) state.badFrames.push(frame);
    state.rafId = requestAnimationFrame(sample);
  }

  return {
    start() {
      state.running = true;
      state.frameCount = 0;
      state.badFrames = [];
      state.worstFrames = [];
      state.rafId = requestAnimationFrame(sample);
    },
    inspect() {
      return { stats: readCanvasColorStats() };
    },
    stop() {
      state.running = false;
      cancelAnimationFrame(state.rafId);
      return { frameCount: state.frameCount, badFrames: state.badFrames, worstFrames: state.worstFrames };
    },
  };
}
