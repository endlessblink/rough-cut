import React from 'react';
import { buildRulerTicks } from './ruler-ticks.mjs';

export function TimelineRuler({
  bodiesRef,
  durationFrames,
  fps,
  onSeekFrame,
}: {
  bodiesRef: React.RefObject<HTMLDivElement>;
  durationFrames: number;
  fps: number;
  onSeekFrame: (clientX: number) => void;
}) {
  const [widthPx, setWidthPx] = React.useState(0);

  React.useEffect(() => {
    const el = bodiesRef.current;
    if (!el) return;
    const update = () => setWidthPx(el.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bodiesRef]);

  // Captured pointer scrub: events stay on the ruler element (no window
  // listeners to leak) and pointercancel ends the gesture cleanly.
  function startScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSeekFrame(e.clientX);
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const handleMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) onSeekFrame(ev.clientX);
    };
    const handleEnd = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      el.removeEventListener('pointermove', handleMove);
      el.removeEventListener('pointerup', handleEnd);
      el.removeEventListener('pointercancel', handleEnd);
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        // already released
      }
    };
    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerup', handleEnd);
    el.addEventListener('pointercancel', handleEnd);
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // capture unsupported — bubbled events still reach the element
    }
  }

  const ticks = buildRulerTicks(durationFrames, fps, widthPx);

  return (
    <div className="nleTimelineRuler" data-ui-region="nle-time-ruler" onPointerDown={startScrub}>
      {ticks.map((tick) => (
        <span
          key={`${tick.frame}-${tick.major ? 'major' : 'minor'}`}
          className={`nleTimelineRulerTick ${tick.major ? 'major' : 'minor'}`}
          style={{ left: `${tick.leftPct}%` }}
        >
          {tick.label ? <span className="nleTimelineRulerLabel">{tick.label}</span> : null}
        </span>
      ))}
    </div>
  );
}
