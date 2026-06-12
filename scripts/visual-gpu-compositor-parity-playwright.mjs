import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { createDefaultRecordingPresentation } from '../packages/project-model/dist/index.js';
import { acquireGpuPlaywrightLock } from './gpu-playwright-lock.mjs';

const SAMPLE_WIDTH = 320;
const SAMPLE_HEIGHT = 180;
const FPS = 30;
const forceBlankWebgl = process.env.ROUGH_CUT_GPU_COMPOSITOR_FORCE_BLANK === '1';
const root = await mkdtemp(join(tmpdir(), 'rough-cut-gpu-compositor-'));
const mediaPath = join(root, 'gpu-compositor-source.mp4');
const cameraPath = join(root, 'gpu-compositor-camera.mp4');
const reportPath = join(root, 'gpu-compositor-report.json');
const logPath = join(root, 'gpu-compositor.log');
const latestLogPath = join(tmpdir(), 'rough-cut-gpu-compositor-latest.log');

const cases = [
  { id: 'gap-start', timeSec: 0.2, contentExpected: false },
  { id: 'cut-boundary', timeSec: 1.02, contentExpected: true },
  { id: 'zoom-in', timeSec: 2.45, contentExpected: true },
  { id: 'zoom-hold-cursor-visible', timeSec: 3.05, contentExpected: true },
  { id: 'zoom-out-cursor-offscreen', timeSec: 4.25, contentExpected: true },
  { id: 'camera-pip-present', timeSec: 3.4, contentExpected: true },
];

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildScreenFilter(),
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:sample_rate=48000',
  '-t',
  '6',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-shortest',
  '-movflags',
  '+faststart',
  mediaPath,
]);
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildCameraFilter(),
  '-t',
  '6',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  cameraPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
let project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + 6000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: FPS,
  audio: { source: 'fixture-sine', sampleRate: 48000 },
  camera: {
    rawPath: cameraPath,
    outputPath: cameraPath,
    width: 320,
    height: 240,
    fps: FPS,
    sourceInFrames: 0,
    devicePath: 'fixture-camera',
  },
});
project = await saveProjectFile(project.path, withProbePresentation(project.document));

const gpuHarnessLock = await acquireGpuPlaywrightLock('visual:gpu-compositor');
let canvas2d;
let webgl;
let webgpu;
try {
  canvas2d = await captureRenderer({ kind: 'canvas2d', projectPath: project.path });
  webgl = await captureRenderer({ kind: 'webgl', projectPath: project.path });
  webgpu = await captureRenderer({ kind: 'webgpu', projectPath: project.path });
} finally {
  await gpuHarnessLock.release();
}
const comparisons = [
  ...cases.filter((item) => item.contentExpected).map((item) => (
    compareCase(item, 'canvas2d', 'webgl', canvas2d.captures[item.id], webgl.captures[item.id])
  )),
  ...cases.filter((item) => item.contentExpected).map((item) => (
    compareCase(item, 'webgl', 'webgpu', webgl.captures[item.id], webgpu.captures[item.id])
  )),
];
const problems = [
  ...canvas2d.problems,
  ...webgl.problems,
  ...webgpu.problems,
  ...comparisons.flatMap((comparison) => comparison.problems.map((problem) => `${comparison.id}: ${problem}`)),
];
const report = {
  ok: problems.length === 0,
  root,
  reportPath,
  projectPath: project.path,
  forcedBlankWebgl: forceBlankWebgl,
  cases,
  canvas2d: summarizeRun(canvas2d),
  webgl: summarizeRun(webgl),
  webgpu: summarizeRun(webgpu),
  comparisons,
  problems,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const textLog = renderTextLog(report);
await writeFile(logPath, textLog, 'utf8');
await writeFile(latestLogPath, textLog, 'utf8');
console.info(JSON.stringify({
  ok: report.ok,
  root,
  reportPath,
  logPath,
  latestLogPath,
  forcedBlankWebgl: forceBlankWebgl,
  canvas2d: report.canvas2d,
  webgl: report.webgl,
  webgpu: report.webgpu,
  comparisons: comparisons.map(({ id, meanAbsDiff, changedPixelRatio, maxChannelDiff, ok }) => ({
    id,
    ok,
    meanAbsDiff,
    changedPixelRatio,
    maxChannelDiff,
  })),
  problems,
}, null, 2));

if (!report.ok) {
  throw new Error(`GPU compositor parity probe failed: ${JSON.stringify({ reportPath, problems })}`);
}

async function captureRenderer({ kind, projectPath }) {
  const { _electron: electron } = loadPlaywright();
  const app = await electron.launch({
    executablePath: join(process.cwd(), 'apps/desktop/node_modules/.bin/electron'),
    args: ['--no-sandbox', '--force-color-profile=srgb', '.'],
    cwd: join(process.cwd(), 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
      ROUGH_CUT_SCREEN_LAYER_RENDERER: kind,
      VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER: kind,
      ...(kind === 'webgl' ? { ROUGH_CUT_WEBGL_SCREEN_LAYER: '1', VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER: '1' } : {}),
      ...(kind === 'webgpu' ? { ROUGH_CUT_WEBGPU_SCREEN_LAYER: '1', VITE_ROUGH_CUT_WEBGPU_SCREEN_LAYER: '1' } : {}),
    },
  });
  const electronProcess = app.process();
  const captures = {};
  const problems = [];
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await dismissPreRecordOverlay(page);
    await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
    await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      const canvas = document.querySelector('canvas.styledPreviewCanvas');
      return video instanceof HTMLVideoElement
        && video.readyState >= 2
        && Number.isFinite(video.duration)
        && video.duration > 0
        && canvas instanceof HTMLCanvasElement
        && canvas.width > 0
        && canvas.height > 0;
    }, null, { timeout: 15000 });

    for (const item of cases) {
      if (kind === 'canvas2d') {
        await seekRecordingTime(page, item.timeSec);
        await page.waitForTimeout(350);
      } else {
        await seekRecordingTime(page, Math.max(0, item.timeSec - 0.12));
        await playUntilRecordingTime(page, item.timeSec, kind);
      }
      const screenshotPath = join(root, `${kind}-${item.id}.png`);
      await screenshotPreviewCanvas(page, kind, screenshotPath);
      const captureState = await page.evaluate(readGpuCompositorProbeState, {
        label: item.id,
      });
      const pixels = kind === 'webgl' && forceBlankWebgl
        ? new Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4).fill(0)
        : readScreenshotPixels(screenshotPath, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const capture = {
        ...captureState,
        sampleSize: { width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT },
        pixels,
        canvasStats: canvasStatsFromPixels(pixels),
      };
      captures[item.id] = { ...capture, screenshotPath };
      if (capture.renderer?.requestedRendererKind !== kind) {
        problems.push(`${kind}/${item.id}: requested renderer was ${capture.renderer?.requestedRendererKind ?? 'unknown'}`);
      }
      if (kind === 'webgl' && capture.renderer?.rendererKind !== 'webgl' && !capture.renderer?.fallbackReason) {
        problems.push(`${kind}/${item.id}: WebGL did not render and no fallback reason was reported`);
      }
      if (kind === 'webgpu' && capture.renderer?.rendererKind !== 'webgpu' && !capture.renderer?.fallbackReason) {
        problems.push(`${kind}/${item.id}: WebGPU did not render and no fallback reason was reported`);
      }
      if (item.contentExpected && !capture.canvasStats.ok) {
        problems.push(`${kind}/${item.id}: content frame looks blank or gray (${JSON.stringify(capture.canvasStats)})`);
      }
      if (kind !== 'canvas2d') await pausePreviewPlayback(page);
    }
  } catch (err) {
    problems.push(`${kind}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await Promise.race([
      app.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (!electronProcess.killed) electronProcess.kill();
  }
  return { kind, captures, problems };
}

async function seekRecordingTime(page, timeSec) {
  await page.locator('input[aria-label="Scrub timeline"]').evaluate((input, value) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('Recording scrubber is not an input.');
    const max = Number(input.max);
    const next = Math.max(0, Math.min(Number.isFinite(max) && max > 0 ? max : value, value));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, timeSec);
  await page.waitForTimeout(120);
}

async function playUntilRecordingTime(page, timeSec, kind) {
  await startPreviewPlayback(page);
  await page.waitForFunction(({ targetSec, rendererKind }) => {
    const video = document.querySelector('video');
    if (!(video instanceof HTMLVideoElement) || video.paused || video.currentTime < targetSec) return false;
    const renderer = window.__roughCutScreenLayerRenderer;
    if (rendererKind === 'webgpu') {
      return renderer?.rendererKind === 'webgpu' && renderer?.contextStatus === 'available';
    }
    if (rendererKind === 'webgl') {
      return renderer?.rendererKind === 'webgl' && renderer?.contextStatus === 'available';
    }
    return true;
  }, { targetSec: timeSec, rendererKind: kind }, { timeout: 5000 });
  await page.waitForTimeout(50);
}

async function startPreviewPlayback(page) {
  const videoPlaying = await page.evaluate(() => {
    const video = document.querySelector('video');
    return video instanceof HTMLVideoElement && !video.paused;
  });
  if (videoPlaying) return;
  await page.locator('.videoControls .transportButton').first().click();
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video instanceof HTMLVideoElement && !video.paused;
  }, null, { timeout: 3000 });
}

async function pausePreviewPlayback(page) {
  const videoPlaying = await page.evaluate(() => {
    const video = document.querySelector('video');
    return video instanceof HTMLVideoElement && !video.paused;
  });
  if (!videoPlaying) return;
  await page.locator('.videoControls .transportButton').first().click();
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return video instanceof HTMLVideoElement && video.paused;
  }, null, { timeout: 3000 }).catch(() => undefined);
}

async function screenshotPreviewCanvas(page, kind, screenshotPath) {
  const selector = kind === 'canvas2d'
    ? 'canvas.styledPreviewCanvas'
    : 'canvas.styledPreviewAcceleratedCanvas.isActive, canvas.styledPreviewWebglCanvas.isActive';
  await page.locator(selector).first().screenshot({ path: screenshotPath, timeout: 15000 });
}

function compareCase(item, baselineKind, targetKind, baselineCapture, targetCapture) {
  const problems = [];
  const id = `${targetKind}/${item.id}`;
  if (!baselineCapture || !targetCapture) {
    return { id, targetKind, caseId: item.id, ok: false, meanAbsDiff: null, maxChannelDiff: null, changedPixelRatio: null, problems: ['missing capture'] };
  }
  const baselinePixels = baselineCapture.pixels ?? [];
  const targetPixels = targetCapture.pixels ?? [];
  if (baselinePixels.length !== targetPixels.length || baselinePixels.length === 0) {
    return { id, targetKind, caseId: item.id, ok: false, meanAbsDiff: null, maxChannelDiff: null, changedPixelRatio: null, problems: ['pixel buffer size mismatch'] };
  }
  let absTotal = 0;
  let maxChannelDiff = 0;
  let changedPixels = 0;
  const pixels = baselinePixels.length / 4;
  for (let index = 0; index < baselinePixels.length; index += 4) {
    const dr = Math.abs((baselinePixels[index] ?? 0) - (targetPixels[index] ?? 0));
    const dg = Math.abs((baselinePixels[index + 1] ?? 0) - (targetPixels[index + 1] ?? 0));
    const db = Math.abs((baselinePixels[index + 2] ?? 0) - (targetPixels[index + 2] ?? 0));
    absTotal += dr + dg + db;
    const max = Math.max(dr, dg, db);
    maxChannelDiff = Math.max(maxChannelDiff, max);
    if (max > 8) changedPixels += 1;
  }
  const meanAbsDiff = absTotal / Math.max(1, pixels * 3);
  const changedPixelRatio = changedPixels / Math.max(1, pixels);
  const changedPixelRatioLimit = targetKind === 'webgpu' ? 0.6 : 0.35;
  if (item.contentExpected && !targetCapture.canvasStats.ok) problems.push(`${targetKind} content frame failed canvas visibility stats`);
  if (meanAbsDiff > 30) problems.push(`mean abs diff too high (${meanAbsDiff.toFixed(2)})`);
  if (changedPixelRatio > changedPixelRatioLimit) problems.push(`changed pixel ratio too high (${changedPixelRatio.toFixed(3)})`);
  return {
    id,
    baselineKind,
    targetKind,
    caseId: item.id,
    ok: problems.length === 0,
    meanAbsDiff: round(meanAbsDiff),
    maxChannelDiff,
    changedPixelRatio: round(changedPixelRatio),
    baselineStats: baselineCapture.canvasStats,
    targetStats: targetCapture.canvasStats,
    baselineScreenshotPath: baselineCapture.screenshotPath,
    targetScreenshotPath: targetCapture.screenshotPath,
    renderer: targetCapture.renderer,
    problems,
  };
}

function summarizeRun(run) {
  return {
    kind: run.kind,
    problems: run.problems,
    captures: Object.fromEntries(Object.entries(run.captures).map(([id, capture]) => [id, {
      screenshotPath: capture.screenshotPath,
      canvasStats: capture.canvasStats,
      renderer: capture.renderer,
      playbackDebug: capture.playbackDebug,
    }])),
  };
}

function renderTextLog(report) {
  const lines = [
    `GPU compositor parity probe`,
    `ok=${report.ok}`,
    `forcedBlankWebgl=${report.forcedBlankWebgl}`,
    `root=${report.root}`,
    `projectPath=${report.projectPath}`,
    `reportPath=${report.reportPath}`,
    `logPath=${logPath}`,
    `latestLogPath=${latestLogPath}`,
    '',
    'comparisons:',
  ];
  for (const item of report.comparisons) {
    lines.push([
      `- ${item.id}`,
      `ok=${item.ok}`,
      `meanAbsDiff=${item.meanAbsDiff}`,
      `changedPixelRatio=${item.changedPixelRatio}`,
      `maxChannelDiff=${item.maxChannelDiff}`,
      `${item.baselineKind}=${item.baselineScreenshotPath}`,
      `${item.targetKind}=${item.targetScreenshotPath}`,
    ].join(' '));
    for (const problem of item.problems) lines.push(`  problem=${problem}`);
  }
  lines.push('', 'renderer:');
  for (const [kind, run] of Object.entries({ canvas2d: report.canvas2d, webgl: report.webgl, webgpu: report.webgpu })) {
    lines.push(`- ${kind} problems=${JSON.stringify(run.problems)}`);
    for (const [id, capture] of Object.entries(run.captures)) {
      lines.push(`  ${id} screenshot=${capture.screenshotPath} stats=${JSON.stringify(capture.canvasStats)} renderer=${JSON.stringify(capture.renderer)}`);
    }
  }
  lines.push('', 'problems:');
  if (report.problems.length === 0) {
    lines.push('- none');
  } else {
    for (const problem of report.problems) lines.push(`- ${problem}`);
  }
  return `${lines.join('\n')}\n`;
}

function withProbePresentation(document) {
  const recordingAsset = document.assets.find((asset) => asset.type === 'recording' && !asset.metadata?.isCamera);
  if (!recordingAsset) throw new Error('Fixture did not create a recording asset.');
  const mediaId = `source:${recordingAsset.id}:screen`;
  const tracks = document.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => clip.mediaId === mediaId
      ? {
          ...clip,
          timelineIn: 30,
          timelineOut: 150,
          sourceIn: 60,
          sourceOut: 180,
        }
      : clip),
  }));
  const presentation = recordingAsset.presentation ?? createDefaultRecordingPresentation();
  return {
    ...document,
    name: 'gpu-compositor-parity',
    assets: document.assets.map((asset) => asset.id === recordingAsset.id
      ? {
          ...asset,
          metadata: {
            ...(asset.metadata ?? {}),
            cursorEvents: [
              { frame: 62, x: 140, y: 130, type: 'move', button: 0 },
              { frame: 90, x: 560, y: 330, type: 'move', button: 0 },
              { frame: 92, x: 560, y: 330, type: 'down', button: 0 },
              { frame: 96, x: 560, y: 330, type: 'up', button: 0 },
              { frame: 126, x: 1300, y: -120, type: 'move', button: 0 },
            ],
          },
          presentation: {
            ...presentation,
            zoom: {
              ...presentation.zoom,
              followCursor: false,
              markers: [
                ...(Array.isArray(presentation.zoom?.markers) ? presentation.zoom.markers : []),
                {
                  id: 'gpu-compositor-parity-zoom',
                  startFrame: 72,
                  endFrame: 132,
                  kind: 'manual',
                  strength: 0.82,
                  focalPoint: { x: 0.62, y: 0.58 },
                  zoomInDuration: 18,
                  zoomOutDuration: 18,
                  followCursor: false,
                },
              ],
            },
          },
        }
      : asset),
    composition: {
      ...document.composition,
      duration: 180,
    },
    timeline: {
      ...document.timeline,
      tracks,
    },
  };
}

function readGpuCompositorProbeState({ label }) {
  const gpuCanvas = document.querySelector('canvas.styledPreviewAcceleratedCanvas.isActive, canvas.styledPreviewWebglCanvas.isActive');
  const canvas = gpuCanvas instanceof HTMLCanvasElement ? gpuCanvas : document.querySelector('canvas.styledPreviewCanvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return {
      label,
      renderer: window.__roughCutScreenLayerRenderer ?? null,
      playbackDebug: summarizePlaybackDebug(),
    };
  }
  return {
    label,
    renderer: window.__roughCutScreenLayerRenderer ?? null,
    playbackDebug: summarizePlaybackDebug(),
  };

  function summarizePlaybackDebug() {
    const log = Array.isArray(window.__roughCutPlaybackDebugLog) ? window.__roughCutPlaybackDebugLog : [];
    const frameGaps = log.filter((entry) => entry?.event === 'render-frame-gap');
    const expectedDisplayGaps = log.filter((entry) => entry?.event === 'render-expected-display-gap');
    const drawCosts = log.filter((entry) => entry?.event === 'render-draw-cost');
    return {
      counts: window.__roughCutPlaybackDebugCounts ?? {},
      frameGapCount: frameGaps.length,
      maxFrameGap: frameGaps.reduce((max, entry) => Math.max(max, Number(entry?.deltaMs) || 0), 0),
      expectedDisplayGapCount: expectedDisplayGaps.length,
      maxExpectedDisplayGap: expectedDisplayGaps.reduce((max, entry) => Math.max(max, Number(entry?.expectedGapMs) || 0), 0),
      drawCostCount: drawCosts.length,
      maxDrawCost: drawCosts.reduce((max, entry) => Math.max(max, Number(entry?.totalDrawMs) || 0), 0),
      rendererStats: window.__roughCutScreenLayerRenderer ?? null,
    };
  }
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

function buildScreenFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc2=size=960x540:rate=30',
    'drawbox=x=0:y=0:w=960:h=70:color=0xff3355:t=fill',
    'drawbox=x=0:y=470:w=960:h=70:color=0x2563eb:t=fill',
    `drawtext=fontfile=${font}:text='TOP EDGE':fontcolor=white:fontsize=34:x=400:y=18:box=1:boxcolor=0x00000099`,
    `drawtext=fontfile=${font}:text='BOTTOM EDGE':fontcolor=white:fontsize=34:x=360:y=488:box=1:boxcolor=0x00000099`,
    `drawtext=fontfile=${font}:text='GPU PARITY':fontcolor=white:fontsize=44:x=40:y=40:box=1:boxcolor=0x00000099`,
    'drawbox=x=40:y=410:w=140:h=90:color=0xff0000:t=fill',
    'drawbox=x=410:y=410:w=140:h=90:color=0x00ff00:t=fill',
    'drawbox=x=780:y=410:w=140:h=90:color=0x0000ff:t=fill',
  ].join(',');
}

function buildCameraFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc=size=320x240:rate=30',
    'drawbox=x=0:y=0:w=320:h=40:color=0xff3355:t=fill',
    'drawbox=x=0:y=200:w=320:h=40:color=0x2563eb:t=fill',
    `drawtext=fontfile=${font}:text='CAM TOP':fontcolor=white:fontsize=20:x=96:y=8:box=1:boxcolor=0x00000099`,
    `drawtext=fontfile=${font}:text='CAM BOTTOM':fontcolor=white:fontsize=20:x=76:y=208:box=1:boxcolor=0x00000099`,
    `drawtext=fontfile=${font}:text='CAMERA':fontcolor=white:fontsize=34:x=28:y=28:box=1:boxcolor=0x00000099`,
    'drawbox=x=110:y=86:w=100:h=82:color=0x2563eb:t=fill',
    'drawbox=x=142:y=114:w=36:h=36:color=0xffffff:t=fill',
  ].join(',');
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    try {
      return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
    } catch {
      // Fall through to npm global root.
    }
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function readScreenshotPixels(screenshotPath, width, height) {
  const result = spawnSync('magick', [
    screenshotPath,
    '-resize',
    `${width}x${height}!`,
    'rgba:-',
  ], { encoding: 'buffer', maxBuffer: width * height * 4 + 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`magick failed to decode ${screenshotPath}: ${result.stderr?.toString('utf8') ?? ''}`);
  }
  const expectedLength = width * height * 4;
  if (result.stdout.length !== expectedLength) {
    throw new Error(`magick returned ${result.stdout.length} bytes for ${screenshotPath}; expected ${expectedLength}`);
  }
  return Array.from(result.stdout);
}

function canvasStatsFromPixels(data) {
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
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    saturation += chroma;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    if (luma < 16) dark += 1;
    if (chroma < 5 && luma > 24 && luma < 232) gray += 1;
  }
  const stats = {
    saturation: saturation / Math.max(1, pixels),
    contrast: maxLuma - minLuma,
    darkRatio: dark / Math.max(1, pixels),
    grayRatio: gray / Math.max(1, pixels),
  };
  return {
    ...stats,
    ok: stats.saturation > 4 && stats.contrast > 10 && stats.darkRatio < 0.98 && stats.grayRatio < 0.98,
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
