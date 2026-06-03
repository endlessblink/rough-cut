import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-playback-timeline-'));
const mediaPath = join(root, 'playback-source.mp4');
const reportPath = join(root, 'playback-report.json');
const externalProjectPath = process.env.ROUGH_CUT_PLAYBACK_PROJECT_PATH || '';
const requiredAdvanceSec = Math.max(0.2, Number(process.env.ROUGH_CUT_PLAYBACK_ADVANCE_SEC ?? 2));
const seekStartSec = Math.max(0, Number(process.env.ROUGH_CUT_PLAYBACK_SEEK_SEC ?? 0));
const probeView = process.env.ROUGH_CUT_PLAYBACK_VIEW || 'both';
const playbackScreenshotPath = process.env.ROUGH_CUT_PLAYBACK_SCREENSHOT_PATH || '';

await mkdir(root, { recursive: true });
let projectPath = externalProjectPath;
if (!projectPath) {
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    buildPlaybackFilter(),
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
  const stoppedAt = new Date(startedAt.getTime() + 6000);
  let project = await saveProjectForRecording({
    startedAt: startedAt.toISOString(),
    stoppedAt: stoppedAt.toISOString(),
    rawPath: mediaPath,
    outputPath: mediaPath,
    width: 960,
    height: 540,
    fps: 30,
  });
  project = await saveProjectFile(project.path, offsetScreenClip(project.document));
  projectPath = project.path;
}

const recordingResult = probeView === 'nle'
  ? { ok: true, skipped: true, reason: 'ROUGH_CUT_PLAYBACK_VIEW=nle' }
  : await runPlaybackProbe({ view: 'recording', projectPath });
const nleResult = probeView === 'recording'
  ? { ok: true, skipped: true, reason: 'ROUGH_CUT_PLAYBACK_VIEW=recording' }
  : await runPlaybackProbe({ view: 'nle', projectPath });
const report = {
  ok: recordingResult.ok && nleResult.ok,
  root,
  projectPath,
  recording: recordingResult,
  nle: nleResult,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({
  ok: report.ok,
  reportPath,
  root,
  projectPath,
  recording: summarizeResult(recordingResult),
  nle: summarizeResult(nleResult),
}, null, 2));

if (!report.ok) {
  throw new Error(`Timeline playback regression failed: ${JSON.stringify({ reportPath, root, recording: summarizeResult(recordingResult), nle: summarizeResult(nleResult) })}`);
}

async function runPlaybackProbe({ view, projectPath }) {
  const { _electron: electron } = loadPlaywright();
  const electronPath = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['--no-sandbox', '--force-color-profile=srgb', '.'],
    cwd: join(process.cwd(), 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    },
  });
  const electronProcess = app.process();
  let page = null;
  try {
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    if (view === 'nle') {
      await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
      await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Editor"]').click({ force: true });
      await page.waitForSelector('[data-ui-region="nle-workspace"]', { timeout: 15000 });
    } else {
      await dismissPreRecordOverlay(page);
      await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
    }
    await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
    await page.addScriptTag({ content: `
      window.__roughCutReadCanvasStats = (${readCanvasStats.toString()});
      window.__roughCutReadPlaybackState = (${readPlaybackState.toString()});
      window.__roughCutCreatePlaybackMonitor = (${createPlaybackMonitor.toString()});
      window.__roughCutPlaybackProof = (${playbackProof.toString()});
      window.__roughCutPlaybackRequiredAdvanceSec = ${JSON.stringify(requiredAdvanceSec)};
    ` });
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video instanceof HTMLVideoElement && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0;
    }, null, { timeout: 15000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.styledPreviewCanvas');
      return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
    }, null, { timeout: 15000 });
    if (view === 'recording' && seekStartSec > 0) {
      await page.evaluate((value) => {
        const input = document.querySelector('.timelineScrubber');
        if (!(input instanceof HTMLInputElement)) throw new Error('Missing recording timeline scrubber for seek probe.');
        const max = Number(input.max);
        const targetTime = Math.max(0, Math.min(value, Number.isFinite(max) && max > 0 ? max : value));
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(input, String(targetTime));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      }, seekStartSec);
      await page.waitForFunction((value) => {
        const video = document.querySelector('video');
        return video instanceof HTMLVideoElement && Math.abs(video.currentTime - value) < 1;
      }, seekStartSec, { timeout: 7000 });
    }
    if (view === 'nle' && seekStartSec > 0) {
      const ratio = await page.evaluate((value) => {
        const video = document.querySelector('video');
        const duration = video instanceof HTMLVideoElement && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : value;
        return Math.max(0, Math.min(1, value / Math.max(0.1, duration)));
      }, seekStartSec);
      const ruler = page.locator('[data-ui-region="nle-time-ruler"]');
      const box = await ruler.boundingBox();
      if (!box) throw new Error('Missing NLE time ruler for seek probe.');
      await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
      await page.waitForFunction((value) => {
        const video = document.querySelector('video');
        return video instanceof HTMLVideoElement && Math.abs(video.currentTime - value) < 1;
      }, seekStartSec, { timeout: 7000 });
    }

    const pausedState = await page.evaluate(() => window.__roughCutReadPlaybackState());
    const pausedScreenshotPath = screenshotPathForViewState(view, 'paused');
    if (pausedScreenshotPath) {
      await mkdir(dirname(pausedScreenshotPath), { recursive: true });
      await page.screenshot({ path: pausedScreenshotPath });
    }
    if (view === 'nle') await page.locator('[data-ui-region="nle-transport"] button[aria-label="Play"]').click();
    else await page.locator('.videoControls .transportButton').click();
    const transitionScreenshotPath = screenshotPathForViewState(view, 'transition');
    if (transitionScreenshotPath) {
      await page.waitForTimeout(40);
      await page.screenshot({ path: transitionScreenshotPath });
    }
    const before = await page.evaluate(() => window.__roughCutReadPlaybackState());
    await page.evaluate(() => {
      window.__roughCutPlaybackInitialState = window.__roughCutReadPlaybackState();
      window.__roughCutPlaybackMonitor = window.__roughCutCreatePlaybackMonitor();
      window.__roughCutPlaybackMonitor.start();
    });
    await page.waitForFunction((initial) => {
      const monitor = window.__roughCutPlaybackMonitor?.inspect();
      return window.__roughCutPlaybackProof(initial, monitor?.latest ?? monitor?.best ?? window.__roughCutReadPlaybackState(), window.__roughCutPlaybackRequiredAdvanceSec).ok;
    }, before, { timeout: playbackWaitTimeoutMs(requiredAdvanceSec) });
    const screenshotPath = screenshotPathForViewState(view, 'active');
    if (screenshotPath) {
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath });
    }
    const after = await page.evaluate(() => {
      const stopped = window.__roughCutPlaybackMonitor?.stop();
      return stopped?.latest ?? stopped?.best ?? window.__roughCutReadPlaybackState();
    });
    return {
      ok: windowPlaybackProof(before, after, requiredAdvanceSec).ok && cameraGeometryProof(pausedState, after).ok,
      proof: windowPlaybackProof(before, after, requiredAdvanceSec),
      cameraGeometry: cameraGeometryProof(pausedState, after),
      screenshotPath: screenshotPath || null,
      pausedScreenshotPath: pausedScreenshotPath || null,
      transitionScreenshotPath: transitionScreenshotPath || null,
      pausedState,
      before,
      after,
    };
  } catch (err) {
    const diagnostic = await page?.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video')).map((video) => ({
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        readyState: video.readyState,
      }));
      return {
        videos,
        playbackState: typeof window.__roughCutReadPlaybackState === 'function' ? window.__roughCutReadPlaybackState() : null,
        playButtonLabel: document.querySelector('[data-ui-region="nle-transport"] button')?.getAttribute('aria-label') ?? null,
      };
    }).catch(() => null);
    return {
      ok: false,
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
}

function offsetScreenClip(document) {
  const recordingAsset = document.assets.find((asset) => asset.type === 'recording');
  if (!recordingAsset) throw new Error('Fixture did not create a recording asset.');
  const mediaId = `source:${recordingAsset.id}:screen`;
  const tracks = document.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => clip.mediaId === mediaId
      ? {
          ...clip,
          timelineIn: 30,
          timelineOut: 120,
          sourceIn: 60,
          sourceOut: 150,
        }
      : clip),
  }));
  return {
    ...document,
    name: 'playback-source-offset-gap',
    composition: {
      ...document.composition,
      duration: 150,
    },
    timeline: {
      ...document.timeline,
      tracks,
    },
  };
}

function createPlaybackMonitor() {
  let rafId = 0;
  let running = false;
  let best = null;
  let latest = null;
  let lastMs = 0;
  let frames = 0;
  let slowFrames = 0;
  let maxFrameDeltaMs = 0;

  function sample(nowMs = performance.now()) {
    if (lastMs > 0) {
      const delta = nowMs - lastMs;
      maxFrameDeltaMs = Math.max(maxFrameDeltaMs, delta);
      if (delta > 40) slowFrames += 1;
    }
    lastMs = nowMs;
    frames += 1;
    latest = window.__roughCutReadPlaybackState();
    const proof = window.__roughCutPlaybackProof?.(window.__roughCutPlaybackInitialState, latest, window.__roughCutPlaybackRequiredAdvanceSec);
    if (proof?.ok || latest?.nativeActive || latest?.canvas?.ok) {
      if (!best || latest.drawCount > best.drawCount || (latest.nativeActive && !best.nativeActive)) best = latest;
    }
    if (running) rafId = window.requestAnimationFrame(sample);
  }

  return {
    start() {
      if (running) return;
      running = true;
      sample();
    },
    inspect() {
      return { best, latest: latest ? { ...latest, frameMonitor: { frames, slowFrames, maxFrameDeltaMs } } : latest };
    },
    stop() {
      running = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      return {
        best: best ? { ...best, frameMonitor: { frames, slowFrames, maxFrameDeltaMs } } : best,
        latest: latest ? { ...latest, frameMonitor: { frames, slowFrames, maxFrameDeltaMs } } : latest,
      };
    },
  };
}

function playbackProof(before, after, requiredAdvanceSec = 0.2) {
  const screen = after?.videos?.[0] ?? null;
  const initialScreen = before?.videos?.find((video) => video.index === screen?.index) ?? before?.videos?.[0] ?? null;
  const camera = after?.videos?.[1] ?? null;
  const initialCamera = before?.videos?.find((video) => video.index === camera?.index) ?? before?.videos?.[1] ?? null;
  const screenAdvanced = screen && initialScreen ? screen.currentTime - initialScreen.currentTime : 0;
  const cameraAdvanced = camera && initialCamera ? camera.currentTime - initialCamera.currentTime : 0;
  const minAdvance = Number.isFinite(requiredAdvanceSec) && requiredAdvanceSec > 0 ? requiredAdvanceSec : 0.2;
  const nativeActive = Boolean(after?.nativeActive);
  const canvasOk = Boolean(after?.canvas?.ok && after.canvas.visible);
  const compositorOk = nativeActive ? canvasOk : canvasOk && after.drawCount > before.drawCount;
  const screenOk = Boolean(screen?.readyState >= 2 && screenAdvanced > minAdvance);
  const cameraOk = !after.hasCamera || Boolean(camera?.readyState >= 2 && cameraAdvanced > minAdvance);
  const frameMonitorOk = (after?.frameMonitor?.slowFrames ?? 0) <= Math.max(2, Math.ceil((after?.frameMonitor?.frames ?? 0) * 0.03));
  const playbackOk = screenOk && cameraOk && frameMonitorOk;

  return {
    ok: playbackOk && (compositorOk || screenAdvanced > minAdvance),
    mode: nativeActive ? 'native-over-canvas' : 'video-advanced',
    canvasOk,
    compositorOk,
    screenOk,
    cameraOk,
    frameMonitorOk,
    drawDelta: after.drawCount - before.drawCount,
    screenAdvanced,
    cameraAdvanced,
    nativeActive,
    frameMonitor: after.frameMonitor ?? null,
  };
}

function readPlaybackState() {
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  const canvasRect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
  const canvasCameraRect = window.__roughCutCanvasCameraRect && canvasRect
    ? {
        x: canvasRect.x + window.__roughCutCanvasCameraRect.x * canvasRect.width,
        y: canvasRect.y + window.__roughCutCanvasCameraRect.y * canvasRect.height,
        width: window.__roughCutCanvasCameraRect.w * canvasRect.width,
        height: window.__roughCutCanvasCameraRect.h * canvasRect.height,
      }
    : null;
  const videos = Array.from(document.querySelectorAll('video')).map((video, index) => {
    const rect = video.getBoundingClientRect();
    const style = window.getComputedStyle(video);
    return {
      index,
      className: video.className,
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      readyState: video.readyState,
      seeking: video.seeking,
      playbackRate: video.playbackRate,
      visible: rect.width > 20 && rect.height > 20 && style.opacity !== '0' && style.visibility !== 'hidden',
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
  const video = videos[0];
  return {
    videoTime: video ? video.currentTime : -1,
    videoPaused: video ? video.paused : null,
    videos,
    hasCamera: videos.length > 1,
    nativeActive: Boolean(document.querySelector('.nativePlaybackActive')),
    nativePhase: Array.from(document.querySelector('.styledPreview')?.classList ?? []).find((name) => name.startsWith('nativePlaybackPhase-')) ?? null,
    canvasCameraRect,
    drawCount: window.__roughCutCanvasDrawCount ?? 0,
    timecode: document.querySelector('.nleTransportTimeCurrent')?.textContent
      ?? document.querySelector('.videoControls .timecode')?.textContent
      ?? null,
    canvas: window.__roughCutReadCanvasStats(),
  };
}

function readCanvasStats() {
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return { ok: false, reason: 'missing-canvas', visible: false, saturation: 0, contrast: 0, darkRatio: 1 };
  }
  const rect = canvas.getBoundingClientRect();
  const style = window.getComputedStyle(canvas);
  const visible = rect.width > 20 && rect.height > 20 && style.opacity !== '0' && style.visibility !== 'hidden';
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { ok: false, reason: 'missing-context', visible, saturation: 0, contrast: 0, darkRatio: 1 };
  const sampleWidth = Math.min(240, canvas.width);
  const sampleHeight = Math.min(140, canvas.height);
  const startX = Math.floor((canvas.width - sampleWidth) / 2);
  const startY = Math.floor((canvas.height - sampleHeight) / 2);
  const data = context.getImageData(startX, startY, sampleWidth, sampleHeight).data;
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
  const stats = {
    saturation: saturation / pixels,
    contrast: maxLuma - minLuma,
    darkRatio: dark / pixels,
  };
  return {
    ...stats,
    visible,
    ok: stats.saturation > 4 && stats.contrast > 10 && stats.darkRatio < 0.98,
  };
}

function summarizeResult(result) {
  return {
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    error: result.error,
    beforeVideoTime: result.before?.videoTime,
    afterVideoTime: result.after?.videoTime,
    beforeDrawCount: result.before?.drawCount,
    afterDrawCount: result.after?.drawCount,
    afterCanvas: result.after?.canvas,
    proof: result.proof,
    cameraGeometry: result.cameraGeometry,
    screenshotPath: result.screenshotPath,
    pausedScreenshotPath: result.pausedScreenshotPath,
    transitionScreenshotPath: result.transitionScreenshotPath,
    timecode: result.after?.timecode,
  };
}

function screenshotPathForView(view) {
  if (!playbackScreenshotPath) return '';
  if (playbackScreenshotPath.includes('{view}')) {
    return playbackScreenshotPath.replaceAll('{view}', view);
  }
  if (probeView === 'both') {
    return playbackScreenshotPath.replace(/\.png$/i, `-${view}.png`);
  }
  return playbackScreenshotPath;
}

function screenshotPathForViewState(view, state) {
  const activePath = screenshotPathForView(view);
  if (!activePath) return '';
  if (state === 'active') return activePath;
  if (activePath.includes('{state}')) return activePath.replaceAll('{state}', state);
  return activePath.replace(/\.png$/i, `-${state}.png`);
}

function cameraGeometryProof(before, after) {
  if (!after?.hasCamera) return { ok: true, skipped: true, reason: 'no-camera' };
  const beforeRect = before?.canvasCameraRect ?? null;
  const afterRect = after?.videos?.find((video) => String(video.className).includes('nativeCameraPlaybackSurface'))?.rect ?? null;
  if (!beforeRect || !afterRect) {
    return { ok: false, reason: 'missing-camera-rect', beforeRect, afterRect };
  }
  const dx = Math.abs(beforeRect.x - afterRect.x);
  const dy = Math.abs(beforeRect.y - afterRect.y);
  const dw = Math.abs(beforeRect.width - afterRect.width);
  const dh = Math.abs(beforeRect.height - afterRect.height);
  const maxDeltaPx = Math.max(dx, dy, dw, dh);
  return {
    ok: maxDeltaPx <= 1.5,
    beforeRect,
    afterRect,
    maxDeltaPx,
  };
}

function playbackWaitTimeoutMs(requiredSeconds) {
  const seconds = Number.isFinite(requiredSeconds) && requiredSeconds > 0 ? requiredSeconds : 2;
  return Math.ceil((seconds + 12) * 1000);
}

function windowPlaybackProof(before, after, requiredAdvanceSec) {
  return playbackProof(before, after, requiredAdvanceSec);
}

function buildPlaybackFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc2=size=960x540:rate=30',
    `drawtext=fontfile=${font}:text='TIMELINE CLOCK':fontcolor=white:fontsize=44:x=40:y=40:box=1:boxcolor=0x00000099`,
    'drawbox=x=40:y=410:w=140:h=90:color=0xff0000:t=fill',
    'drawbox=x=410:y=410:w=140:h=90:color=0x00ff00:t=fill',
    'drawbox=x=780:y=410:w=140:h=90:color=0x0000ff:t=fill',
  ].join(',');
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    try {
      return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
    } catch {
      // Fall back to npm's global root for machines that do not use the
      // default user-global install path used by this workstation.
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

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}
