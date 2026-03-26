/**
 * RecordTimelineShell: Presentation-only mini-timeline for the Record view.
 * Single clip bar + playhead + time ruler with scrubbing.
 * No structural edits — no trim handles, no multi-track, no clip labels.
 */
import { useRef, useEffect, useCallback, useMemo } from 'react';

interface RecordTimelineShellProps {
  durationFrames: number;
  currentFrame: number;
  fps: number;
  onScrub: (frame: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function chooseMajorTickInterval(durationSec: number): number {
  if (durationSec <= 10) return 1;
  if (durationSec <= 30) return 5;
  if (durationSec <= 120) return 10;
  return 30;
}

// ─── TimelineRuler ────────────────────────────────────────────────────────────

function TimelineRuler({
  durationFrames,
  fps,
}: {
  durationFrames: number;
  fps: number;
}) {
  const durationSec = durationFrames / fps;
  const interval = chooseMajorTickInterval(durationSec);

  const ticks = useMemo(() => {
    if (durationSec <= 0) return [];
    const result: { timeSec: number; pct: number }[] = [];
    for (let t = 0; t <= durationSec; t += interval) {
      result.push({ timeSec: t, pct: (t / durationSec) * 100 });
    }
    return result;
  }, [durationSec, interval]);

  return (
    <div
      style={{
        height: 20,
        minHeight: 20,
        position: 'relative',
        background: 'rgba(15,15,15,0.98)',
        flexShrink: 0,
        padding: '0 8px',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {ticks.map(({ timeSec, pct }) => (
        <div
          key={timeSec}
          style={{
            position: 'absolute',
            left: `${pct}%`,
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {/* Tick line */}
          <div
            style={{
              width: 1,
              height: 6,
              background: 'rgba(255,255,255,0.20)',
            }}
          />
          {/* Label */}
          <span
            style={{
              position: 'absolute',
              top: 1,
              fontSize: 9,
              color: 'rgba(255,255,255,0.45)',
              whiteSpace: 'nowrap',
              transform: 'translateX(-50%)',
              letterSpacing: '0.02em',
            }}
          >
            {formatTimecode(timeSec)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── TimelineTrack ────────────────────────────────────────────────────────────

function TimelineTrack({
  durationFrames,
  currentFrame,
  onScrub,
}: {
  durationFrames: number;
  currentFrame: number;
  onScrub: (frame: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  const frameFromClientX = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || durationFrames <= 0) return 0;
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const ratio = x / rect.width;
      return Math.round(ratio * durationFrames);
    },
    [durationFrames],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true;
      onScrub(frameFromClientX(e.clientX));

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        onScrub(frameFromClientX(ev.clientX));
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [frameFromClientX, onScrub],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isDraggingRef.current = false;
    };
  }, []);

  const ratio = durationFrames > 0 ? currentFrame / durationFrames : 0;
  const playheadPct = `${ratio * 100}%`;

  return (
    <div
      ref={trackRef}
      onMouseDown={handleMouseDown}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(7,7,7,0.98)',
        backgroundImage:
          'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 100%',
        cursor: 'pointer',
      }}
    >
      {/* Clip bar — single continuous recording */}
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: 0,
          right: 0,
          height: 32,
          borderRadius: 6,
          background:
            'linear-gradient(to right, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      />

      {/* Playhead line */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          bottom: 10,
          left: playheadPct,
          width: 2,
          background: '#ff7043',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
          transform: 'translateX(-1px)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Playhead handle */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: playheadPct,
          width: 10,
          height: 10,
          borderRadius: 999,
          background: '#ff7043',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          zIndex: 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
}

// ─── RecordTimelineShell ──────────────────────────────────────────────────────

export function RecordTimelineShell({
  durationFrames,
  currentFrame,
  fps,
  onScrub,
}: RecordTimelineShellProps) {
  return (
    <div
      style={{
        width: '100%',
        height: 120,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'rgba(8,8,8,0.96)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 32,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'rgba(0,0,0,0.80)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.72)',
            userSelect: 'none',
          }}
        >
          Timeline
        </span>
        {/* Right side: future zoom/fit controls */}
        <div style={{ display: 'flex', gap: 8 }} />
      </div>

      {/* Body */}
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <TimelineRuler durationFrames={durationFrames} fps={fps} />
        <TimelineTrack
          durationFrames={durationFrames}
          currentFrame={currentFrame}
          onScrub={onScrub}
        />
      </div>
    </div>
  );
}
