import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('..', import.meta.url).pathname);
const timeoutMs = numberFromEnv('ROUGH_CUT_WEBGPU_PROBE_TIMEOUT_MS', 30000);
const stepTimeoutMs = numberFromEnv('ROUGH_CUT_WEBGPU_PROBE_STEP_TIMEOUT_MS', 5000);
const videoPath = process.env.ROUGH_CUT_WEBGPU_PROBE_VIDEO ? resolve(process.env.ROUGH_CUT_WEBGPU_PROBE_VIDEO) : null;
const enableGpuFlags = process.env.ROUGH_CUT_WEBGPU_PROBE_ENABLE_FLAGS === '1';
const reportPath = process.env.ROUGH_CUT_WEBGPU_PROBE_REPORT
  ? resolve(process.env.ROUGH_CUT_WEBGPU_PROBE_REPORT)
  : join(tmpdir(), 'rough-cut-webgpu-probe-latest.json');

const startedAt = Date.now();
const result = await runWithTimeout(runProbe(), timeoutMs, {
  ok: false,
  supported: false,
  reason: 'probe-process-timeout',
  timeoutMs,
  elapsedMs: timeoutMs,
  reportPath,
  videoPath,
  enableGpuFlags,
});

const report = {
  ...result,
  elapsedMs: Date.now() - startedAt,
  reportPath,
  videoPath,
  enableGpuFlags,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

async function runProbe() {
  const { _electron: electron } = loadPlaywright();
  const electronPath = join(root, 'apps/desktop/node_modules/.bin/electron');
  const gpuArgs = enableGpuFlags
    ? [
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
        '--enable-zero-copy',
        '--enable-features=Vulkan,AcceleratedVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxZeroCopyGL,VaapiVideoDecoder,VaapiIgnoreDriverChecks',
      ]
    : [];
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['--no-sandbox', '--force-color-profile=srgb', ...gpuArgs, '.'],
    cwd: join(root, 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    },
  });
  try {
    const page = await app.firstWindow({ timeout: stepTimeoutMs });
    await page.waitForLoadState('domcontentloaded', { timeout: stepTimeoutMs });
    const rendererProbeSource = `(() => {
      const rendererProbe = ${rendererProbe.toString()};
      const readAdapterInfo = ${readAdapterInfo.toString()};
      const withTimeout = ${withTimeout.toString()};
      const loadVideo = ${loadVideo.toString()};
      return rendererProbe;
    })()`;
    const rendererResult = await page.evaluate(
      async ({ stepTimeoutMs: rendererStepTimeoutMs, videoUrl, rendererProbeText }) => {
        const runRendererProbe = eval(rendererProbeText);
        return runRendererProbe({ stepTimeoutMs: rendererStepTimeoutMs, videoUrl });
      },
      {
        stepTimeoutMs,
        videoUrl: videoPath ? pathToFileURL(videoPath).href : null,
        rendererProbeText: rendererProbeSource,
      },
    );
    return {
      ok: Boolean(rendererResult.supported),
      supported: Boolean(rendererResult.supported),
      reason: rendererResult.reason ?? (rendererResult.supported ? null : 'webgpu-unsupported'),
      result: rendererResult,
    };
  } catch (error) {
    return {
      ok: false,
      supported: false,
      reason: 'probe-app-error',
      error: String(error?.stack || error?.message || error),
    };
  } finally {
    await app.close().catch(() => {});
  }
}

async function rendererProbe(options) {
  const result = {
    ok: false,
    supported: false,
    reason: null,
    userAgent: navigator.userAgent,
    videoUrl: options.videoUrl,
    steps: {},
    errors: [],
  };
  const step = async (name, fn) => {
    const startedAt = performance.now();
    try {
      const value = await withTimeout(fn(), options.stepTimeoutMs, name);
      result.steps[name] = {
        ok: true,
        elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
        value,
      };
      return value;
    } catch (error) {
      result.steps[name] = {
        ok: false,
        elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
        error: String(error?.message || error),
      };
      result.errors.push(`${name}: ${String(error?.message || error)}`);
      return null;
    }
  };

  result.steps.navigatorGpu = {
    ok: Boolean(navigator.gpu),
    value: {
      gpu: Boolean(navigator.gpu),
      requestAdapter: typeof navigator.gpu?.requestAdapter,
      videoFrame: typeof VideoFrame,
      requestVideoFrameCallback: typeof HTMLVideoElement.prototype.requestVideoFrameCallback,
      webgl2: Boolean(document.createElement('canvas').getContext('webgl2')),
      webgl: Boolean(document.createElement('canvas').getContext('webgl')),
    },
  };
  if (!navigator.gpu) {
    result.reason = 'navigator-gpu-missing';
    return result;
  }

  const adapter = await step('requestAdapter', () => navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }));
  if (!adapter) {
    result.reason = 'adapter-unavailable';
    return result;
  }
  result.adapterInfo = await readAdapterInfo(adapter);
  const device = await step('requestDevice', () => adapter.requestDevice());
  if (!device) {
    result.reason = 'device-unavailable';
    return result;
  }
  result.device = {
    importExternalTexture: typeof device.importExternalTexture,
    limits: {
      maxTextureDimension2D: device.limits.maxTextureDimension2D,
      maxBindGroups: device.limits.maxBindGroups,
    },
  };
  if (typeof device.importExternalTexture !== 'function') {
    result.reason = 'import-external-texture-missing';
    return result;
  }

  if (options.videoUrl) {
    const video = await step('loadVideo', () => loadVideo(options.videoUrl));
    if (!video) {
      result.reason = 'video-load-failed';
      return result;
    }
    const externalTexture = await step('importExternalTextureVideo', () => Promise.resolve(device.importExternalTexture({ source: video })));
    if (!externalTexture) {
      result.reason = 'video-external-texture-failed';
      return result;
    }
    if (typeof VideoFrame === 'function') {
      const videoFrameTexture = await step('importExternalTextureVideoFrame', () => {
        const frame = new VideoFrame(video, { timestamp: 0 });
        try {
          return Promise.resolve(device.importExternalTexture({ source: frame }));
        } finally {
          frame.close();
        }
      });
      result.videoFrameExternalTexture = Boolean(videoFrameTexture);
    }
  }

  result.ok = true;
  result.supported = true;
  result.reason = null;
  return result;
}

async function readAdapterInfo(adapter) {
  try {
    if (typeof adapter.requestAdapterInfo === 'function') return await adapter.requestAdapterInfo();
  } catch (error) {
    return { error: String(error?.message || error) };
  }
  return {};
}

function withTimeout(promise, timeoutMs, name) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    video.addEventListener('error', () => reject(new Error(video.error?.message || 'video error')), { once: true });
    video.addEventListener('loadeddata', async () => {
      try {
        await video.play();
      } catch {
        // A loaded frame is sufficient for importExternalTexture probing.
      }
      resolve(video);
    }, { once: true });
  });
}

function runWithTimeout(promise, fallback, fallbackResult) {
  return new Promise((resolveResult) => {
    const timeout = setTimeout(() => resolveResult(fallbackResult), fallback);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolveResult(value);
      },
      (error) => {
        clearTimeout(timeout);
        resolveResult({
          ok: false,
          supported: false,
          reason: 'probe-runner-error',
          error: String(error?.stack || error?.message || error),
        });
      },
    );
  });
}

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
