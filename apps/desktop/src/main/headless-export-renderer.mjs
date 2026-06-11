export const HEADLESS_EXPORT_BACKEND = 'electron-headless-compositor';

export async function attemptExperimentalHeadlessRender({
  compositionPlan,
  outputPath,
  env = process.env,
  electronRuntime = null,
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

  return {
    ...result,
    attempted: true,
    reason: 'electron-headless-renderer-not-implemented',
    outputPath,
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
