// Cursor-data abstractions. New cursor-derived features (auto-zoom,
// click emphasis) consume cursor data through these accessors rather than
// reaching into project.document.assets[0].metadata.cursorEvents directly.
// When the Wayland pivot lands (TASK-026), the implementation behind these
// accessors changes — the compositor delivers cursor metadata through
// PipeWire, or a separate input hook captures it — and call sites stay
// untouched.

const DEFAULT_SOURCE_WIDTH = 1920;
const DEFAULT_SOURCE_HEIGHT = 1080;
const DEFAULT_FPS = 30;

function getPrimaryRecordingAsset(document) {
  if (!document || !Array.isArray(document.assets)) return null;
  // Only the screen recording carries cursor telemetry / source dimensions.
  // Camera assets are `type: 'video'` and must not be selected here, or
  // accessors return empty events and 640×480 dimensions.
  for (const asset of document.assets) {
    if (asset?.type === 'recording') return asset;
  }
  return null;
}

export function getCursorEvents(document) {
  const asset = getPrimaryRecordingAsset(document);
  const events = asset?.metadata?.cursorEvents;
  return Array.isArray(events) ? events : [];
}

export function getCursorClickEvents(document) {
  return getCursorEvents(document).filter(
    (event) => event && event.type === 'down' && event.button === 0,
  );
}

export function getCursorMoveEvents(document) {
  return getCursorEvents(document).filter(
    (event) => event && event.type === 'move',
  );
}

export function getRecordingFps(document) {
  if (!document) return DEFAULT_FPS;
  const asset = getPrimaryRecordingAsset(document);
  const metadataFps = Number(asset?.metadata?.fps);
  if (Number.isFinite(metadataFps) && metadataFps > 0) return metadataFps;
  const settingsFps = Number(document.settings?.frameRate);
  if (Number.isFinite(settingsFps) && settingsFps > 0) return settingsFps;
  return DEFAULT_FPS;
}

export function getRecordingSourceSize(document) {
  const asset = getPrimaryRecordingAsset(document);
  const metaWidth = Number(asset?.metadata?.width);
  const metaHeight = Number(asset?.metadata?.height);
  if (Number.isFinite(metaWidth) && metaWidth > 0 && Number.isFinite(metaHeight) && metaHeight > 0) {
    return { width: metaWidth, height: metaHeight };
  }
  const settingsWidth = Number(document?.settings?.resolution?.width);
  const settingsHeight = Number(document?.settings?.resolution?.height);
  if (
    Number.isFinite(settingsWidth) &&
    settingsWidth > 0 &&
    Number.isFinite(settingsHeight) &&
    settingsHeight > 0
  ) {
    return { width: settingsWidth, height: settingsHeight };
  }
  return { width: DEFAULT_SOURCE_WIDTH, height: DEFAULT_SOURCE_HEIGHT };
}
