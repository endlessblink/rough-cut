export const HEADLESS_EXPORT_BACKEND = 'electron-headless-compositor';

export async function attemptExperimentalHeadlessRender({
  compositionPlan,
  outputPath,
  env = process.env,
  electronRuntime = null,
  createRenderWindow = null,
} = {}) {
  const availability = await resolveExperimentalHeadlessAvailability({ env, electronRuntime });
  const result = {
    backend: HEADLESS_EXPORT_BACKEND,
    attempted: availability.enabled,
    available: availability.available,
    ok: false,
    reason: availability.reason,
    outputPath: null,
    frameCount: Array.isArray(compositionPlan?.frames) ? compositionPlan.frames.length : 0,
    output: compositionPlan?.output ?? null,
  };
  if (!availability.available) return result;

  const renderSurface = await probeHiddenRenderSurface({
    compositionPlan,
    electronRuntime,
    createRenderWindow,
  });

  return {
    ...result,
    attempted: true,
    reason: 'electron-headless-renderer-not-implemented',
    outputPath,
    renderSurface,
  };
}

export async function resolveExperimentalHeadlessAvailability({ env = process.env, electronRuntime = null } = {}) {
  if (env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT !== '1') {
    return {
      enabled: false,
      available: false,
      reason: 'experimental-headless-export-disabled',
    };
  }

  const runtime = electronRuntime ?? await resolveElectronRuntime();
  if (!runtime.available) {
    return {
      enabled: true,
      available: false,
      reason: runtime.reason,
    };
  }

  return {
    enabled: true,
    available: true,
    reason: null,
  };
}

async function resolveElectronRuntime() {
  try {
    const electron = await import('electron');
    if (!electron?.app || !electron?.BrowserWindow) {
      return {
        available: false,
        reason: 'electron-runtime-unavailable',
      };
    }
    return {
      available: true,
      app: electron.app,
      BrowserWindow: electron.BrowserWindow,
    };
  } catch {
    return {
      available: false,
      reason: 'electron-runtime-unavailable',
    };
  }
}

async function probeHiddenRenderSurface({ compositionPlan, electronRuntime = null, createRenderWindow = null } = {}) {
  const output = normalizeOutputSize(compositionPlan?.output);
  const BrowserWindow = electronRuntime?.BrowserWindow;
  const canCreateWindow = typeof createRenderWindow === 'function' || typeof BrowserWindow === 'function';
  if (!canCreateWindow) {
    return {
      attempted: false,
      reason: 'electron-browser-window-unavailable',
      output,
    };
  }

  let window = null;
  const options = {
    show: false,
    width: output.width,
    height: output.height,
    useContentSize: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      sandbox: true,
    },
  };

  try {
    window = typeof createRenderWindow === 'function'
      ? createRenderWindow(options)
      : new BrowserWindow(options);
    if (!window) {
      return {
        attempted: true,
        reason: 'electron-window-create-failed',
        output,
      };
    }

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(renderProbeHtml(output))}`;
    if (typeof window.loadURL === 'function') {
      await window.loadURL(dataUrl);
    }

    let probe = null;
    if (typeof window.webContents?.executeJavaScript === 'function') {
      probe = await window.webContents.executeJavaScript('window.__roughCutHeadlessExportProbe', true);
    }

    return {
      attempted: true,
      reason: null,
      output,
      loaded: typeof window.loadURL === 'function',
      scriptExecuted: probe?.ok === true,
      canCapturePage: typeof window.capturePage === 'function' || typeof window.webContents?.capturePage === 'function',
    };
  } catch (err) {
    return {
      attempted: true,
      reason: 'electron-hidden-window-probe-failed',
      output,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (window && typeof window.close === 'function') {
      window.close();
    } else if (window && typeof window.destroy === 'function') {
      window.destroy();
    }
  }
}

function normalizeOutputSize(output = {}) {
  const width = Number.isFinite(output?.width) && output.width > 0 ? Math.round(output.width) : 1920;
  const height = Number.isFinite(output?.height) && output.height > 0 ? Math.round(output.height) : 1080;
  return { width, height };
}

function renderProbeHtml(output) {
  return `<!doctype html><meta charset="utf-8"><canvas id="frame" width="${output.width}" height="${output.height}"></canvas><script>window.__roughCutHeadlessExportProbe={ok:true,width:${output.width},height:${output.height},canvas:!!document.getElementById('frame')};</script>`;
}
