const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

export function transcriptionFeatureEnabled(environment = process.env) {
  const configured = String(environment.ROUGH_CUT_SMART_ROUGH_CUT ?? '')
    .trim()
    .toLowerCase();
  if (DISABLED_VALUES.has(configured)) return false;
  return configured === '' || ENABLED_VALUES.has(configured);
}

function normalizedProvider(provider, kind) {
  if (
    !provider ||
    typeof provider.id !== 'string' ||
    !provider.id.trim() ||
    typeof provider.model !== 'string' ||
    !provider.model.trim()
  ) {
    return null;
  }
  return { kind, id: provider.id, model: provider.model };
}

export function resolveTranscriptionProvider({
  localProvider,
  cloudEnabled = false,
  cloudProvider,
}) {
  const local = normalizedProvider(localProvider, 'local');
  if (local) return local;
  if (!cloudEnabled) return null;
  return normalizedProvider(cloudProvider, 'cloud');
}

export function shouldSuspendTranscription({
  recordingState,
  frameDrops,
  previousFrameDrops,
  queueWarnings,
  captureFps,
  targetFps,
}) {
  if (recordingState !== 'recording') return false;

  if (
    Number.isFinite(frameDrops) &&
    Number.isFinite(previousFrameDrops) &&
    frameDrops > previousFrameDrops
  ) {
    return true;
  }

  if (Number.isFinite(queueWarnings) && queueWarnings > 0) return true;

  if (
    Number.isFinite(captureFps) &&
    Number.isFinite(targetFps) &&
    targetFps > 0 &&
    captureFps < targetFps * 0.9
  ) {
    return true;
  }

  return false;
}
