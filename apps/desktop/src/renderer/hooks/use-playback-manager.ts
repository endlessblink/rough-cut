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

type PlaybackManagerProjectStore = ConstructorParameters<typeof PlaybackManager>[0]['projectStore'];

export function getPlaybackManager(): PlaybackManager {
  if (!manager) {
    manager = new PlaybackManager({
      transportStore,
      projectStore: projectStore as unknown as PlaybackManagerProjectStore,
    });
    if (typeof window !== 'undefined') {
      (window as unknown as { __roughcutPlaybackManager?: PlaybackManager }).__roughcutPlaybackManager =
        manager;
    }
  }
  return manager;
}

/** React hook — returns the singleton PlaybackManager */
export function usePlaybackManager(): PlaybackManager {
  return getPlaybackManager();
}
