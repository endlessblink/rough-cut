import { useCallback, useEffect, useState } from 'react';
import { PreviewCompositor, PlaybackController } from '@rough-cut/preview-renderer';
import { projectStore, transportStore } from './use-stores.js';

// Module-level singleton — survives tab switches
let sharedCompositor: PreviewCompositor | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let initPromise: Promise<void> | null = null;

function ensureCompositor(): void {
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

      // Wire playback clock to transport store
      new PlaybackController(transportStore, projectStore);

      // Apply current state
      const currentState = projectStore.getState();
      sharedCompositor?.setProject(currentState.project);
    });
  }
}

function attachCanvasToHost(host: HTMLDivElement): void {
  const canvas = sharedCanvas;
  if (!canvas) return;

  // Remove from any previous parent (unwrap if needed)
  if (canvas.parentElement && canvas.parentElement !== host && !host.contains(canvas)) {
    canvas.parentElement.removeChild(canvas);
  }

  // Attach to host — scale canvas to fit via CSS while preserving aspect ratio
  if (!host.contains(canvas)) {
    host.appendChild(canvas);
  }

  // The PixiJS canvas has a fixed internal resolution (e.g., 1920x1080).
  // Use object-fit:contain so the browser scales it down to fit the
  // available space without cropping.
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.objectFit = 'contain';
  canvas.style.display = 'block';

  // Ensure the host constrains the canvas properly
  host.style.overflow = 'hidden';
  host.style.display = 'flex';
  host.style.alignItems = 'center';
  host.style.justifyContent = 'center';
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
