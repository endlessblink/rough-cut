/**
 * Pure resolver for FFmpeg x11grab capture coordinates given an Electron
 * desktopCapturer sourceId and the current `screen.getAllDisplays()` output.
 *
 * Extracted from `src/main/index.mjs` so the display-id-vs-array-index bug
 * fix (commit e736a45) can be unit-tested without booting Electron.
 *
 * selectedSourceId shape: 'screen:<electronDisplayId>:<streamIndex>'. The
 * middle segment is Electron's stable `display.id`, NOT an index into
 * `screen.getAllDisplays()`. On multi-monitor setups the id is a large
 * integer (e.g. 2147483647) that would index out of bounds if treated as
 * an array index — silently falling back to displays[0] (the primary),
 * which is the bug this module guards against.
 */

/**
 * @typedef {object} ElectronDisplayLike
 * @property {number | string} id
 * @property {{ x: number, y: number, width: number, height: number }} bounds
 * @property {number} [scaleFactor]
 * @property {string} [label]
 */

/**
 * @typedef {object} CachedCaptureSource
 * @property {string} id
 * @property {string | number} [displayId]
 * @property {string} [name]
 * @property {string} [type]
 */

/**
 * @typedef {object} CaptureBounds
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} [scaleFactor]
 */

/**
 * @typedef {object} SourceInfo
 * @property {string} sourceId
 * @property {string} display
 * @property {number} width
 * @property {number} height
 * @property {number} offsetX
 * @property {number} offsetY
 */

/**
 * Resolve the x11grab capture info for a given selectedSourceId.
 *
 * @param {object} params
 * @param {string | null | undefined} params.selectedSourceId
 * @param {ElectronDisplayLike[]} params.displays
 * @param {CachedCaptureSource[]} params.cachedCaptureSources
 * @param {string} params.x11DisplayName           Normalized X11 display name (e.g. ':0')
 * @param {(display: ElectronDisplayLike, displays: ElectronDisplayLike[]) => CaptureBounds} params.getDisplayCaptureBounds
 * @param {((info: Record<string, unknown>) => void) | null} [params.logDiagnostic]
 * @returns {SourceInfo | null}
 */
export function resolveCaptureSourceInfo({
  selectedSourceId,
  displays,
  cachedCaptureSources,
  x11DisplayName,
  getDisplayCaptureBounds,
  logDiagnostic = null,
}) {
  if (!selectedSourceId) return null;
  if (typeof selectedSourceId !== 'string') return null;
  if (!selectedSourceId.startsWith('screen:')) return null;
  if (!Array.isArray(displays) || displays.length === 0) return null;

  const cachedSource = cachedCaptureSources.find((entry) => entry?.id === selectedSourceId) ?? null;
  const displayIdFromCache =
    cachedSource?.displayId != null ? String(cachedSource.displayId) : null;
  const displayIdFromId = selectedSourceId.split(':')[1] ?? null;

  const resolvedDisplay =
    (displayIdFromCache && displays.find((d) => String(d.id) === displayIdFromCache)) ||
    (displayIdFromId && displays.find((d) => String(d.id) === displayIdFromId)) ||
    displays[0];

  if (!resolvedDisplay) return null;

  const captureBounds = getDisplayCaptureBounds(resolvedDisplay, displays);

  if (logDiagnostic) {
    logDiagnostic({
      selectedSourceId,
      cachedSource: cachedSource
        ? {
            id: cachedSource.id,
            name: cachedSource.name,
            type: cachedSource.type,
            displayId: cachedSource.displayId,
          }
        : null,
      allDisplays: displays.map((d) => ({
        id: d.id,
        label: d.label,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
      })),
      displayId: resolvedDisplay.id,
      bounds: resolvedDisplay.bounds,
      captureBounds,
      scaleFactor: resolvedDisplay.scaleFactor,
    });
  }

  return {
    sourceId: selectedSourceId,
    display: `${x11DisplayName}+${captureBounds.x},${captureBounds.y}`,
    width: captureBounds.width,
    height: captureBounds.height,
    offsetX: captureBounds.x,
    offsetY: captureBounds.y,
  };
}
