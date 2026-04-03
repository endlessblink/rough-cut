/**
 * use-playback-manager.ts — singleton PlaybackManager for the app.
 *
 * Module-level singleton that survives React re-renders and tab switches.
 * usePlaybackManager() hook for React components.
 * getPlaybackManager() for non-React code (store callbacks, etc.)
 */

import { PlaybackManager } from '@rough-cut/preview-renderer';
import { transportStore, projectStore } from './use-stores.js';

let manager: PlaybackManager | null = null;

export function getPlaybackManager(): PlaybackManager {
  if (!manager) {
    manager = new PlaybackManager({
      transportStore,
      projectStore,
    });
  }
  return manager;
}

/** React hook — returns the singleton PlaybackManager */
export function usePlaybackManager(): PlaybackManager {
  return getPlaybackManager();
}
