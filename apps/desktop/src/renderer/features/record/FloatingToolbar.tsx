import React, { useEffect, useRef, useState } from 'react';
import { formatElapsed } from './format-elapsed';

// ─── Pulse animation ──────────────────────────────────────────────────────────

const PULSE_KEYFRAMES = `
@keyframes rc-toolbar-pulse {
  0%   { transform: scale(1);   opacity: 1; }
  50%  { transform: scale(1.4); opacity: 0.7; }
  100% { transform: scale(1);   opacity: 1; }
}
`;

function injectPulseAnimation() {
  const id = 'rc-toolbar-pulse-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = PULSE_KEYFRAMES;
  document.head.appendChild(style);
}

// ─── RecordingDot ─────────────────────────────────────────────────────────────

function RecordingDot() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#ef4444',
        flexShrink: 0,
        animation: 'rc-toolbar-pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

// ─── StopButton ───────────────────────────────────────────────────────────────

function StopButton({ onStop }: { onStop: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = pressed
    ? 'rgba(220,220,220,1)'
    : hovered
      ? 'rgba(245,245,245,1)'
      : 'rgba(255,255,255,1)';

  return (
    <button
      aria-label="Stop recording"
      onClick={onStop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        // Must not be draggable
        WebkitAppRegion: 'no-drag',
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: 'none',
        background: bg,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 120ms ease-out',
        outline: 'none',
        padding: 0,
      } as React.CSSProperties}
    >
      {/* Stop square icon */}
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 11,
          height: 11,
          borderRadius: 2,
          background: '#18181b',
          flexShrink: 0,
        }}
      />
    </button>
  );
}

// ─── FloatingToolbar ──────────────────────────────────────────────────────────

export function FloatingToolbar() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    injectPulseAnimation();

    // Signal readiness to the session manager
    window.roughcut.notifyToolbarReady();

    // Subscribe to elapsed-time ticks (ms → seconds)
    const unsubscribe = window.roughcut.onSessionElapsed((ms: number) => {
      setElapsedSeconds(Math.floor(ms / 1000));
    });

    cleanupRef.current = unsubscribe;

    return () => {
      cleanupRef.current?.();
    };
  }, []);

  function handleStop() {
    window.roughcut.recordingSessionStop();
  }

  return (
    <div
      style={{
        // Sizing
        width: 300,
        height: 48,
        // Pill shape
        borderRadius: 24,
        // Appearance
        background: 'rgba(24, 24, 27, 0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.40), 0 1px 4px rgba(0, 0, 0, 0.25)',
        // Layout
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 14,
        paddingRight: 8,
        gap: 10,
        // Drag — entire bar is draggable
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        // Prevent text cursor during drag
        cursor: 'default',
      } as React.CSSProperties}
    >
      {/* Recording indicator */}
      <RecordingDot />

      {/* Elapsed timer */}
      <span
        style={{
          fontFamily: '"SF Mono", "Fira Mono", "Consolas", monospace',
          fontSize: 13,
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.92)',
          letterSpacing: '0.04em',
          minWidth: 38,
          flexShrink: 0,
        }}
      >
        {formatElapsed(elapsedSeconds)}
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Stop button */}
      <StopButton onStop={handleStop} />
    </div>
  );
}
