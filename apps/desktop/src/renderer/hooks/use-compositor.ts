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
    const { width, height } = projectStore.getState().project.settings.resolution;
    sharedCompositor = new PreviewCompositor(
      { width: width || 1920, height: height || 1080 },
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

  // Contain-fit: compute largest rect that fits host while keeping native aspect.
  // Host must use display:grid + place-items:center. Gaps show gradient (transparent bg).
  canvas.style.position = '';
  canvas.style.inset = '';
  canvas.style.display = 'block';

  const nativeW = canvas.width || 1920;
  const nativeH = canvas.height || 1080;
  const nativeAspect = nativeW / nativeH;

  const fitCanvas = () => {
    const hostW = host.clientWidth;
    const hostH = host.clientHeight;
    if (hostW === 0 || hostH === 0) return;
    const hostAspect = hostW / hostH;
    let drawW: number, drawH: number;
    if (hostAspect > nativeAspect) {
      drawH = hostH;
      drawW = hostH * nativeAspect;
    } else {
      drawW = hostW;
      drawH = hostW / nativeAspect;
    }
    canvas.style.width = `${Math.round(drawW)}px`;
    canvas.style.height = `${Math.round(drawH)}px`;
  };

  fitCanvas();
  const ro = new ResizeObserver(fitCanvas);
  ro.observe(host);
  (host as any).__canvasResizeObserver = ro;
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
