import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-visual-timeline-sync-'));
const mediaPath = join(root, 'timeline-sync-source.mp4');
const reportPath = join(root, 'visual-timeline-sync-report.json');
const screenshots = {
  recordingMoved: join(root, 'recording-moved.png'),
  nleMoved: join(root, 'nle-moved.png'),
  recordingGap: join(root, 'recording-gap.png'),
  nleGap: join(root, 'nle-gap.png'),
  recordingTrimmed: join(root, 'recording-trimmed.png'),
  nleAfterRecordingTrim: join(root, 'nle-after-recording-trim.png'),
  nleTrimmed: join(root, 'nle-trimmed.png'),
  recordingAfterNleTrim: join(root, 'recording-after-nle-trim.png'),
  failure: join(root, 'failure.png'),
};

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
let project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + 6000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: 30,
});
project = await saveProjectFile(project.path, movedScreenClip(project.document));

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
let page;
try {
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.addScriptTag({ content: `window.__timelineSyncReadCanvasStats = (${readCanvasStats.toString()});` });

  await openRecordingEdit(page);
  await waitForPreviewReady(page);
  await seekRecordingRatio(page, 0.02);
  await page.waitForFunction(() => {
    const stats = window.__timelineSyncReadCanvasStats();
    return stats.darkRatio > 0.9 && stats.saturation < 8;
  }, null, { timeout: 10000 });
  await captureViewport(page, screenshots.recordingGap);
  const recordingGap = await readRecordingState(page);

  await seekRecordingRatio(page, 0.28);
  await page.waitForFunction(() => window.__timelineSyncReadCanvasStats().ok, null, { timeout: 10000 });
  const recordingMoved = await readRecordingState(page);
  await captureViewport(page, screenshots.recordingMoved);

  await openNle(page);
  await waitForPreviewReady(page);
  const nleAfterRecordingSeek = await readNleState(page);
  await seekNleRatio(page, 0.02);
  await page.waitForFunction(() => {
    const stats = window.__timelineSyncReadCanvasStats();
    return stats.darkRatio > 0.9 && stats.saturation < 8;
  }, null, { timeout: 10000 });
  await captureViewport(page, screenshots.nleGap);
  const nleGap = await readNleState(page);

  await seekNleRatio(page, 0.28);
  await page.waitForFunction(() => window.__timelineSyncReadCanvasStats().ok, null, { timeout: 10000 });
  const nleMoved = await readNleState(page);
  await captureViewport(page, screenshots.nleMoved);

  await openRecordingEdit(page);
  const recordingAfterNleSeek = await readRecordingState(page);
  const recordingTrimBefore = recordingAfterNleSeek;
  await dragRecordingTrimEnd(page, 0.70);
  const recordingTrimmed = await readRecordingState(page);
  await captureViewport(page, screenshots.recordingTrimmed);

  await openNle(page);
  const nleAfterRecordingTrim = await readNleState(page);
  await captureViewport(page, screenshots.nleAfterRecordingTrim);

  await selectFirstNleClip(page);
  const nleTrimBefore = await readNleState(page);
  await dragNleTrimStart(page, 0.32);
  const nleTrimmed = await readNleState(page);
  await captureViewport(page, screenshots.nleTrimmed);

  await openRecordingEdit(page);
  const recordingAfterNleTrim = await readRecordingState(page);
  await captureViewport(page, screenshots.recordingAfterNleTrim);

  report = {
    ok: movedStateMatches(recordingMoved, nleMoved)
      && isGapCanvasStats(recordingGap.canvas)
      && isGapCanvasStats(nleGap.canvas)
      && playheadRatioMatches(recordingMoved, nleAfterRecordingSeek)
      && playheadRatioMatches(nleMoved, recordingAfterNleSeek)
      && trimChanged(recordingTrimBefore, recordingTrimmed, 'end')
      && statesMatch(recordingTrimmed, nleAfterRecordingTrim)
      && trimChanged(nleTrimBefore, nleTrimmed, 'start')
      && statesMatch(nleTrimmed, recordingAfterNleTrim),
    root,
    projectPath: project.path,
    screenshots,
    recordingGap,
    nleGap,
    recordingMoved,
    nleAfterRecordingSeek,
    nleMoved,
    recordingAfterNleSeek,
    recordingTrimBefore,
    recordingTrimmed,
    nleAfterRecordingTrim,
    nleTrimBefore,
    nleTrimmed,
    recordingAfterNleTrim,
  };
  if (!report.ok) failure = new Error(`Timeline sync visual regression failed: ${JSON.stringify(summarizeFailure(reportPath, report))}`);
} catch (err) {
  if (page) await captureViewport(page, screenshots.failure).catch(() => undefined);
  const diagnostic = await page?.evaluate(() => {
    const scrubber = document.querySelector('input[aria-label="Scrub timeline"]');
    const playhead = document.querySelector('.nlePlayhead');
    const target = window;
    return {
      recordingScrubber: scrubber instanceof HTMLInputElement
        ? { value: Number(scrubber.value), max: Number(scrubber.max), ratio: Number(scrubber.max) > 0 ? Number(scrubber.value) / Number(scrubber.max) : null }
        : null,
      nlePlayheadLeft: playhead instanceof HTMLElement ? playhead.style.left : null,
      canvas: typeof window.__timelineSyncReadCanvasStats === 'function' ? window.__timelineSyncReadCanvasStats() : null,
      view: document.querySelector('[data-ui-region="nle-workspace"]') ? 'nle' : document.querySelector('[data-ui-region="editor-workspace"]') ? 'recording' : 'unknown',
      canvasDrawCount: target.__roughCutCanvasDrawCount ?? null,
      timelinePlaybackDebug: target.__roughCutTimelinePlaybackDebug ?? null,
      playbackDebugCounts: target.__roughCutPlaybackDebugCounts ?? null,
      playbackDebugTail: Array.isArray(target.__roughCutPlaybackDebugLog)
        ? target.__roughCutPlaybackDebugLog.slice(-8)
        : null,
    };
  }).catch(() => null);
  failure = err;
  report = {
    ok: false,
    root,
    projectPath: project.path,
    screenshots,
    error: err instanceof Error ? err.message : String(err),
    diagnostic,
  };
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
  movedMatch: report?.recordingMoved && report?.nleMoved ? movedStateMatches(report.recordingMoved, report.nleMoved) : false,
  nlePreservedRecordingPlayhead: report?.recordingMoved && report?.nleAfterRecordingSeek ? playheadRatioMatches(report.recordingMoved, report.nleAfterRecordingSeek) : false,
  recordingPreservedNlePlayhead: report?.nleMoved && report?.recordingAfterNleSeek ? playheadRatioMatches(report.nleMoved, report.recordingAfterNleSeek) : false,
  recordingGapDark: report?.recordingGap?.canvas?.darkRatio ?? null,
  nleGapDark: report?.nleGap?.canvas?.darkRatio ?? null,
  recordingTrimChanged: report?.recordingTrimBefore && report?.recordingTrimmed ? trimChanged(report.recordingTrimBefore, report.recordingTrimmed, 'end') : false,
  nleMatchesRecordingTrim: report?.recordingTrimmed && report?.nleAfterRecordingTrim ? statesMatch(report.recordingTrimmed, report.nleAfterRecordingTrim) : false,
  nleTrimChanged: report?.nleTrimBefore && report?.nleTrimmed ? trimChanged(report.nleTrimBefore, report.nleTrimmed, 'start') : false,
  recordingMatchesNleTrim: report?.nleTrimmed && report?.recordingAfterNleTrim ? statesMatch(report.nleTrimmed, report.recordingAfterNleTrim) : false,
}, null, 2));
if (failure) throw failure;

async function openRecordingEdit(page) {
  await dismissPreRecordOverlay(page);
  await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Recording edit"]').click({ force: true }).catch(() => undefined);
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
  await page.waitForSelector('[data-timeline-lane="screen"] .clipBar', { timeout: 15000 });
}

async function openNle(page) {
  await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Editor"]').click({ force: true });
  await page.waitForSelector('[data-ui-region="nle-workspace"]', { timeout: 15000 });
  await page.waitForSelector('[data-ui-region="nle-timeline"] .nleClipBlock', { timeout: 15000 });
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

async function waitForPreviewReady(page) {
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    return video instanceof HTMLVideoElement && video.readyState >= 2 && canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
  }, null, { timeout: 15000 });
}

async function seekRecordingRatio(page, ratio) {
  const track = await requiredBox(page.locator('[data-timeline-lane="screen"] .laneTrack'), 'recording screen lane');
  const ruler = await requiredBox(page.locator('.timelineRuler'), 'recording timeline ruler');
  await page.mouse.click(track.x + track.width * ratio, ruler.y + ruler.height / 2);
  await page.waitForTimeout(350);
}

async function seekNleRatio(page, ratio) {
  const ruler = await requiredBox(page.locator('[data-ui-region="nle-time-ruler"]'), 'NLE time ruler');
  await page.mouse.click(ruler.x + ruler.width * ratio, ruler.y + ruler.height / 2);
  await page.waitForTimeout(350);
}

async function dragRecordingTrimEnd(page, targetRatio) {
  const handle = page.locator('button[aria-label="Trim end"]');
  const handleBox = await requiredBox(handle, 'recording trim end');
  const track = await requiredBox(page.locator('[data-timeline-lane="screen"] .laneTrack'), 'recording screen lane');
  await handle.dragTo(page.locator('[data-timeline-lane="screen"] .laneTrack'), {
    sourcePosition: { x: handleBox.width / 2, y: handleBox.height / 2 },
    targetPosition: { x: track.width * targetRatio, y: handleBox.y + handleBox.height / 2 - track.y },
  });
  await page.waitForTimeout(700);
}

async function selectFirstNleClip(page) {
  await page.locator('[data-ui-region="nle-timeline"] .nleClipBlock').first().click({ force: true });
  await page.waitForSelector('button[aria-label="Trim selected clip start"]', { timeout: 5000 });
}

async function dragNleTrimStart(page, targetRatio) {
  const handle = page.locator('button[aria-label="Trim selected clip start"]');
  const handleBox = await requiredBox(handle, 'NLE trim start');
  const bodies = page.locator('[data-ui-region="nle-lane-bodies"]');
  const bodyBox = await requiredBox(bodies, 'NLE lane bodies');
  await handle.dragTo(bodies, {
    sourcePosition: { x: handleBox.width / 2, y: handleBox.height / 2 },
    targetPosition: { x: bodyBox.width * targetRatio, y: handleBox.y + handleBox.height / 2 - bodyBox.y },
  });
  await page.waitForTimeout(700);
}

async function readRecordingState(page) {
  return page.evaluate(() => {
    const track = document.querySelector('[data-timeline-lane="screen"] .laneTrack');
    const clip = document.querySelector('[data-timeline-lane="screen"] .clipBar');
    const scrubber = document.querySelector('input[aria-label="Scrub timeline"]');
    return {
      view: 'recording',
      clip: rectState(clip, track),
      playhead: scrubber instanceof HTMLInputElement ? Number(scrubber.value) : null,
      playheadRatio: scrubber instanceof HTMLInputElement && Number(scrubber.max) > 0 ? Number(scrubber.value) / Number(scrubber.max) : null,
      canvas: window.__timelineSyncReadCanvasStats(),
    };
    function rectState(element, parent) {
      if (!(element instanceof HTMLElement) || !(parent instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const base = parent.getBoundingClientRect();
      return {
        leftPct: ((rect.left - base.left) / base.width) * 100,
        widthPct: (rect.width / base.width) * 100,
      };
    }
  });
}

async function readNleState(page) {
  return page.evaluate(() => {
    const body = document.querySelector('[data-ui-region="nle-lane-bodies"] .nleTrackLaneBody[data-track-kind="video"]');
    const clip = body?.querySelector('.nleClipBlock');
    const playhead = document.querySelector('.nlePlayhead');
    const timecode = document.querySelector('.nleTransportTimeCurrent')?.textContent ?? null;
    return {
      view: 'nle',
      clip: rectState(clip, body),
      playheadRatio: playheadRatio(playhead),
      timecode,
      canvas: window.__timelineSyncReadCanvasStats(),
    };
    function rectState(element, parent) {
      if (!(element instanceof HTMLElement) || !(parent instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const base = parent.getBoundingClientRect();
      return {
        leftPct: ((rect.left - base.left) / base.width) * 100,
        widthPct: (rect.width / base.width) * 100,
      };
    }
    function playheadRatio(element) {
      if (!(element instanceof HTMLElement)) return null;
      const left = Number.parseFloat(element.style.left);
      return Number.isFinite(left) ? left / 100 : null;
    }
  });
}

function movedScreenClip(document) {
  const recordingAsset = document.assets.find((asset) => asset.type === 'recording');
  if (!recordingAsset) throw new Error('Fixture did not create a recording asset.');
  const mediaId = `source:${recordingAsset.id}:screen`;
  const offsetClip = (clip) => ({
    ...clip,
    timelineIn: 30,
    timelineOut: 150,
    sourceIn: 60,
    sourceOut: 180,
  });
  const tracks = document.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => clip.mediaId === mediaId
      ? offsetClip(clip)
      : clip),
  }));
  const compositionTracks = document.composition.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => clip.assetId === recordingAsset.id
      ? offsetClip(clip)
      : clip),
  }));
  return {
    ...document,
    name: 'timeline-sync-source-offset-gap',
    composition: { ...document.composition, duration: 180, tracks: compositionTracks },
    timeline: { ...document.timeline, tracks },
  };
}

function statesMatch(left, right, tolerance = 3) {
  return Boolean(left?.clip && right?.clip)
    && Math.abs(left.clip.leftPct - right.clip.leftPct) <= tolerance
    && Math.abs(left.clip.widthPct - right.clip.widthPct) <= tolerance;
}

function movedStateMatches(left, right) {
  return statesMatch(left, right) && (left?.clip?.leftPct ?? 0) > 8 && (left?.clip?.widthPct ?? 100) < 90;
}

function isGapCanvasStats(stats) {
  return (stats?.darkRatio ?? 0) > 0.9 && (stats?.saturation ?? Infinity) < 8;
}

function playheadRatioMatches(left, right, tolerance = 0.04) {
  return Number.isFinite(left?.playheadRatio)
    && Number.isFinite(right?.playheadRatio)
    && Math.abs(left.playheadRatio - right.playheadRatio) <= tolerance;
}

function trimChanged(before, after, edge) {
  if (!before?.clip || !after?.clip) return false;
  const minDeltaPct = 3;
  if (edge === 'start') return after.clip.leftPct > before.clip.leftPct + minDeltaPct && after.clip.widthPct < before.clip.widthPct - minDeltaPct;
  return after.clip.widthPct < before.clip.widthPct - minDeltaPct;
}

function summarizeFailure(path, result) {
  return {
    reportPath: path,
    movedMatch: result.recordingMoved && result.nleMoved ? movedStateMatches(result.recordingMoved, result.nleMoved) : false,
    nlePreservedRecordingPlayhead: result.recordingMoved && result.nleAfterRecordingSeek ? playheadRatioMatches(result.recordingMoved, result.nleAfterRecordingSeek) : false,
    recordingPreservedNlePlayhead: result.nleMoved && result.recordingAfterNleSeek ? playheadRatioMatches(result.nleMoved, result.recordingAfterNleSeek) : false,
    recordingGap: result.recordingGap,
    nleGap: result.nleGap,
    nleAfterRecordingSeek: result.nleAfterRecordingSeek,
    recordingAfterNleSeek: result.recordingAfterNleSeek,
    recordingTrimBefore: result.recordingTrimBefore,
    recordingTrimmed: result.recordingTrimmed,
    nleAfterRecordingTrim: result.nleAfterRecordingTrim,
    nleTrimBefore: result.nleTrimBefore,
    nleTrimmed: result.nleTrimmed,
    recordingAfterNleTrim: result.recordingAfterNleTrim,
  };
}

async function captureViewport(page, path) {
  await page.screenshot({ path, fullPage: false, timeout: 10000 });
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} bounding box was unavailable.`);
  return box;
}

function readCanvasStats() {
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return { ok: false, reason: 'missing-canvas', saturation: 0, contrast: 0, darkRatio: 1 };
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { ok: false, reason: 'missing-context', saturation: 0, contrast: 0, darkRatio: 1 };
  const sampleWidth = Math.min(240, canvas.width);
  const sampleHeight = Math.min(140, canvas.height);
  const data = context.getImageData(Math.floor((canvas.width - sampleWidth) / 2), Math.floor((canvas.height - sampleHeight) / 2), sampleWidth, sampleHeight).data;
  let saturation = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let dark = 0;
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
  }
  const stats = { saturation: saturation / pixels, contrast: maxLuma - minLuma, darkRatio: dark / pixels };
  return { ...stats, ok: stats.saturation > 4 && stats.contrast > 10 && stats.darkRatio < 0.98 };
}

function buildFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc2=size=960x540:rate=30',
    `drawtext=fontfile=${font}:text='TIMELINE SYNC':fontcolor=white:fontsize=44:x=40:y=40:box=1:boxcolor=0x00000099`,
    'drawbox=x=40:y=410:w=140:h=90:color=0xff0000:t=fill',
    'drawbox=x=410:y=410:w=140:h=90:color=0x00ff00:t=fill',
    'drawbox=x=780:y=410:w=140:h=90:color=0x0000ff:t=fill',
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
