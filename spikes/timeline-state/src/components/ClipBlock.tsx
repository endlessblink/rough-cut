import React, { memo, useRef } from 'react';
import type { Clip } from '../types';

interface ClipBlockProps {
  clip: Clip;
  pixelsPerFrame: number;
}

/** Single clip on the timeline. Wrapped in memo — should NOT re-render during playback. */
export const ClipBlock = memo(function ClipBlock({ clip, pixelsPerFrame }: ClipBlockProps) {
  const renderCountRef = useRef(0);
  renderCountRef.current++;

  return (
    <div
      style={{
        position: 'absolute',
        left: clip.position * pixelsPerFrame,
        width: clip.duration * pixelsPerFrame,
        height: 28,
        background: clip.color,
        borderRadius: 3,
        fontSize: 10,
        color: 'white',
        padding: '2px 4px',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        opacity: 0.8,
      }}
      title={`${clip.id} renders: ${renderCountRef.current}`}
    >
      {clip.id} (r:{renderCountRef.current})
    </div>
  );
});
