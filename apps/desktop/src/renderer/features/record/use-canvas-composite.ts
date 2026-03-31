/**
 * useCanvasComposite — Composites screen + camera streams onto a single canvas.
 *
 * Eliminates double-video-element decode overhead in the floating recording
 * panel by drawing both streams imperatively onto one canvas surface.
 *
 * The hook creates hidden video elements (not in the React render tree) and
 * drives a requestAnimationFrame loop at a capped 30 fps. The canvas ref
 * returned by the hook is the only DOM element callers need to render.
 *
 * NOTE: The original MediaStream objects are untouched — MediaRecorder still
 * uses them directly for recording. This hook is display-only.
 */

import { useEffect, useRef } from 'react';

/** Canvas width for the preview surface (screen content). */
const CANVAS_W = 640;
/** Canvas height for the preview surface. */
const CANVAS_H = 360;

/** Diameter of the camera picture-in-picture circle (px). */
const CAM_DIAMETER = 80;
/** Right/bottom margin for the camera circle (px). */
const CAM_MARGIN = 8;

/** Minimum milliseconds between drawn frames (≈30 fps). */
const FRAME_INTERVAL_MS = 1000 / 30;

export interface UseCanvasCompositeResult {
  /** Attach this ref to the <canvas> element in your render tree. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** True once the canvas context is ready (always true after mount). */
  ready: boolean;
}

/**
 * @param screenStream - MediaStream from getDisplayMedia (screen capture).
 * @param cameraStream - MediaStream from getUserMedia (webcam), or null.
 */
export function useCanvasComposite(
  screenStream: MediaStream | null,
  cameraStream: MediaStream | null,
): UseCanvasCompositeResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hidden video elements — created once, never in the DOM.
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  // rAF handle for cleanup.
  const rafRef = useRef<number>(0);

  // Timestamp of the last drawn frame (for fps cap).
  const lastFrameTimeRef = useRef<number>(0);

  // Create hidden video elements on mount.
  useEffect(() => {
    const sv = document.createElement('video');
    sv.muted = true;
    sv.playsInline = true;
    sv.autoplay = true;
    screenVideoRef.current = sv;

    const cv = document.createElement('video');
    cv.muted = true;
    cv.playsInline = true;
    cv.autoplay = true;
    cameraVideoRef.current = cv;

    return () => {
      sv.srcObject = null;
      cv.srcObject = null;
    };
  }, []);

  // Attach / detach screen stream.
  useEffect(() => {
    const sv = screenVideoRef.current;
    if (!sv) return;
    if (screenStream) {
      sv.srcObject = screenStream;
      void sv.play().catch(() => {});
    } else {
      sv.srcObject = null;
    }
  }, [screenStream]);

  // Attach / detach camera stream.
  useEffect(() => {
    const cv = cameraVideoRef.current;
    if (!cv) return;
    if (cameraStream) {
      cv.srcObject = cameraStream;
      void cv.play().catch(() => {});
    } else {
      cv.srcObject = null;
    }
  }, [cameraStream]);

  // rAF draw loop.
  useEffect(() => {
    let disposed = false;

    const draw = (now: number) => {
      if (disposed) return;
      rafRef.current = requestAnimationFrame(draw);

      // Cap at ~30 fps.
      if (now - lastFrameTimeRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTimeRef.current = now;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const sv = screenVideoRef.current;
      const cv = cameraVideoRef.current;

      // Clear to black.
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw screen stream (fills canvas).
      if (sv && sv.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && sv.videoWidth > 0) {
        // Letterbox/pillarbox to preserve aspect ratio (objectFit: contain behaviour).
        const srcAspect = sv.videoWidth / sv.videoHeight;
        const dstAspect = CANVAS_W / CANVAS_H;

        let dx = 0, dy = 0, dw = CANVAS_W, dh = CANVAS_H;
        if (srcAspect > dstAspect) {
          // wider than canvas — pillarbox
          dh = CANVAS_W / srcAspect;
          dy = (CANVAS_H - dh) / 2;
        } else {
          // taller than canvas — letterbox
          dw = CANVAS_H * srcAspect;
          dx = (CANVAS_W - dw) / 2;
        }
        ctx.drawImage(sv, dx, dy, dw, dh);
      } else {
        // Placeholder: dark background with no stream.
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // Draw camera as a circular PiP in bottom-right.
      if (cv && cv.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && cv.videoWidth > 0) {
        const r = CAM_DIAMETER / 2;
        const cx = CANVAS_W - CAM_MARGIN - r;
        const cy = CANVAS_H - CAM_MARGIN - r;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        // Camera is 320×240 — crop to a 1:1 square for the circle.
        const srcSize = Math.min(cv.videoWidth, cv.videoHeight);
        const srcX = (cv.videoWidth - srcSize) / 2;
        const srcY = (cv.videoHeight - srcSize) / 2;
        ctx.drawImage(cv, srcX, srcY, srcSize, srcSize, cx - r, cy - r, CAM_DIAMETER, CAM_DIAMETER);

        ctx.restore();

        // Border ring around the camera circle.
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, []); // loop is data-independent — refs handle stream changes

  return { canvasRef, ready: true };
}
