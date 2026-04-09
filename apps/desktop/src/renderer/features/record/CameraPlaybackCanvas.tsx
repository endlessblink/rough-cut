/**
 * CameraPlaybackCanvas — displays camera recording frames synced to the transport.
 * Uses WebCodecs CameraFrameDecoder for frame-accurate playback.
 */
import { useRef, useEffect, useState } from 'react';
import { CameraFrameDecoder } from '@rough-cut/preview-renderer';
import { useTransportStore } from '../../hooks/use-stores.js';

interface CameraPlaybackCanvasProps {
  filePath: string;
  fps: number;
}

export function CameraPlaybackCanvas({ filePath, fps }: CameraPlaybackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<CameraFrameDecoder | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [ready, setReady] = useState(false);
  const lastTimeRef = useRef(-1);

  // Initialize decoder
  useEffect(() => {
    const decoder = new CameraFrameDecoder();
    decoderRef.current = decoder;
    setReady(false);

    const init = async () => {
      try {
        const buf = await (window as any).roughcut.readBinaryFile(filePath);
        if (!buf) {
          console.error('[CameraPlaybackCanvas] readBinaryFile returned null for:', filePath);
          return;
        }
        await decoder.init(buf);
        setReady(true);
        console.info('[CameraPlaybackCanvas] Decoder ready for:', filePath);
      } catch (err) {
        console.error('[CameraPlaybackCanvas] Init failed:', err);
      }
    };

    void init();

    return () => {
      setReady(false);
      decoderRef.current = null;
      decoder.dispose();
    };
  }, [filePath]);

  // Subscribe to transport frame changes
  const currentFrame = useTransportStore((s) => s.playheadFrame);

  // Eagerly prefetch from time 0 once the decoder is ready
  useEffect(() => {
    if (!ready || !decoderRef.current) return;
    decoderRef.current.prefetch(0).catch(() => {});
  }, [ready]);

  useEffect(() => {
    if (!ready || !decoderRef.current || !canvasRef.current) return;

    const targetTime = currentFrame / fps;
    // Skip if same time (avoid redundant decodes)
    if (Math.abs(lastTimeRef.current - targetTime) < 0.01) return;
    lastTimeRef.current = targetTime;

    const decoder = decoderRef.current;
    const canvas = canvasRef.current;

    // Sync path only: read from buffer, never block on getFrame during playback.
    // If buffer misses, the canvas keeps showing the previous frame.
    const vf = decoder.getBufferedFrame(targetTime);
    if (vf) {
      drawFrame(canvas, ctxRef, vf);
    }

    // Keep buffer warm ahead of the playhead (background, non-blocking)
    decoder.prefetch(targetTime).catch(() => {});
  }, [currentFrame, fps, ready]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}

function drawFrame(
  canvas: HTMLCanvasElement,
  ctxRef: React.MutableRefObject<CanvasRenderingContext2D | null>,
  vf: VideoFrame,
): void {
  // Set canvas size to match video frame on first draw
  if (canvas.width !== vf.displayWidth || canvas.height !== vf.displayHeight) {
    canvas.width = vf.displayWidth;
    canvas.height = vf.displayHeight;
    ctxRef.current = canvas.getContext('2d');
  }
  if (ctxRef.current) {
    ctxRef.current.drawImage(vf, 0, 0);
  }
  vf.close();
}
