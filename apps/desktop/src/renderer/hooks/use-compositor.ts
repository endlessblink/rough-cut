import { useCallback, useState } from 'react';
import { PreviewCompositor, PlaybackController } from '@rough-cut/preview-renderer';
import { projectStore, transportStore } from './use-stores.js';

// Module-level singletons — survive tab switches
let sharedCompositor: PreviewCompositor | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let initPromise: Promise<void> | null = null;
let playbackController: PlaybackController | null = null;

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

      // Wire transport store -> compositor
      transportStore.subscribe((state) => {
        sharedCompositor?.seekTo(state.playheadFrame);
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

  // Fill the host frame — use object-fit so the canvas scales correctly
  // regardless of native resolution vs frame aspect ratio.
  canvas.style.position = '';
  canvas.style.inset = '';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.objectFit = 'fill';
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
