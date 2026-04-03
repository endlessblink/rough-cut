import { useCallback, useState } from 'react';
import { PreviewCompositor } from '@rough-cut/preview-renderer';
import { projectStore } from './use-stores.js';
import { getPlaybackManager } from './use-playback-manager.js';

// Module-level singletons — survive tab switches
let sharedCompositor: PreviewCompositor | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let initPromise: Promise<void> | null = null;

function ensureCompositor(): void {
  if (!sharedCompositor) {
    sharedCompositor = new PreviewCompositor(
      { width: 1920, height: 1080 },
      {},
    );

    initPromise = sharedCompositor.init().then((canvas) => {
      sharedCanvas = canvas;

      // Wire project store -> compositor (project changes = re-render)
      projectStore.subscribe((state) => {
        sharedCompositor?.setProject(state.project);
      });

      // Register compositor with PlaybackManager (single owner of playback)
      getPlaybackManager().registerCompositor(sharedCompositor!);

      // Apply current state
      sharedCompositor?.setProject(projectStore.getState().project);
    });
  }
}

function attachCanvasToHost(host: HTMLDivElement): void {
  const canvas = sharedCanvas;
  if (!canvas) return;

  if (canvas.parentElement && canvas.parentElement !== host && !host.contains(canvas)) {
    canvas.parentElement.removeChild(canvas);
  }

  if (!host.contains(canvas)) {
    host.appendChild(canvas);
  }

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
