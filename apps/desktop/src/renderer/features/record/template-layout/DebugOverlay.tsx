import React, { useEffect } from 'react';
import type { Rect } from './types.js';

export interface DebugRect {
  rect: Rect;
  label: string;
  color: string;
}

export interface DebugOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
  /** The rects to visualize */
  rects: DebugRect[];
  /** Container dimensions for logging */
  containerWidth?: number;
  containerHeight?: number;
}

/** Standard debug colors for common layout slots */
export const DEBUG_COLORS = {
  canvas: '#00ff00',
  inner: '#ffff00',
  screenFrame: '#ff6600',
  cameraFrame: '#ff00ff',
  mediaFit: '#00ffff',
} as const;

export function DebugOverlay({ visible, rects, containerWidth, containerHeight }: DebugOverlayProps): React.ReactElement | null {
  useEffect(() => {
    if (!visible) return;

    console.log('[DebugOverlay] Layout rects:');
    if (containerWidth !== undefined && containerHeight !== undefined) {
      console.log(`  container: ${containerWidth}x${containerHeight}`);
    }
    for (const { rect, label } of rects) {
      const padded = label.padEnd(14);
      console.log(`  ${padded}{ x: ${rect.x}, y: ${rect.y}, w: ${rect.width}, h: ${rect.height} }`);
    }
  }, [visible, rects, containerWidth, containerHeight]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {rects.map(({ rect, label, color }) => (
        <div
          key={label}
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            border: `2px dashed ${color}`,
            backgroundColor: `${color}0d`, // ~5% opacity
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              fontSize: 8,
              lineHeight: '12px',
              padding: '0 3px',
              backgroundColor: color,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
