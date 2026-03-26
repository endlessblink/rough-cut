import { useCallback, useEffect, useState } from 'react';
import { PreviewCompositor } from '@rough-cut/preview-renderer';
import { projectStore, transportStore } from './use-stores.js';

// Module-level singleton — survives tab switches
let sharedCompositor: PreviewCompositor | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let initPromise: Promise<void> | null = null;

function ensureCompositor(): void {
  if (!sharedCompositor) {
    sharedCompositor = new PreviewCompositor(
      { width: 640, height: 360 },
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
  if (canvas.parentElement && canvas.parentElement !== host) {
    canvas.parentElement.removeChild(canvas);
  }
  // Attach to this host
  if (!host.contains(canvas)) {
    host.appendChild(canvas);
  }
  // Fit canvas into the preview card via CSS
  canvas.style.width = '100%';
  canvas.style.maxWidth = '100%';
  canvas.style.height = '100%';
  canvas.style.objectFit = 'contain';
  canvas.style.display = 'block';
}

/**
 * Hook that manages the shared PreviewCompositor and returns a callback ref
 * to attach to a container div. When the div appears in the DOM (e.g. after
 * a conditional render), the canvas is immediately attached.
 *
 * Usage:
 *   const { previewRef, isReady } = useCompositor();
 *   return <div ref={previewRef} style={{ width: '100%', height: '100%' }} />;
 */
export function useCompositor(): {
  previewRef: (node: HTMLDivElement | null) => void;
  isReady: boolean;
} {
  const [isReady, setIsReady] = useState(false);

  // Ensure compositor singleton exists
  useEffect(() => {
    ensureCompositor();
  }, []);

  // Callback ref — called when the div mounts/unmounts
  const previewRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      // Div appeared in the DOM — attach canvas
      const tryAttach = async () => {
        if (initPromise) await initPromise;
        if (sharedCanvas) {
          attachCanvasToHost(node);
          setIsReady(true);
        }
      };
      void tryAttach();
    } else {
      // Div removed from DOM — detach canvas (don't destroy)
      const canvas = sharedCanvas;
      if (canvas?.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      setIsReady(false);
    }
  }, []);

  return { previewRef, isReady };
}
