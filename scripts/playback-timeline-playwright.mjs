import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { createDefaultRecordingPresentation } from '../packages/project-model/dist/index.js';
import { acquireGpuPlaywrightLock } from './gpu-playwright-lock.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-playback-timeline-'));
const mediaPath = join(root, 'playback-source.mp4');
const cameraPath = join(root, 'playback-camera.mp4');
const reportPath = join(root, 'playback-report.json');
const externalProjectPath = process.env.ROUGH_CUT_PLAYBACK_PROJECT_PATH || '';
const requiredAdvanceSec = Math.max(0.2, Number(process.env.ROUGH_CUT_PLAYBACK_ADVANCE_SEC ?? 2));
const seekStartSec = Math.max(0, Number(process.env.ROUGH_CUT_PLAYBACK_SEEK_SEC ?? 0));
const probeView = process.env.ROUGH_CUT_PLAYBACK_VIEW || 'both';
const playbackScreenshotPath = process.env.ROUGH_CUT_PLAYBACK_SCREENSHOT_PATH || '';
const stressPlaybackFixture = process.env.ROUGH_CUT_PLAYBACK_STRESS === '1';
const expectedScreenLayerRenderer = normalizeExpectedRenderer(process.env.ROUGH_CUT_EXPECT_SCREEN_LAYER_RENDERER || '');
const expectWebgpuMotionBlur = process.env.ROUGH_CUT_EXPECT_WEBGPU_MOTION_BLUR === '1' || stressPlaybackFixture;
const playbackCorrectnessOnly = process.env.ROUGH_CUT_PLAYBACK_CORRECTNESS_ONLY === '1';
const playbackProbeRetryCount = Math.max(0, Number(process.env.ROUGH_CUT_PLAYBACK_PROBE_RETRIES ?? 1));

await mkdir(root, { recursive: true });
let projectPath = externalProjectPath;
if (!projectPath) {
  run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    buildPlaybackFilter(),
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
    buildCameraPlaybackFilter(),
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
  const stoppedAt = new Date(startedAt.getTime() + 6000);
  let project = await saveProjectForRecording({
    startedAt: startedAt.toISOString(),
    stoppedAt: stoppedAt.toISOString(),
    rawPath: mediaPath,
    outputPath: mediaPath,
    width: 960,
    height: 540,
    fps: 30,
    audio: { source: 'fixture-sine', sampleRate: 48000 },
    camera: {
      rawPath: cameraPath,
      outputPath: cameraPath,
      width: 320,
      height: 240,
      fps: 30,
      sourceInFrames: 0,
      devicePath: 'fixture-camera',
    },
  });
  project = await saveProjectFile(project.path, offsetScreenClip(project.document));
  projectPath = project.path;
}
const projectDocument = JSON.parse(await readFile(projectPath, 'utf8'));
const expectedHasScreenAudio = projectHasScreenAudio(projectDocument);

const gpuHarnessLock = await acquireGpuPlaywrightLock('playback:timeline');
let recordingResult;
let nleResult;
try {
  recordingResult = probeView === 'nle'
    ? { ok: true, skipped: true, reason: 'ROUGH_CUT_PLAYBACK_VIEW=nle' }
    : await runPlaybackProbeWithRetry({ view: 'recording', projectPath });
  nleResult = probeView === 'recording'
    ? { ok: true, skipped: true, reason: 'ROUGH_CUT_PLAYBACK_VIEW=recording' }
    : await runPlaybackProbeWithRetry({ view: 'nle', projectPath });
} finally {
  await gpuHarnessLock.release();
}
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

async function runPlaybackProbeWithRetry({ view, projectPath }) {
  const attempts = [];
  const maxAttempts = playbackProbeRetryCount + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runPlaybackProbe({ view, projectPath });
    attempts.push({
      attempt,
      ok: result.ok,
      error: result.error ?? null,
      proofOk: result.proof?.ok ?? null,
      rendererExpectationOk: result.rendererExpectation?.ok ?? null,
      activePlaybackDebugOk: result.activePlaybackDebug?.ok ?? null,
    });
    if (result.ok || attempt === maxAttempts) {
      return {
        ...result,
        retry: {
          attempts,
          retryCount: attempt - 1,
          maxRetries: playbackProbeRetryCount,
        },
      };
    }
  }
  return {
    ok: false,
    error: 'playback-probe-retry-loop-exhausted',
    retry: { attempts, retryCount: maxAttempts - 1, maxRetries: playbackProbeRetryCount },
  };
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
      ROUGH_CUT_WEBGL_MOTION_BLUR: expectWebgpuMotionBlur ? '1' : process.env.ROUGH_CUT_WEBGL_MOTION_BLUR,
      VITE_ROUGH_CUT_WEBGL_MOTION_BLUR: expectWebgpuMotionBlur ? '1' : process.env.VITE_ROUGH_CUT_WEBGL_MOTION_BLUR,
    },
  });
  const electronProcess = app.process();
  let page = null;
  const webglConsoleLog = [];
  const webgpuConsoleLog = [];
  try {
    page = await app.firstWindow();
    page.on('console', (message) => {
      const text = message.text();
      if (text.includes('[rough-cut:webgl-renderer]')) {
        webglConsoleLog.push({ type: message.type(), text });
        if (webglConsoleLog.length > 160) webglConsoleLog.shift();
      }
      if (text.includes('[rough-cut:webgpu-renderer]')) {
        webgpuConsoleLog.push({ type: message.type(), text });
        if (webgpuConsoleLog.length > 160) webgpuConsoleLog.shift();
      }
    });
    await page.waitForLoadState('domcontentloaded');
    if (view === 'nle') {
      await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
      await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Editor"]').click({ force: true });
      await page.waitForSelector('[data-ui-region="nle-workspace"]', { timeout: 15000 });
    } else {
      await dismissPreRecordOverlay(page);
      await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
    }
    await page.evaluate(() => {
      window.__roughCutPlaybackProbeStartedAtMs = performance.now();
    });
    await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
    await page.addScriptTag({ content: `
      window.__roughCutSelectPlaybackVideos = (${selectPlaybackVideoElements.toString()});
      window.__roughCutSelectPlaybackVideoElement = (${selectPlaybackVideoElement.toString()});
      window.__roughCutReadCanvasStats = (${readCanvasStats.toString()});
      window.__roughCutReadPlaybackDebug = (${readPlaybackDebug.toString()});
      window.__roughCutReadPlaybackState = (${readPlaybackState.toString()});
      window.__roughCutCreatePlaybackMonitor = (${createPlaybackMonitor.toString()});
      window.__roughCutPlaybackProof = (${playbackProof.toString()});
      window.__roughCutPlaybackRequiredAdvanceSec = ${JSON.stringify(requiredAdvanceSec)};
      window.__roughCutPlaybackCorrectnessOnly = ${JSON.stringify(playbackCorrectnessOnly)};
      window.__roughCutExpectedHasScreenAudio = ${JSON.stringify(expectedHasScreenAudio)};
    ` });
    await page.waitForFunction(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const hiddenSources = videos.filter((item) => String(item.className ?? '').split(/\s+/).includes('hiddenSource'));
      const programVideos = hiddenSources.length > 0
        ? hiddenSources
        : videos.filter((item) => {
          const classNames = String(item.className ?? '').split(/\s+/);
          return !classNames.includes('ev2MediaThumbVideo') && !classNames.includes('ev2SourceVideo');
        });
      const video = programVideos[0] ?? videos[0] ?? null;
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
        const video = window.__roughCutSelectPlaybackVideoElement?.() ?? document.querySelector('video');
        return video instanceof HTMLVideoElement && Math.abs(video.currentTime - value) < 1;
      }, seekStartSec, { timeout: 7000 });
    }
    if (view === 'nle' && seekStartSec > 0) {
      const ratio = await page.evaluate((value) => {
        const video = window.__roughCutSelectPlaybackVideoElement?.() ?? document.querySelector('video');
        const duration = video instanceof HTMLVideoElement && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : value;
        return Math.max(0, Math.min(1, value / Math.max(0.1, duration)));
      }, seekStartSec);
      const ruler = page.locator('[data-ui-region="nle-time-ruler"]');
      const box = await ruler.boundingBox();
      if (!box) throw new Error('Missing NLE time ruler for seek probe.');
      await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
      await page.waitForFunction((value) => {
        const video = window.__roughCutSelectPlaybackVideoElement?.() ?? document.querySelector('video');
        return video instanceof HTMLVideoElement
          && video.readyState >= 2
          && video.currentTime >= Math.max(0, value - 1)
          && video.currentTime <= value + 3;
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
    await page.waitForTimeout(150);
    const clickedZoomRegionDuringPlayback = await clickZoomRegionDuringPlayback(page, view);
    await page.waitForTimeout(150);
    const clickedPreviewCanvasDuringPlayback = await clickPreviewCanvasDuringPlayback(page);
    await page.waitForFunction((initial) => {
      const monitor = window.__roughCutPlaybackMonitor?.inspect();
      const latest = monitor?.latest ?? window.__roughCutReadPlaybackState();
      const best = monitor?.best ?? null;
      return window.__roughCutPlaybackProof(initial, latest, window.__roughCutPlaybackRequiredAdvanceSec).ok
        || (best ? window.__roughCutPlaybackProof(initial, best, window.__roughCutPlaybackRequiredAdvanceSec).ok : false);
    }, before, { timeout: playbackWaitTimeoutMs(requiredAdvanceSec) });
    const screenshotPath = screenshotPathForViewState(view, 'active');
    if (screenshotPath) {
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath });
    }
    const screenshotArtifacts = await collectScreenshotArtifacts({
      active: screenshotPath,
      paused: pausedScreenshotPath,
      transition: transitionScreenshotPath,
    });
    const screenshotProof = screenshotArtifactProof(screenshotArtifacts);
    const after = await page.evaluate(() => {
      const stopped = window.__roughCutPlaybackMonitor?.stop();
      const latest = stopped?.latest ?? window.__roughCutReadPlaybackState();
      const best = stopped?.best ?? null;
      if (best && window.__roughCutPlaybackProof(window.__roughCutPlaybackInitialState, best, window.__roughCutPlaybackRequiredAdvanceSec).ok) return best;
      return latest;
    });
    const proof = windowPlaybackProof(before, after, requiredAdvanceSec);
    const cameraGeometry = cameraGeometryProof(pausedState, after);
    const rendererExpectation = rendererExpectationProof(after);
    const activePlaybackDebug = activePlaybackDebugProof(after);
    const probeStartedAtMs = typeof after?.probeStartedAtMs === 'number' ? after.probeStartedAtMs : 0;
    const webgpuLifecycle = webgpuLifecycleProof(after, webgpuConsoleLog, probeStartedAtMs);
    const webgpuBackgroundUploads = webgpuBackgroundUploadProof(before, after, webgpuConsoleLog, probeStartedAtMs);
    const webgpuMotionBlur = webgpuMotionBlurProof(after, webgpuConsoleLog, probeStartedAtMs);
    return {
      ok: proof.ok && cameraGeometry.ok && rendererExpectation.ok && activePlaybackDebug.ok && webgpuLifecycle.ok && webgpuBackgroundUploads.ok && webgpuMotionBlur.ok && screenshotProof.ok,
      proof,
      cameraGeometry,
      rendererExpectation,
      activePlaybackDebug,
      webgpuLifecycle,
      webgpuBackgroundUploads,
      webgpuMotionBlur,
      screenshotProof,
      screenshotArtifacts,
      screenshotPath: screenshotPath || null,
      pausedScreenshotPath: pausedScreenshotPath || null,
      transitionScreenshotPath: transitionScreenshotPath || null,
      clickedZoomRegionDuringPlayback,
      clickedPreviewCanvasDuringPlayback,
      webglConsoleLog,
      webgpuConsoleLog,
      pausedState,
      before,
      after,
    };
  } catch (err) {
    const diagnostic = await page?.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video')).map((video) => ({
        className: video.className,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        readyState: video.readyState,
        muted: video.muted,
        visible: video.getBoundingClientRect().width > 20 && video.getBoundingClientRect().height > 20,
      }));
      return {
        videos,
        playbackState: typeof window.__roughCutReadPlaybackState === 'function' ? window.__roughCutReadPlaybackState() : null,
        webglRendererLog: Array.isArray(window.__roughCutWebglRendererLog) ? window.__roughCutWebglRendererLog.slice(-160) : [],
        webgpuRendererLog: Array.isArray(window.__roughCutWebgpuRendererLog) ? window.__roughCutWebgpuRendererLog.slice(-160) : [],
        webglRendererInstances: window.__roughCutWebglRendererInstances ?? null,
        webgpuRendererInstances: window.__roughCutWebgpuRendererInstances ?? null,
        playButtonLabel: document.querySelector('[data-ui-region="nle-transport"] button')?.getAttribute('aria-label') ?? null,
      };
    }).catch(() => null);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      webglConsoleLog,
      webgpuConsoleLog,
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
          timelineOut: 150,
          sourceIn: 60,
          sourceOut: 180,
        }
      : clip),
  }));
  return {
    ...document,
    name: 'playback-source-offset-gap',
    assets: document.assets.map((asset) => asset.id === recordingAsset.id
      ? withPlaybackZoomMarker(asset)
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

function withPlaybackZoomMarker(asset) {
  const presentation = asset.presentation ?? createDefaultRecordingPresentation();
  const zoom = presentation.zoom;
  return {
    ...asset,
    presentation: {
      ...presentation,
      zoom: {
        ...zoom,
        followCursor: false,
        markers: [
          ...(Array.isArray(zoom.markers) ? zoom.markers : []),
          {
            id: 'zoom-playback-stutter-regression',
            startFrame: 42,
            endFrame: 132,
            kind: 'manual',
            strength: stressPlaybackFixture ? 0.95 : 0.82,
            focalPoint: { x: 0.62, y: 0.58 },
            zoomInDuration: stressPlaybackFixture ? 54 : 24,
            zoomOutDuration: stressPlaybackFixture ? 54 : 24,
            followCursor: false,
          },
        ],
      },
    },
  };
}

function createPlaybackMonitor() {
  let rafId = 0;
  let running = false;
  let best = null;
  let latest = null;
  let startAtMs = 0;
  let endAtMs = null;
  let lastMs = 0;
  let frames = 0;
  let slowFrames = 0;
  let maxFrameDeltaMs = 0;

  function activePlaybackDebug() {
    return window.__roughCutReadPlaybackDebug?.({
      sinceAtMs: startAtMs,
      untilAtMs: endAtMs ?? performance.now(),
    }) ?? null;
  }

  function withMonitorState(state) {
    if (!state) return state;
    return {
      ...state,
      frameMonitor: { frames, slowFrames, maxFrameDeltaMs },
      activePlaybackWindow: { startAtMs, endAtMs },
      activePlaybackDebug: activePlaybackDebug(),
    };
  }

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
      startAtMs = performance.now();
      endAtMs = null;
      window.__roughCutPlaybackActiveProbeWindow = { startAtMs, endAtMs: null };
      running = true;
      sample();
    },
    inspect() {
      return { best: withMonitorState(best), latest: withMonitorState(latest) };
    },
    stop() {
      running = false;
      endAtMs = performance.now();
      window.__roughCutPlaybackActiveProbeWindow = { startAtMs, endAtMs };
      if (rafId) window.cancelAnimationFrame(rafId);
      latest = window.__roughCutReadPlaybackState();
      return {
        best: withMonitorState(best),
        latest: withMonitorState(latest),
      };
    },
  };
}

function playbackProof(before, after, requiredAdvanceSec = 0.2, options = {}) {
  const correctnessOnly = Boolean(
    options.correctnessOnly
      || (typeof globalThis !== 'undefined' && globalThis.__roughCutPlaybackCorrectnessOnly === true),
  );
  function isProgramPlaybackVideo(video) {
    const classNames = String(video?.className ?? '').split(/\s+/);
    return !classNames.includes('ev2MediaThumbVideo') && !classNames.includes('ev2SourceVideo');
  }

  function selectPlaybackVideos(videos) {
    const hiddenPreviewSources = videos.filter((video) => String(video.className ?? '').split(/\s+/).includes('hiddenSource'));
    if (hiddenPreviewSources.length > 0) return hiddenPreviewSources;
    return videos.filter(isProgramPlaybackVideo);
  }

  const playbackVideos = selectPlaybackVideos(after?.videos ?? []);
  const initialPlaybackVideos = selectPlaybackVideos(before?.videos ?? []);
  const screen = playbackVideos[0] ?? after?.videos?.[0] ?? null;
  const initialScreen = before?.videos?.find((video) => video.index === screen?.index)
    ?? initialPlaybackVideos[0]
    ?? before?.videos?.[0]
    ?? null;
  const camera = playbackVideos[1] ?? null;
  const initialCamera = before?.videos?.find((video) => video.index === camera?.index)
    ?? initialPlaybackVideos[1]
    ?? null;
  const screenAdvanced = screen && initialScreen ? screen.currentTime - initialScreen.currentTime : 0;
  const cameraAdvanced = camera && initialCamera ? camera.currentTime - initialCamera.currentTime : 0;
  const requestedAdvance = Number.isFinite(requiredAdvanceSec) && requiredAdvanceSec > 0 ? requiredAdvanceSec : 0.2;
  const remainingDuration = screen && initialScreen && Number.isFinite(screen.duration)
    ? Math.max(0.2, screen.duration - initialScreen.currentTime - 0.12)
    : requestedAdvance;
  const minAdvance = Math.min(requestedAdvance, remainingDuration);
  const nativeActive = Boolean(after?.nativeActive);
  const canvasOk = Boolean(after?.canvas?.ok && after.canvas.visible);
  const visibleNativeVideos = (after?.videos ?? []).filter((video) => video.visible && isProgramPlaybackVideo(video));
  const compositorOk = !nativeActive && visibleNativeVideos.length === 0 && canvasOk && after.drawCount > before.drawCount;
  const screenOk = Boolean(screen?.readyState >= 2 && screenAdvanced > minAdvance);
  const cameraOk = !after.hasCamera || Boolean(camera?.readyState >= 2 && cameraAdvanced > minAdvance);
  const cameraCanvasOk = !after.hasCamera || Boolean(after.canvasCameraRect && after.canvasCameraRect.width > 8 && after.canvasCameraRect.height > 8);
  const audioOk = !after.hasScreenAudio || Boolean(screen?.audioDecodedByteCount === null || screen.audioDecodedByteCount > (initialScreen?.audioDecodedByteCount ?? -1));
  const drawFramesPerSecond = (after.drawCount - before.drawCount) / Math.max(0.1, screenAdvanced);
  const frameMonitorOk = drawFramesPerSecond >= 12 && (after?.frameMonitor?.maxFrameDeltaMs ?? 0) <= 120;
  const playbackOk = screenOk && cameraOk && cameraCanvasOk && audioOk && (correctnessOnly || frameMonitorOk);
  const expectedDisplayGapOk = correctnessOnly || (after?.playbackDebug?.expectedDisplayGapCount ?? 0) === 0;

  return {
    ok: playbackOk && compositorOk && expectedDisplayGapOk,
    mode: 'canvas-only-rvfc',
    correctnessOnly,
    canvasOk,
    compositorOk,
    screenOk,
    cameraOk,
    cameraCanvasOk,
    audioOk,
    hasScreenAudio: Boolean(after.hasScreenAudio),
    frameMonitorOk,
    expectedDisplayGapOk,
    drawFramesPerSecond,
    drawDelta: after.drawCount - before.drawCount,
    screenAdvanced,
    cameraAdvanced,
    nativeActive,
    visibleNativeVideos: visibleNativeVideos.map((video) => ({ index: video.index, className: video.className, rect: video.rect })),
    frameMonitor: after.frameMonitor ?? null,
  };
}

function webgpuLifecycleProof(state, consoleLog = [], minAtMs = 0) {
  const renderer = state?.screenLayerRenderer ?? null;
  const requestedWebGPU = renderer?.requestedRendererKind === 'webgpu' || renderer?.rendererKind === 'webgpu';
  const combined = collectWebgpuRendererEvents([state], consoleLog, minAtMs);
  const contextCreated = combined.filter((entry) => entry.event === 'context-created');
  const disposedContextCreated = contextCreated.filter((entry) => entry.payload?.disposed === true);
  const staleFallbackContextCreated = contextCreated.filter((entry) => entry.payload?.fallbackReason !== null);
  const activeRegistryContextCreated = Object.values(state?.webgpuRendererInstances ?? {}).filter((entry) => (
    entry?.disposed === false &&
    Number(entry?.contextCreates) > 0 &&
    entry?.fallbackReason === null
  ));
  const activeRendererOk = !requestedWebGPU || (
    renderer?.rendererKind === 'webgpu' &&
    renderer?.contextStatus === 'available' &&
    renderer?.fallbackReason === null
  );
  const contextCreatedOk = !requestedWebGPU || contextCreated.length > 0 || activeRegistryContextCreated.length > 0;
  return {
    ok: activeRendererOk && contextCreatedOk && disposedContextCreated.length === 0 && staleFallbackContextCreated.length === 0,
    requestedWebGPU,
    activeRendererOk,
    contextCreatedOk,
    contextCreatedCount: contextCreated.length,
    activeRegistryContextCreatedCount: activeRegistryContextCreated.length,
    disposedContextCreatedCount: disposedContextCreated.length,
    staleFallbackContextCreatedCount: staleFallbackContextCreated.length,
    renderer,
  };
}

function webgpuBackgroundUploadProof(before, after, consoleLog = [], minAtMs = 0) {
  const renderer = after?.screenLayerRenderer ?? null;
  const requestedWebGPU = renderer?.requestedRendererKind === 'webgpu' || renderer?.rendererKind === 'webgpu';
  const combined = collectWebgpuRendererEvents([before, after], consoleLog, minAtMs);
  const uploads = combined.filter((entry) => entry.event === 'background-image-texture-uploaded');
  const drawUploads = uploads.filter((entry) => entry.payload?.reason === 'draw');
  const prewarmUploads = uploads.filter((entry) => entry.payload?.reason === 'prewarm' || entry.payload?.reason === 'post-init-prewarm');
  const missedDownscaleUploads = uploads.filter((entry) => {
    const width = Number(entry.payload?.width);
    const height = Number(entry.payload?.height);
    const sourceWidth = Number(entry.payload?.sourceWidth);
    const sourceHeight = Number(entry.payload?.sourceHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) return false;
    return (sourceWidth > width || sourceHeight > height) && entry.payload?.downscaled !== true;
  });
  return {
    ok: !requestedWebGPU || (drawUploads.length === 0 && missedDownscaleUploads.length === 0),
    requestedWebGPU,
    uploadCount: uploads.length,
    prewarmUploadCount: prewarmUploads.length,
    drawUploadCount: drawUploads.length,
    missedDownscaleUploadCount: missedDownscaleUploads.length,
    uploads: uploads.slice(-12).map((entry) => ({
      source: entry.source,
      reason: entry.payload?.reason ?? null,
      rendererId: entry.payload?.rendererId ?? entry.payload?.id ?? null,
      width: entry.payload?.width ?? null,
      height: entry.payload?.height ?? null,
      sourceWidth: entry.payload?.sourceWidth ?? null,
      sourceHeight: entry.payload?.sourceHeight ?? null,
      downscaled: entry.payload?.downscaled ?? null,
      uploadMs: entry.payload?.uploadMs ?? null,
    })),
  };
}

function activePlaybackDebugProof(state) {
  const renderer = state?.screenLayerRenderer ?? null;
  const requestedWebGPU = renderer?.requestedRendererKind === 'webgpu' || renderer?.rendererKind === 'webgpu';
  const active = state?.activePlaybackDebug ?? null;
  if (!requestedWebGPU) return { ok: true, skipped: true, reason: 'webgpu-not-requested' };
  if (!active) return { ok: false, reason: 'missing-active-playback-debug' };
  const expectedDisplayGapCount = Number(active.expectedDisplayGapCount) || 0;
  const mainThreadBlockedExpectedDisplayGapCount = Number(active.mainThreadBlockedExpectedDisplayGapCount) || 0;
  const longTaskCount = Number(active.longTaskCount) || 0;
  const maxLongTask = Number(active.maxLongTask) || 0;
  return {
    ok: expectedDisplayGapCount === 0 && mainThreadBlockedExpectedDisplayGapCount === 0 && maxLongTask <= 80,
    expectedDisplayGapCount,
    mainThreadBlockedExpectedDisplayGapCount,
    longTaskCount,
    maxLongTask,
    window: state?.activePlaybackWindow ?? null,
    active,
  };
}

function webgpuMotionBlurProof(state, consoleLog = [], minAtMs = 0) {
  if (!expectWebgpuMotionBlur) return { ok: true, skipped: true, reason: 'motion-blur-not-required' };
  const renderer = state?.screenLayerRenderer ?? null;
  const requestedWebGPU = renderer?.requestedRendererKind === 'webgpu' || renderer?.rendererKind === 'webgpu';
  if (!requestedWebGPU) return { ok: true, skipped: true, reason: 'webgpu-not-requested' };
  const activeRegistryEntries = Object.values(state?.webgpuRendererInstances ?? {}).filter((entry) => entry?.disposed === false);
  const maxMotionBlurSamples = activeRegistryEntries.reduce((max, entry) => Math.max(max, Number(entry?.maxMotionBlurSamples) || 0), 0);
  const motionBlurFrameCount = activeRegistryEntries.reduce((sum, entry) => sum + (Number(entry?.motionBlurFrameCount) || 0), 0);
  const combined = collectWebgpuRendererEvents([state], consoleLog, minAtMs);
  const activeEvents = combined.filter((entry) => entry.event === 'motion-blur-active');
  return {
    ok: maxMotionBlurSamples >= 3 && motionBlurFrameCount > 0,
    required: true,
    maxMotionBlurSamples,
    motionBlurFrameCount,
    activeEventCount: activeEvents.length,
    activeEvents: activeEvents.slice(-8).map((entry) => ({
      source: entry.source,
      rendererId: entry.payload?.rendererId ?? entry.payload?.id ?? null,
      samples: entry.payload?.samples ?? null,
      blurPx: entry.payload?.blurPx ?? null,
      motionBlurFrameCount: entry.payload?.motionBlurFrameCount ?? null,
    })),
  };
}

function collectWebgpuRendererEvents(states, consoleLog = [], minAtMs = 0) {
  const seen = new Set();
  const events = [];
  for (const state of states) {
    const rendererLog = Array.isArray(state?.webgpuRendererLog) ? state.webgpuRendererLog : [];
    for (const entry of rendererLog) {
      if (Number.isFinite(minAtMs) && minAtMs > 0 && Number(entry?.atMs) < minAtMs) continue;
      const normalized = { source: 'window', event: entry?.event ?? null, payload: entry?.payload ?? {} };
      const key = `${normalized.event}:${JSON.stringify(normalized.payload)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(normalized);
    }
  }
  for (const entry of consoleLog) {
    const payload = parseRendererConsolePayload(entry?.text);
    if (Number.isFinite(minAtMs) && minAtMs > 0 && Number(payload?.atMs) < minAtMs) continue;
    const normalized = { source: 'console', event: parseRendererConsoleEvent(entry?.text), payload };
    const key = `${normalized.event}:${JSON.stringify(normalized.payload)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(normalized);
  }
  return events;
}

function parseRendererConsoleEvent(text = '') {
  const match = String(text).match(/\[rough-cut:webgpu-renderer\]\s+([^\s]+)/);
  return match?.[1] ?? null;
}

function parseRendererConsolePayload(text = '') {
  const start = String(text).indexOf('{');
  if (start < 0) return {};
  try {
    return JSON.parse(String(text).slice(start));
  } catch {
    return {};
  }
}

function selectPlaybackVideoElements() {
  const videos = Array.from(document.querySelectorAll('video'));
  const hiddenPreviewSources = videos.filter((video) => String(video.className ?? '').split(/\s+/).includes('hiddenSource'));
  if (hiddenPreviewSources.length > 0) return hiddenPreviewSources;
  return videos.filter((video) => {
    const classNames = String(video.className ?? '').split(/\s+/);
    return !classNames.includes('ev2MediaThumbVideo') && !classNames.includes('ev2SourceVideo');
  });
}

function selectPlaybackVideoElement() {
  const selector = window.__roughCutSelectPlaybackVideos;
  const videos = typeof selector === 'function'
    ? selector()
    : Array.from(document.querySelectorAll('video'));
  return videos[0] ?? null;
}

function readPlaybackState() {
  const canvas = document.querySelector('canvas.styledPreviewAcceleratedCanvas.isActive, canvas.styledPreviewWebglCanvas.isActive')
    ?? document.querySelector('canvas.styledPreviewCanvas');
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
    const intersectsViewport = rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
    const quality = typeof video.getVideoPlaybackQuality === 'function'
      ? video.getVideoPlaybackQuality()
      : null;
    return {
      index,
      className: video.className,
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      readyState: video.readyState,
      seeking: video.seeking,
      playbackRate: video.playbackRate,
      muted: video.muted,
      audioDecodedByteCount: Number.isFinite(video.webkitAudioDecodedByteCount) ? video.webkitAudioDecodedByteCount : null,
      playbackQuality: quality
        ? {
            creationTime: quality.creationTime,
            totalVideoFrames: quality.totalVideoFrames,
            droppedVideoFrames: quality.droppedVideoFrames,
            corruptedVideoFrames: quality.corruptedVideoFrames,
          }
        : null,
      visible: intersectsViewport && rect.width > 20 && rect.height > 20 && Number(style.opacity) > 0.01 && style.visibility !== 'hidden',
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
  const videoElements = Array.from(document.querySelectorAll('video'));
  const playbackVideoElements = typeof window.__roughCutSelectPlaybackVideos === 'function'
    ? window.__roughCutSelectPlaybackVideos()
    : videoElements;
  const playbackIndexes = new Set(playbackVideoElements.map((video) => videoElements.indexOf(video)));
  const playbackVideos = videos.filter((video) => playbackIndexes.has(video.index));
  const video = playbackVideos[0] ?? videos[0];
  return {
    videoTime: video ? video.currentTime : -1,
    videoPaused: video ? video.paused : null,
    videos,
    playbackVideos,
    hasCamera: playbackVideos.length > 1,
    hasScreenAudio: typeof window.__roughCutExpectedHasScreenAudio === 'boolean'
      ? window.__roughCutExpectedHasScreenAudio
      : Boolean(playbackVideos[0] && playbackVideos[0].muted === false),
    nativeActive: Boolean(document.querySelector('.nativePlaybackActive')),
    nativePhase: Array.from(document.querySelector('.styledPreview')?.classList ?? []).find((name) => name.startsWith('nativePlaybackPhase-')) ?? null,
    timelinePlaybackDebug: window.__roughCutTimelinePlaybackDebug ?? null,
    playbackDebug: typeof window.__roughCutReadPlaybackDebug === 'function'
      ? window.__roughCutReadPlaybackDebug()
      : { counts: {}, frameGapCount: 0, maxFrameGap: 0, lastFrameGap: null, tail: [] },
    probeStartedAtMs: typeof window.__roughCutPlaybackProbeStartedAtMs === 'number' ? window.__roughCutPlaybackProbeStartedAtMs : null,
    screenLayerRenderer: window.__roughCutScreenLayerRenderer ?? null,
    webglRendererInstances: window.__roughCutWebglRendererInstances ?? null,
    webglRendererLog: Array.isArray(window.__roughCutWebglRendererLog) ? window.__roughCutWebglRendererLog.slice(-80) : [],
    webgpuRendererInstances: window.__roughCutWebgpuRendererInstances ?? null,
    webgpuRendererLog: Array.isArray(window.__roughCutWebgpuRendererLog) ? window.__roughCutWebgpuRendererLog.slice(-80) : [],
    canvasCameraRect,
    drawCount: window.__roughCutCanvasDrawCount ?? 0,
    timecode: document.querySelector('.nleTransportTimeCurrent')?.textContent
      ?? document.querySelector('.videoControls .timecode')?.textContent
      ?? null,
    canvas: window.__roughCutReadCanvasStats(),
  };
}

function readPlaybackDebug(range = null) {
  const log = Array.isArray(window.__roughCutPlaybackDebugLog)
    ? window.__roughCutPlaybackDebugLog
    : [];
  const sinceAtMs = Number(range?.sinceAtMs);
  const untilAtMs = Number(range?.untilAtMs);
  const filteredLog = log.filter((entry) => {
    const atMs = Number(entry?.atMs);
    if (!Number.isFinite(atMs)) return !Number.isFinite(sinceAtMs) && !Number.isFinite(untilAtMs);
    if (Number.isFinite(sinceAtMs) && atMs < sinceAtMs) return false;
    if (Number.isFinite(untilAtMs) && atMs > untilAtMs) return false;
    return true;
  });
  const frameGaps = filteredLog.filter((entry) => entry?.event === 'render-frame-gap');
  const expectedDisplayGaps = filteredLog.filter((entry) => entry?.event === 'render-expected-display-gap');
  const mainThreadBlockedExpectedDisplayGaps = filteredLog.filter((entry) => entry?.event === 'render-expected-display-gap-main-thread-blocked');
  const drawCosts = filteredLog.filter((entry) => entry?.event === 'render-draw-cost');
  const longTasks = filteredLog.filter((entry) => entry?.event === 'main-thread-long-task');
  const lastFrameGap = frameGaps[frameGaps.length - 1] ?? null;
  const maxFrameGap = frameGaps.reduce((max, entry) => Math.max(max, Number(entry?.deltaMs) || 0), 0);
  const lastExpectedDisplayGap = expectedDisplayGaps[expectedDisplayGaps.length - 1] ?? null;
  const maxExpectedDisplayGap = expectedDisplayGaps.reduce((max, entry) => Math.max(max, Number(entry?.expectedGapMs) || 0), 0);
  const lastDrawCost = drawCosts[drawCosts.length - 1] ?? null;
  const maxDrawCost = drawCosts.reduce((max, entry) => Math.max(max, Number(entry?.totalDrawMs) || 0), 0);
  const lastLongTask = longTasks[longTasks.length - 1] ?? null;
  const maxLongTask = longTasks.reduce((max, entry) => Math.max(max, Number(entry?.duration) || 0), 0);
  return {
    counts: range
      ? filteredLog.reduce((counts, entry) => {
          const event = String(entry?.event ?? '');
          if (event) counts[event] = (counts[event] ?? 0) + 1;
          return counts;
        }, {})
      : window.__roughCutPlaybackDebugCounts ?? {},
    sinceAtMs: Number.isFinite(sinceAtMs) ? sinceAtMs : null,
    untilAtMs: Number.isFinite(untilAtMs) ? untilAtMs : null,
    frameGapCount: frameGaps.length,
    maxFrameGap,
    lastFrameGap,
    expectedDisplayGapCount: expectedDisplayGaps.length,
    maxExpectedDisplayGap,
    lastExpectedDisplayGap,
    mainThreadBlockedExpectedDisplayGapCount: mainThreadBlockedExpectedDisplayGaps.length,
    maxMainThreadBlockedExpectedDisplayGap: mainThreadBlockedExpectedDisplayGaps.reduce((max, entry) => Math.max(max, Number(entry?.expectedGapMs) || 0), 0),
    lastMainThreadBlockedExpectedDisplayGap: mainThreadBlockedExpectedDisplayGaps[mainThreadBlockedExpectedDisplayGaps.length - 1] ?? null,
    drawCostCount: drawCosts.length,
    maxDrawCost,
    lastDrawCost,
    longTaskCount: longTasks.length,
    maxLongTask,
    lastLongTask,
    tail: filteredLog.slice(-80),
  };
}

function readCanvasStats() {
  const acceleratedCanvas = document.querySelector('canvas.styledPreviewAcceleratedCanvas.isActive, canvas.styledPreviewWebglCanvas.isActive');
  const canvas = acceleratedCanvas instanceof HTMLCanvasElement
    ? acceleratedCanvas
    : document.querySelector('canvas.styledPreviewCanvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return { ok: false, reason: 'missing-canvas', visible: false, saturation: 0, contrast: 0, darkRatio: 1 };
  }
  const rect = canvas.getBoundingClientRect();
  const style = window.getComputedStyle(canvas);
  const visible = rect.width > 20 && rect.height > 20 && style.opacity !== '0' && style.visibility !== 'hidden';
  const renderer = window.__roughCutScreenLayerRenderer ?? null;
  if (acceleratedCanvas instanceof HTMLCanvasElement) {
    const rendererActive = renderer?.contextStatus === 'available' && (renderer?.rendererKind === 'webgl' || renderer?.rendererKind === 'webgpu');
    return {
      ok: visible && rendererActive,
      reason: !visible
        ? 'accelerated-canvas-not-visible'
        : rendererActive
          ? null
          : 'gpu-renderer-not-active',
      visible,
      kind: renderer?.rendererKind === 'webgpu' ? 'webgpu-presentation' : 'webgl-presentation',
      saturation: null,
      contrast: null,
      darkRatio: null,
      renderer,
    };
  }
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
    screenLayerRenderer: result.after?.screenLayerRenderer,
    webgpuRendererInstances: result.after?.webgpuRendererInstances ?? null,
    webgpuRendererLog: Array.isArray(result.after?.webgpuRendererLog) ? result.after.webgpuRendererLog.slice(-12) : [],
    webgpuLifecycle: result.webgpuLifecycle,
    webgpuBackgroundUploads: result.webgpuBackgroundUploads,
    webgpuMotionBlur: result.webgpuMotionBlur,
    screenshotProof: result.screenshotProof,
    screenshotArtifacts: result.screenshotArtifacts,
    rendererExpectation: result.rendererExpectation,
    proof: result.proof,
    playbackDebug: result.after?.playbackDebug,
    activePlaybackDebug: result.activePlaybackDebug,
    cameraGeometry: result.cameraGeometry,
    screenshotPath: result.screenshotPath,
    pausedScreenshotPath: result.pausedScreenshotPath,
    transitionScreenshotPath: result.transitionScreenshotPath,
    timecode: result.after?.timecode,
  };
}

function normalizeExpectedRenderer(value) {
  if (value === 'canvas2d' || value === 'webgl' || value === 'webgpu') return value;
  return '';
}

function rendererExpectationProof(state) {
  if (!expectedScreenLayerRenderer) return { ok: true, skipped: true, reason: 'renderer-not-pinned' };
  const renderer = state?.screenLayerRenderer ?? null;
  const actual = renderer?.rendererKind ?? null;
  const contextStatus = renderer?.contextStatus ?? null;
  const fallbackReason = renderer?.fallbackReason ?? null;
  return {
    ok: actual === expectedScreenLayerRenderer && contextStatus === 'available',
    expected: expectedScreenLayerRenderer,
    actual,
    contextStatus,
    fallbackReason,
    renderer,
  };
}

async function collectScreenshotArtifacts(pathsByState) {
  const entries = await Promise.all(Object.entries(pathsByState)
    .filter(([, filePath]) => Boolean(filePath))
    .map(async ([state, filePath]) => {
      try {
        const info = await stat(filePath);
        return [state, { path: filePath, bytes: info.size }];
      } catch (err) {
        return [state, {
          path: filePath,
          bytes: 0,
          error: err instanceof Error ? err.message : String(err),
        }];
      }
    }));
  return Object.fromEntries(entries);
}

function screenshotArtifactProof(screenshotArtifacts) {
  const artifacts = Object.values(screenshotArtifacts ?? {});
  if (!playbackScreenshotPath) return { ok: true, skipped: true, reason: 'screenshots-not-requested' };
  const missing = artifacts.filter((artifact) => !artifact || Number(artifact.bytes) <= 1000);
  return {
    ok: artifacts.length > 0 && missing.length === 0,
    requested: true,
    count: artifacts.length,
    missingOrTinyCount: missing.length,
    minBytes: artifacts.length > 0
      ? artifacts.reduce((min, artifact) => Math.min(min, Number(artifact?.bytes) || 0), Number.POSITIVE_INFINITY)
      : 0,
    artifacts: screenshotArtifacts,
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
  if (activePath.includes('{state}')) return activePath.replaceAll('{state}', state);
  if (state === 'active') return activePath;
  return activePath.replace(/\.png$/i, `-${state}.png`);
}

function cameraGeometryProof(before, after) {
  if (!after?.hasCamera) return { ok: true, skipped: true, reason: 'no-camera' };
  const afterRect = after?.canvasCameraRect ?? null;
  if (!afterRect) {
    return { ok: false, reason: 'missing-camera-rect', beforeRect: before?.canvasCameraRect ?? null, afterRect };
  }
  const maxDeltaPx = 0;
  return {
    ok: afterRect.width > 8 && afterRect.height > 8,
    beforeRect: before?.canvasCameraRect ?? null,
    afterRect,
    maxDeltaPx,
  };
}

function playbackWaitTimeoutMs(requiredSeconds) {
  const seconds = Number.isFinite(requiredSeconds) && requiredSeconds > 0 ? requiredSeconds : 2;
  return Math.ceil((seconds + 12) * 1000);
}

function windowPlaybackProof(before, after, requiredAdvanceSec) {
  return playbackProof(before, after, requiredAdvanceSec, { correctnessOnly: playbackCorrectnessOnly });
}

async function clickZoomRegionDuringPlayback(page, view) {
  if (view !== 'recording') return false;
  const region = page.locator('.zoomLane .timelineRegion').first();
  if (await region.count() === 0) return false;
  await region.click({ force: true });
  return true;
}

async function clickPreviewCanvasDuringPlayback(page) {
  const canvas = page.locator('canvas.styledPreviewCanvas').first();
  const box = await canvas.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

function projectHasScreenAudio(document) {
  const assets = Array.isArray(document?.assets) ? document.assets : [];
  const tracks = Array.isArray(document?.timeline?.tracks) ? document.timeline.tracks : [];
  const timelineSources = Array.isArray(document?.timeline?.sources) ? document.timeline.sources : [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const sourceById = new Map(timelineSources.map((source) => [source.id, source]));
  for (const track of tracks) {
    if (track.kind !== 'video' || track.enabled === false) continue;
    for (const clip of track.clips ?? []) {
      const source = sourceById.get(clip.mediaId);
      const asset = assetById.get(clip.assetId ?? source?.assetId ?? clip.mediaId);
      if (!asset || asset.metadata?.isCamera || source?.kind === 'camera') continue;
      if (asset.metadata?.audio) return true;
    }
  }
  return assets.some((asset) => !asset.metadata?.isCamera && Boolean(asset.metadata?.audio));
}

function buildPlaybackFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const width = stressPlaybackFixture ? 1920 : 960;
  const height = stressPlaybackFixture ? 1080 : 540;
  const scale = stressPlaybackFixture ? 2 : 1;
  return [
    `testsrc2=size=${width}x${height}:rate=30`,
    `drawtext=fontfile=${font}:text='TIMELINE CLOCK':fontcolor=white:fontsize=${44 * scale}:x=${40 * scale}:y=${40 * scale}:box=1:boxcolor=0x00000099`,
    `drawbox=x=${40 * scale}:y=${410 * scale}:w=${140 * scale}:h=${90 * scale}:color=0xff0000:t=fill`,
    `drawbox=x=${410 * scale}:y=${410 * scale}:w=${140 * scale}:h=${90 * scale}:color=0x00ff00:t=fill`,
    `drawbox=x=${780 * scale}:y=${410 * scale}:w=${140 * scale}:h=${90 * scale}:color=0x0000ff:t=fill`,
  ].join(',');
}

function buildCameraPlaybackFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc=size=320x240:rate=30',
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
