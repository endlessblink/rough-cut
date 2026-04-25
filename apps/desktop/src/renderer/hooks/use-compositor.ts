import { useCallback, useEffect, useState } from 'react';
import { PreviewCompositor } from '@rough-cut/preview-renderer';
import { projectStore, transportStore } from './use-stores.js';
import { getPlaybackManager } from './use-playback-manager.js';

// Module-level singletons — survive tab switches
let sharedCompositor: PreviewCompositor | null = null;
let sharedCanvas: HTMLCanvasElement | null = null;
let initPromise: Promise<void> | null = null;

function ensureCompositor(): void {
  if (!sharedCompositor) {
    sharedCompositor = new PreviewCompositor({ width: 1920, height: 1080 }, {});

    initPromise = sharedCompositor.init().then((canvas) => {
      sharedCanvas = canvas;

      // Wire project store -> compositor (project changes = re-render)
      projectStore.subscribe((state) => {
        sharedCompositor?.setProject(state.project);
      });

      // Wire transport store -> compositor (preview volume / mute)
      transportStore.subscribe((state, prev) => {
        if (state.previewVolume !== prev.previewVolume) {
          sharedCompositor?.setPlaybackVolume(state.previewVolume);
        }
        if (state.previewMuted !== prev.previewMuted) {
          sharedCompositor?.setPlaybackMuted(state.previewMuted);
        }
      });

      // Register compositor with PlaybackManager (single owner of playback)
      getPlaybackManager().registerCompositor(sharedCompositor!);

      // Apply current state
      sharedCompositor?.setProject(projectStore.getState().project);
      const transport = transportStore.getState();
      sharedCompositor?.setPlaybackVolume(transport.previewVolume);
      sharedCompositor?.setPlaybackMuted(transport.previewMuted);
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

  canvas.style.cssText =
    'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;display:block !important;';
}

/**
 * Hook that manages the shared PreviewCompositor and returns a callback ref.
 */
export function useCompositor(): {
  previewRef: (node: HTMLDivElement | null) => void;
  isReady: boolean;
  setPreferredPlaybackAssetId: (assetId: string | null) => void;
  setRenderSize: (width: number, height: number) => void;
  setCursorFrameData: (
    assetId: string,
    cursorData: { frames: Float32Array; frameCount: number } | null,
  ) => void;
} {
  const [isReady, setIsReady] = useState(false);
  const [hostNode, setHostNode] = useState<HTMLDivElement | null>(null);

  ensureCompositor();

  const previewRef = useCallback((node: HTMLDivElement | null) => {
    setHostNode(node);
  }, []);

  const setPreferredPlaybackAssetId = useCallback((assetId: string | null) => {
    sharedCompositor?.setPreferredPlaybackAssetId(assetId);
  }, []);

  const setRenderSize = useCallback((width: number, height: number) => {
    if (!sharedCompositor || !sharedCanvas || width <= 0 || height <= 0) return;
    const needsResize = sharedCanvas.width !== width || sharedCanvas.height !== height;
    if (needsResize) {
      sharedCompositor.resize(width, height);
    }
  }, []);

  const setCursorFrameData = useCallback(
    (assetId: string, cursorData: { frames: Float32Array; frameCount: number } | null) => {
      sharedCompositor?.setCursorFrameData(assetId, cursorData);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const tryAttach = async () => {
      const host = hostNode;
      if (!host) {
        setIsReady(false);
        return;
      }

      if (initPromise) await initPromise;
      if (cancelled || hostNode !== host || !sharedCanvas) return;

      attachCanvasToHost(host);
      setIsReady(true);
    };

    void tryAttach();

    return () => {
      cancelled = true;
      const canvas = sharedCanvas;
      if (canvas?.parentElement) {
        const ro = (canvas.parentElement as any).__canvasResizeObserver;
        if (ro) {
          ro.disconnect();
          delete (canvas.parentElement as any).__canvasResizeObserver;
        }
        canvas.parentElement.removeChild(canvas);
      }
      setIsReady(false);
    };
  }, [hostNode]);

  return { previewRef, isReady, setPreferredPlaybackAssetId, setRenderSize, setCursorFrameData };
}

export function getVideoCurrentTime(): number {
  return sharedCompositor?.getVideoCurrentTime() ?? -1;
}
