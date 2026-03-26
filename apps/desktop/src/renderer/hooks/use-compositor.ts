import { useEffect, useState } from 'react';
import { PreviewCompositor } from '@rough-cut/preview-renderer';
import { projectStore, transportStore } from './use-stores.js';

// Module-level singleton — survives tab switches
let sharedCompositor: PreviewCompositor | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let initPromise: Promise<void> | null = null;
let projectUnsub: (() => void) | null = null;
let transportUnsub: (() => void) | null = null;

function ensureCompositor(): PreviewCompositor {
  if (!sharedCompositor) {
    sharedCompositor = new PreviewCompositor(
      { width: 640, height: 360 },
      {},
    );

    // Initialize and wire store subscriptions (once)
    initPromise = sharedCompositor.init().then((canvas) => {
      sharedCanvas = canvas;

      // Wire project store -> compositor
      projectUnsub = projectStore.subscribe((state) => {
        sharedCompositor?.setProject(state.project);
      });

      // Wire transport store -> compositor
      transportUnsub = transportStore.subscribe((state) => {
        sharedCompositor?.seekTo(state.playheadFrame);
      });

      // Apply current state
      const currentState = projectStore.getState();
      sharedCompositor?.setProject(currentState.project);
    });
  }
  return sharedCompositor;
}

/**
 * Hook that manages the shared PreviewCompositor and mounts its canvas
 * into the provided container ref. Each view calls this independently;
 * the compositor is a singleton that persists across tab switches.
 */
export function useCompositor(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    ensureCompositor();
    let mounted = true;

    const attach = async () => {
      // Wait for init to complete
      if (initPromise) await initPromise;
      if (!mounted) return;

      const canvas = sharedCanvas;
      const host = containerRef.current;

      if (canvas && host) {
        // Remove from any previous parent
        if (canvas.parentElement && canvas.parentElement !== host) {
          canvas.parentElement.removeChild(canvas);
        }
        // Attach to this view's host
        if (!host.contains(canvas)) {
          host.appendChild(canvas);
        }
        setIsReady(true);
      }
    };

    void attach();

    return () => {
      mounted = false;
      // On unmount, remove canvas from this container (but don't destroy compositor)
      const canvas = sharedCanvas;
      const host = containerRef.current;
      if (canvas && host && host.contains(canvas)) {
        host.removeChild(canvas);
      }
    };
  }, [containerRef]);

  return { isReady, compositor: sharedCompositor };
}
