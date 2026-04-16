import { useEffect } from 'react';
import { useCanvasComposite } from './use-canvas-composite.js';

interface LivePreviewCanvasProps {
  stream: MediaStream | null;
}

const PREVIEW_CANVAS_WIDTH = 640;
const PREVIEW_CANVAS_HEIGHT = 360;

export function LivePreviewCanvas({ stream }: LivePreviewCanvasProps) {
  const { canvasRef } = useCanvasComposite(stream, null);
  const mutableCanvasRef = canvasRef as { current: HTMLCanvasElement | null };

  useEffect(() => {
    const canvas = mutableCanvasRef.current;
    if (!canvas) return;

    canvas.width = PREVIEW_CANVAS_WIDTH;
    canvas.height = PREVIEW_CANVAS_HEIGHT;
  }, [canvasRef]);

  return (
    <canvas
      ref={(node) => {
        mutableCanvasRef.current = node;
      }}
      data-testid="live-preview-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        backgroundColor: 'transparent',
      }}
    />
  );
}
