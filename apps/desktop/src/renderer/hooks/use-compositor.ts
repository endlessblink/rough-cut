import { useCallback, useState } from 'react';
import { PreviewCompositor, PlaybackController } from '@rough-cut/preview-renderer';
import { projectStore, transportStore } from './use-stores.js';

// Module-level singletons — survive tab switches
let sharedCompositor: PreviewCompositor | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let initPromise: Promise<void> | null = null;
let playbackController: PlaybackController | null = null;

/** Get the current video playback time from the compositor (-1 if unavailable) */
export function getVideoCurrentTime(): number {
  return sharedCompositor?.getVideoCurrentTime() ?? -1;
}

/** Ensure PlaybackController exists — independent of compositor init */
function ensurePlayback(): void {
  if (!playbackController) {
    playbackController = new PlaybackController(transportStore, projectStore);
  }
}

function ensureCompositor(): void {
  // Always create playback controller (doesn't need PixiJS)
  ensurePlayback();

  if (!sharedCompositor) {
    // Always create at 16:9 (1920x1080) — the source recording resolution.
    // Project resolution changes with templates but the compositor must stay at source aspect.
    sharedCompositor = new PreviewCompositor(
      { width: 1920, height: 1080 },
      {},
    );

    // Initialize and wire store subscriptions (once)
    initPromise = sharedCompositor.init().then((canvas) => {
      sharedCanvas = canvas;

      // Wire project store -> compositor
      projectStore.subscribe((state) => {
        sharedCompositor?.setProject(state.project);
      });

      // Wire transport store -> compositor: play/pause transitions
      let wasPlaying = false;
      transportStore.subscribe((state) => {
        const nowPlaying = state.isPlaying;
        if (nowPlaying && !wasPlaying) {
          wasPlaying = true;
          sharedCompositor?.play();
        } else if (!nowPlaying && wasPlaying) {
          wasPlaying = false;
          sharedCompositor?.pause();
        }
      });

      // Wire transport store -> compositor: seek only when paused
      transportStore.subscribe((state) => {
        if (!state.isPlaying) {
          sharedCompositor?.seekTo(state.playheadFrame);
        }
      });

      // Start playback ticker to sync video.currentTime -> store playhead
      sharedCompositor!.startPlaybackTicker((timeSec) => {
        const fps = projectStore.getState().project.settings.frameRate;
        const frame = Math.round(timeSec * fps);
        const current = transportStore.getState().playheadFrame;
        // Only update if frame actually changed (avoids store churn)
        if (frame !== current) {
          transportStore.getState().setPlayheadFrame(frame);
        }
      });

      // Apply current state
      const currentState = projectStore.getState();
      sharedCompositor?.setProject(currentState.project);
    });
  }
}

function attachCanvasToHost(host: HTMLDivElement): void {
  const canvas = sharedCanvas;
  if (!canvas) return;

  // Remove from any previous parent
  if (canvas.parentElement && canvas.parentElement !== host && !host.contains(canvas)) {
    canvas.parentElement.removeChild(canvas);
  }

  if (!host.contains(canvas)) {
    host.appendChild(canvas);
  }

  // Force canvas to fill host via CSS !important — PixiJS renderer.resize()
  // overwrites inline styles, but !important in a style attribute wins.
  canvas.style.cssText = 'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;display:block !important;';
}

/**
 * Hook that manages the shared PreviewCompositor and returns a callback ref.
 */
export function useCompositor(): {
  previewRef: (node: HTMLDivElement | null) => void;
  isReady: boolean;
} {
  const [isReady, setIsReady] = useState(false);

  // Must run synchronously so initPromise is set before previewRef fires.
  ensureCompositor();

  const previewRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const tryAttach = async () => {
        if (initPromise) await initPromise;
        if (sharedCanvas) {
          attachCanvasToHost(node);
          setIsReady(true);
        }
      };
      void tryAttach();
    } else {
      const canvas = sharedCanvas;
      if (canvas?.parentElement) {
        const ro = (canvas.parentElement as any).__canvasResizeObserver;
        if (ro) { ro.disconnect(); delete (canvas.parentElement as any).__canvasResizeObserver; }
        canvas.parentElement.removeChild(canvas);
      }
      setIsReady(false);
    }
  }, []);

  return { previewRef, isReady };
}
