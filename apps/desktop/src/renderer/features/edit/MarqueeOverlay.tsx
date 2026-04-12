import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Track, TrackId } from '@rough-cut/project-model';
import { getClipsInFrameRange } from '@rough-cut/timeline-engine';

interface MarqueeOverlayProps {
  containerRef: RefObject<HTMLDivElement>;
  tracks: readonly Track[];
  pixelsPerFrame: number;
  labelWidth: number;
  rulerHeight: number;
  trackHeight: number;
  onSelectRange: (clipIds: readonly string[], mode: 'replace' | 'add') => void;
  onEmptyClick: () => void;
}

interface MarqueeRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const DRAG_THRESHOLD_PX = 3;
const MARQUEE_SELECTOR = '[data-marquee-background]';

export function MarqueeOverlay({
  containerRef,
  tracks,
  pixelsPerFrame,
  labelWidth,
  rulerHeight,
  trackHeight,
  onSelectRange,
  onEmptyClick,
}: MarqueeOverlayProps) {
  const [rect, setRect] = useState<MarqueeRect | null>(null);
  const tracksRef = useRef(tracks);
  const ppfRef = useRef(pixelsPerFrame);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    ppfRef.current = pixelsPerFrame;
  }, [pixelsPerFrame]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const bgEl = target.closest(MARQUEE_SELECTOR);
      // Only start marquee when mousedown is directly on the empty track background.
      // If the user clicked a clip or any descendant, target !== bgEl and we bail.
      if (!bgEl || target !== bgEl) return;

      e.preventDefault();
      const elRect = el.getBoundingClientRect();
      const x0 = e.clientX - elRect.left + el.scrollLeft;
      const y0 = e.clientY - elRect.top + el.scrollTop;
      const shift = e.shiftKey;
      let endX = x0;
      let endY = y0;
      setRect({ x1: x0, y1: y0, x2: x0, y2: y0 });

      const onMove = (me: MouseEvent) => {
        const r = el.getBoundingClientRect();
        endX = me.clientX - r.left + el.scrollLeft;
        endY = me.clientY - r.top + el.scrollTop;
        setRect({ x1: x0, y1: y0, x2: endX, y2: endY });
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);

        const dragged =
          Math.abs(endX - x0) > DRAG_THRESHOLD_PX || Math.abs(endY - y0) > DRAG_THRESHOLD_PX;

        if (!dragged) {
          if (!shift) onEmptyClick();
          setRect(null);
          return;
        }

        const startX = Math.min(x0, endX);
        const stopX = Math.max(x0, endX);
        const startY = Math.min(y0, endY);
        const stopY = Math.max(y0, endY);

        const ppf = ppfRef.current;
        const startFrame = Math.max(0, Math.floor((startX - labelWidth) / ppf));
        const endFrame = Math.max(startFrame, Math.ceil((stopX - labelWidth) / ppf));

        const currentTracks = tracksRef.current;
        const startTrackIdx = Math.max(0, Math.floor((startY - rulerHeight) / trackHeight));
        const endTrackIdx = Math.min(
          currentTracks.length - 1,
          Math.floor((stopY - rulerHeight) / trackHeight),
        );

        if (endTrackIdx >= startTrackIdx && currentTracks.length > 0 && endFrame > startFrame) {
          const trackIds: TrackId[] = [];
          for (let i = startTrackIdx; i <= endTrackIdx; i++) {
            const t = currentTracks[i];
            if (t) trackIds.push(t.id);
          }
          const hits = getClipsInFrameRange(currentTracks, startFrame, endFrame, trackIds);
          const ids = hits.map((c) => c.id);
          onSelectRange(ids, shift ? 'add' : 'replace');
        } else if (!shift) {
          onEmptyClick();
        }

        setRect(null);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    el.addEventListener('mousedown', onMouseDown);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
    };
  }, [containerRef, labelWidth, rulerHeight, trackHeight, onSelectRange, onEmptyClick]);

  if (!rect) return null;

  const left = Math.min(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const width = Math.abs(rect.x2 - rect.x1);
  const height = Math.abs(rect.y2 - rect.y1);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        background: 'rgba(90,200,250,0.15)',
        border: '1px solid rgba(90,200,250,0.6)',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  );
}
