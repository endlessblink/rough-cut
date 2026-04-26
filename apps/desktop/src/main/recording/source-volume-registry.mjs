// @ts-check
/**
 * Tracks the original PulseAudio source volume the first time we touch each
 * source, so we can restore it on app quit. App-session lifetime — the map
 * is kept in module scope and reset only on process exit.
 *
 * Used by the pre-record mic-gain slider (TASK-199 family) so the slider
 * doesn't permanently leave the user's system mic at a reduced level after
 * the app closes.
 */
import { execFileSync } from 'node:child_process';
import { getSourceVolumePercent, setSourceVolumePercent } from './audio-sources.mjs';

/** @type {Map<string, number>} sourceName -> originalPercent */
const originals = new Map();

/**
 * Snapshot the source's current volume the first time we see it. Subsequent
 * calls are no-ops so we never overwrite the true original with a value we
 * already changed.
 *
 * @param {string} sourceName
 */
export async function snapshotIfFirstTouch(sourceName) {
  if (!sourceName || originals.has(sourceName)) return;
  const percent = await getSourceVolumePercent(sourceName);
  if (percent !== null) {
    originals.set(sourceName, percent);
  }
}

/**
 * Restore every touched source to its snapshotted original. Best-effort.
 */
export async function restoreAllSourceVolumes() {
  const entries = Array.from(originals.entries());
  for (const [sourceName, percent] of entries) {
    await setSourceVolumePercent(sourceName, percent);
  }
  originals.clear();
}

/**
 * Synchronous restore for use inside Electron `will-quit`, where the event
 * loop is shutting down and async work isn't reliable. Calls pactl via
 * execFileSync directly. Best-effort — swallows errors per source.
 */
export function restoreAllSourceVolumesSync() {
  for (const [sourceName, percent] of originals.entries()) {
    try {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      execFileSync('pactl', ['set-source-volume', sourceName, `${clamped}%`], {
        timeout: 2000,
        stdio: 'ignore',
      });
    } catch (err) {
      console.warn(
        '[source-volume-registry] sync restore failed for',
        sourceName,
        err?.message ?? err,
      );
    }
  }
  originals.clear();
}

/** Test/debug helpers — not for production callers. */
export function _peekRegistrySize() {
  return originals.size;
}
export function _clearRegistry() {
  originals.clear();
}
