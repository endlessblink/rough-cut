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

  function startScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSeekFrame(e.clientX);
    const handleMove = (ev: PointerEvent) => onSeekFrame(ev.clientX);
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
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
