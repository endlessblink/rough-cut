/**
 * PanelApp — Self-contained recording panel for the floating Electron window.
 *
 * Manages its own state, acquires its own MediaStream, runs its own
 * MediaRecorder, and communicates with the main process via window.roughcut.
 *
 * Layout (500 × 460):
 *   1. TitleBar      (32px)
 *   2. VideoPreview  (flex-grow)
 *   3. SourceSelector (40px)
 *   4. DeviceControls (40px)
 *   5. RecordingControls (56px)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureSource, RecordingMetadata } from '../../env.js';
import { CountdownOverlay } from './CountdownOverlay.js';
import { formatElapsed } from './format-elapsed.js';

// ─── Design tokens ─────────────────────────────────────────────────────────

const C = {
  bg: '#1a1a1d',
  surface: '#222226',
  accent: '#ff5a5f',
  accentDark: '#cc3a3e',
  accentHover: '#ff7477',
  text: '#e0e0e0',
  textSecondary: '#888',
  border: '#333',
  borderLight: '#3a3a3f',
  input: '#2a2a2e',
  inputHover: '#303035',
  previewBg: '#111',
} as const;

const R = {
  outer: 12,
  inner: 8,
  button: 6,
} as const;

// ─── Audio Level Hook ──────────────────────────────────────────────────────

function useAudioLevel(stream: MediaStream | null, enabled: boolean): number {
  const [level, setLevel] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !enabled) {
      setLevel(0);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setLevel(0);
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    ctxRef.current = ctx;

    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // RMS calculation for accurate VU meter
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const avg = Math.min(1, rms * 3); // scale up for visibility
      setLevel(avg);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      ctx.close().catch(() => {});
    };
  }, [stream, enabled]);

  return level;
}

// ─── Audio Level Meter ──────────────────────────────────────────────────────

function AudioLevelMeter({ level }: { level: number }) {
  const pct = Math.min(level * 300, 100);
  const color = level > 0.7 ? '#ef4444' : level > 0.4 ? '#eab308' : '#4ade80';

  return (
    <div style={{
      height: 4,
      background: 'rgba(255,255,255,0.08)',
      borderRadius: 2,
      marginLeft: 12,
      marginRight: 12,
      marginTop: 2,
      marginBottom: 2,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: color,
        borderRadius: 2,
        transition: 'width 50ms ease-out',
      }} />
    </div>
  );
}

// ─── Status type ────────────────────────────────────────────────────────────

type PanelStatus = 'idle' | 'ready' | 'countdown' | 'recording' | 'paused' | 'stopping';

// ─── Icons ─────────────────────────────────────────────────────────────────

function MonitorIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function MicIcon({ size = 14, color = C.text }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function CameraIcon({ size = 14, color = C.text }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function SpeakerIcon({ size = 14, color = C.text }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

// ─── Divider ────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: C.border,
        marginLeft: 10,
        marginRight: 10,
        flexShrink: 0,
      }}
    />
  );
}

// ─── Spinner ────────────────────────────────────────────────────────────────

function SpinnerDot() {
  return (
    <>
      <style>{`
        @keyframes panel-app-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: `2px solid ${C.border}`,
          borderTopColor: C.textSecondary,
          animation: 'panel-app-spin 0.8s linear infinite',
          flexShrink: 0,
        }}
      />
    </>
  );
}

// ─── PulsingDot ─────────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <>
      <style>{`
        @keyframes panel-app-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: C.accent,
          animation: 'panel-app-pulse 1.4s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
    </>
  );
}

// ─── TitleBar ───────────────────────────────────────────────────────────────

function TitleBar({ onClose }: { onClose: () => void }) {
  const [closeHovered, setCloseHovered] = useState(false);

  return (
    <div
      style={{
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 14,
        paddingRight: 10,
        flexShrink: 0,
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      } as React.CSSProperties}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: C.textSecondary,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        ROUGH CUT
      </span>

      <button
        aria-label="Close recording panel"
        onClick={onClose}
        onMouseEnter={() => setCloseHovered(true)}
        onMouseLeave={() => setCloseHovered(false)}
        style={{
          WebkitAppRegion: 'no-drag',
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: 'none',
          background: closeHovered ? 'rgba(255,255,255,0.12)' : 'transparent',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          outline: 'none',
          transition: 'background 120ms ease-out',
          color: C.textSecondary,
          fontSize: 16,
          lineHeight: 1,
        } as React.CSSProperties}
      >
        ×
      </button>
    </div>
  );
}

// ─── VideoPreview ───────────────────────────────────────────────────────────

interface VideoPreviewProps {
  stream: MediaStream | null;
  countdownSeconds: number;
  isCountingDown: boolean;
  cameraStream: MediaStream | null;
}

function VideoPreview({ stream, countdownSeconds, isCountingDown, cameraStream }: VideoPreviewProps) {
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  // Attach screen stream
  useEffect(() => {
    const el = screenVideoRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream]);

  // Attach camera stream
  useEffect(() => {
    const el = cameraVideoRef.current;
    if (!el) return;
    if (cameraStream) {
      el.srcObject = cameraStream;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [cameraStream]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
        background: C.previewBg,
        borderRadius: R.inner,
        overflow: 'hidden',
        margin: '0 10px',
      }}
    >
      {stream ? (
        <video
          ref={screenVideoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            borderRadius: R.inner,
          }}
        />
      ) : (
        <>
          {/* Hidden video so screenVideoRef stays populated */}
          <video
            ref={screenVideoRef}
            autoPlay
            muted
            playsInline
            style={{ display: 'none' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <MonitorIcon size={40} color={C.textSecondary} />
            <span style={{ fontSize: 12, color: C.textSecondary }}>
              Select a source to preview
            </span>
          </div>
        </>
      )}

      {/* Camera PiP overlay */}
      {cameraStream && (
        <video
          ref={cameraVideoRef}
          autoPlay
          muted
          playsInline
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            width: 80,
            height: 80,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '2px solid rgba(255,255,255,0.3)',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Countdown overlay (absolute, within preview bounds) */}
      <CountdownOverlay secondsRemaining={countdownSeconds} visible={isCountingDown} />
    </div>
  );
}

// ─── SourceSelector ─────────────────────────────────────────────────────────

interface SourceSelectorProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
}

function SourceSelector({ sources, selectedSourceId, onSelectSource }: SourceSelectorProps) {
  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 10,
        paddingRight: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ flexShrink: 0, opacity: 0.6 }}>
        <MonitorIcon size={16} color={C.text} />
      </div>

      <select
        value={selectedSourceId ?? ''}
        onChange={(e) => { if (e.target.value) onSelectSource(e.target.value); }}
        style={{
          flex: 1,
          height: 30,
          background: C.input,
          color: selectedSourceId ? C.text : C.textSecondary,
          border: `1px solid ${C.border}`,
          borderRadius: R.button,
          fontSize: 12,
          paddingLeft: 10,
          paddingRight: 28,
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '8px 5px',
        } as React.CSSProperties}
      >
        {sources.length === 0 ? (
          <option value="" disabled>No sources available</option>
        ) : (
          <>
            {!selectedSourceId && (
              <option value="" disabled>Select a source…</option>
            )}
            {sources.map((src) => (
              <option key={src.id} value={src.id}>{src.name}</option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}

// ─── DeviceToggleButton ─────────────────────────────────────────────────────

interface DeviceToggleButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  text: string;
  onToggle: () => void;
  showActiveDot?: boolean;
}

function DeviceToggleButton({
  label,
  icon,
  active,
  text,
  onToggle,
  showActiveDot = false,
}: DeviceToggleButtonProps) {
  const [hovered, setHovered] = useState(false);

  const bg = active
    ? hovered ? C.inputHover : C.input
    : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';

  const borderColor = active ? C.borderLight : 'rgba(255,255,255,0.12)';

  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: R.button,
        cursor: 'pointer',
        outline: 'none',
        padding: '0 8px',
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
        opacity: active ? 1 : 0.85,
      }}
    >
      {icon}
      <span style={{ fontSize: 11, color: active ? C.text : C.textSecondary, fontWeight: active ? 500 : 400, userSelect: 'none' }}>
        {text}
      </span>
      {showActiveDot && (
        <>
          <style>{`
            @keyframes panel-mic-pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50%       { opacity: 0.55; transform: scale(1.35); }
            }
          `}</style>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#4ade80',
              animation: 'panel-mic-pulse 1.6s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
        </>
      )}
    </button>
  );
}

// ─── DeviceControls ─────────────────────────────────────────────────────────

interface DeviceControlsProps {
  micEnabled: boolean;
  sysAudioEnabled: boolean;
  cameraEnabled: boolean;
  onMicToggle: () => void;
  onSysAudioToggle: () => void;
  onCameraToggle: () => void;
}

function DeviceControls({
  micEnabled,
  sysAudioEnabled,
  cameraEnabled,
  onMicToggle,
  onSysAudioToggle,
  onCameraToggle,
}: DeviceControlsProps) {
  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 10,
        paddingRight: 10,
        flexShrink: 0,
      }}
    >
      <DeviceToggleButton
        label="Microphone"
        icon={<MicIcon size={13} color={micEnabled ? C.text : C.textSecondary} />}
        active={micEnabled}
        text="Mic"
        onToggle={onMicToggle}
        showActiveDot={micEnabled}
      />
      <DeviceToggleButton
        label="System Audio"
        icon={<SpeakerIcon size={13} color={sysAudioEnabled ? C.text : C.textSecondary} />}
        active={sysAudioEnabled}
        text="Audio"
        onToggle={onSysAudioToggle}
      />
      <DeviceToggleButton
        label="Camera"
        icon={<CameraIcon size={13} color={cameraEnabled ? C.text : C.textSecondary} />}
        active={cameraEnabled}
        text="Camera"
        onToggle={onCameraToggle}
      />
    </div>
  );
}

// ─── RecordingControls ──────────────────────────────────────────────────────

interface RecordingControlsProps {
  status: PanelStatus;
  elapsedMs: number;
  canRecord: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTogglePause: () => void;
}

function RecordingControls({
  status,
  elapsedMs,
  canRecord,
  onStartRecording,
  onStopRecording,
  onTogglePause,
}: RecordingControlsProps) {
  return (
    <div
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 12,
        paddingRight: 12,
        flexShrink: 0,
      }}
    >
      {(status === 'idle' || status === 'ready') && (
        <RecButton onStart={onStartRecording} disabled={!canRecord} />
      )}
      {status === 'countdown' && (
        <StatusLabel text="Starting…" />
      )}
      {(status === 'recording' || status === 'paused') && (
        <RecordingRow
          elapsedMs={elapsedMs}
          paused={status === 'paused'}
          onStop={onStopRecording}
          onTogglePause={onTogglePause}
        />
      )}
      {status === 'stopping' && (
        <StatusLabel text="Saving…" showSpinner />
      )}
    </div>
  );
}

function RecButton({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = disabled
    ? 'rgba(255,90,95,0.35)'
    : pressed ? C.accentDark : hovered ? C.accentHover : C.accent;

  return (
    <button
      aria-label="Start recording"
      disabled={disabled}
      onClick={onStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: '100%',
        height: 40,
        borderRadius: R.inner,
        border: 'none',
        background: bg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        outline: 'none',
        transition: 'background 120ms ease-out',
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: disabled ? 'rgba(255,255,255,0.5)' : '#fff',
          letterSpacing: '0.06em',
          userSelect: 'none',
        }}
      >
        REC
      </span>
    </button>
  );
}

function StatusLabel({ text, showSpinner = false }: { text: string; showSpinner?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: C.textSecondary,
        fontSize: 13,
        fontWeight: 500,
        userSelect: 'none',
      }}
    >
      {showSpinner ? <SpinnerDot /> : <SpinnerDot />}
      {text}
    </div>
  );
}

function RecordingRow({
  elapsedMs,
  paused,
  onStop,
  onTogglePause,
}: {
  elapsedMs: number;
  paused: boolean;
  onStop: () => void;
  onTogglePause: () => void;
}) {
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
      <PauseButton paused={paused} onTogglePause={onTogglePause} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, userSelect: 'none' }}>
          <PulsingDot />
          <span
            style={{
              fontFamily: '"SF Mono", "Fira Mono", "Consolas", monospace',
              fontSize: 15,
              fontWeight: 600,
              color: C.text,
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      </div>

      <StopButton onStop={onStop} />
    </div>
  );
}

function PauseButton({ paused, onTogglePause }: { paused: boolean; onTogglePause: () => void }) {
  const [hovered, setHovered] = useState(false);
  const borderColor = paused ? C.accent : hovered ? C.borderLight : C.border;

  return (
    <button
      aria-label={paused ? 'Resume recording' : 'Pause recording'}
      onClick={onTogglePause}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36,
        height: 36,
        borderRadius: R.button,
        border: `1px solid ${borderColor}`,
        background: hovered ? C.inputHover : C.input,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        padding: 0,
        flexShrink: 0,
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      {paused ? (
        <svg width="11" height="13" viewBox="0 0 11 13" fill={C.text} aria-hidden="true">
          <polygon points="1,0 11,6.5 1,13" />
        </svg>
      ) : (
        <svg width="10" height="12" viewBox="0 0 10 12" fill={C.text} aria-hidden="true">
          <rect x="0" y="0" width="3.5" height="12" rx="1" />
          <rect x="6.5" y="0" width="3.5" height="12" rx="1" />
        </svg>
      )}
    </button>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = pressed
    ? 'rgba(255,90,95,0.25)'
    : hovered ? 'rgba(255,90,95,0.15)' : C.input;
  const borderColor = hovered ? 'rgba(255,90,95,0.5)' : C.border;

  return (
    <button
      aria-label="Stop recording"
      onClick={onStop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: 36,
        height: 36,
        borderRadius: R.button,
        border: `1px solid ${borderColor}`,
        background: bg,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        padding: 0,
        flexShrink: 0,
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 11,
          height: 11,
          borderRadius: 2,
          background: C.accent,
          flexShrink: 0,
        }}
      />
    </button>
  );
}

// ─── MiniPauseButton ────────────────────────────────────────────────────────

function MiniPauseButton({ paused, onTogglePause }: { paused: boolean; onTogglePause: () => void }) {
  const [hovered, setHovered] = useState(false);
  const borderColor = paused ? C.accent : hovered ? C.borderLight : C.border;

  return (
    <button
      aria-label={paused ? 'Resume recording' : 'Pause recording'}
      onClick={onTogglePause}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: R.button,
        border: `1px solid ${borderColor}`,
        background: hovered ? C.inputHover : C.input,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        padding: 0,
        flexShrink: 0,
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      {paused ? (
        <svg width="9" height="11" viewBox="0 0 11 13" fill={C.text} aria-hidden="true">
          <polygon points="1,0 11,6.5 1,13" />
        </svg>
      ) : (
        <svg width="8" height="10" viewBox="0 0 10 12" fill={C.text} aria-hidden="true">
          <rect x="0" y="0" width="3.5" height="12" rx="1" />
          <rect x="6.5" y="0" width="3.5" height="12" rx="1" />
        </svg>
      )}
    </button>
  );
}

// ─── MiniStopButton ──────────────────────────────────────────────────────────

function MiniStopButton({ onStop }: { onStop: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = pressed
    ? 'rgba(255,90,95,0.25)'
    : hovered ? 'rgba(255,90,95,0.15)' : C.input;
  const borderColor = hovered ? 'rgba(255,90,95,0.5)' : C.border;

  return (
    <button
      aria-label="Stop recording"
      onClick={onStop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: R.button,
        border: `1px solid ${borderColor}`,
        background: bg,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        padding: 0,
        flexShrink: 0,
        transition: 'background 120ms ease-out, border-color 120ms ease-out',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: 2,
          background: C.accent,
          flexShrink: 0,
        }}
      />
    </button>
  );
}

// ─── MiniController (pill bar during recording) ───────────────────────────

function MiniController({
  elapsedMs,
  paused,
  onStop,
  onTogglePause,
}: {
  elapsedMs: number;
  paused: boolean;
  onStop: () => void;
  onTogglePause: () => void;
}) {
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  return (
    <div
      style={{
        width: 340,
        height: 56,
        background: C.bg,
        borderRadius: 28,
        border: `1px solid ${C.border}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 20,
        paddingRight: 12,
        gap: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        color: C.text,
        userSelect: 'none',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Recording indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {paused ? (
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#eab308',
              flexShrink: 0,
            }}
          />
        ) : (
          <PulsingDot />
        )}
      </div>

      {/* Timer */}
      <span
        style={{
          fontFamily: '"SF Mono", "Fira Mono", "Consolas", monospace',
          fontSize: 15,
          fontWeight: 600,
          color: C.text,
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {formatElapsed(elapsedSeconds)}
      </span>

      {/* Paused label */}
      {paused && (
        <span style={{ fontSize: 11, color: '#eab308', fontWeight: 500, flexShrink: 0 }}>
          Paused
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag', flexShrink: 0 } as React.CSSProperties}>
        <MiniPauseButton paused={paused} onTogglePause={onTogglePause} />
        <MiniStopButton onStop={onStop} />
      </div>
    </div>
  );
}

// ─── MiniSavingIndicator ─────────────────────────────────────────────────────

function MiniSavingIndicator() {
  return (
    <div
      style={{
        width: 340,
        height: 56,
        background: C.bg,
        borderRadius: 28,
        border: `1px solid ${C.border}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        color: C.textSecondary,
        fontSize: 13,
        fontWeight: 500,
        userSelect: 'none',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <SpinnerDot />
      Saving…
    </div>
  );
}

// ─── PanelApp ───────────────────────────────────────────────────────────────

export function PanelApp() {
  // ── State ────────────────────────────────────────────────────────────────
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [sysAudioEnabled, setSysAudioEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Microphone stream for audio level monitoring (separate from screen capture stream)
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!micEnabled) {
      setMicStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((s) => setMicStream(s))
      .catch((err) => {
        console.warn('[PanelApp] Mic access failed:', err);
        setMicStream(null);
      });
    return () => {
      setMicStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, [micEnabled]);

  // Audio level monitoring from mic stream
  const audioLevel = useAudioLevel(micStream, micEnabled);

  // Mic toggle with track muting
  const handleMicToggle = useCallback(() => {
    setMicEnabled((prev) => {
      const next = !prev;
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => { t.enabled = next; });
      }
      return next;
    });
  }, []);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<BlobPart[]>([]);
  // Capture elapsed at the moment stop is triggered (recorder.onstop fires async)
  const elapsedMsAtStop = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep streamRef in sync so onstop closure can access current value
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // ── Load sources on mount ────────────────────────────────────────────────
  useEffect(() => {
    window.roughcut.recordingGetSources().then((srcs) => {
      setSources(srcs);
    }).catch(console.error);
  }, []);

  // ── IPC event subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    const unsubCountdown = window.roughcut.onSessionCountdownTick((s) => {
      setCountdownSeconds(s);
      setStatus('countdown');
    });

    const unsubStatus = window.roughcut.onSessionStatusChanged((s) => {
      if (s === 'recording') {
        setStatus('recording');
        startMediaRecorder();
      } else if (s === 'stopping') {
        stopMediaRecorder();
      } else if (s === 'idle') {
        setStatus('idle');
      }
    });

    const unsubElapsed = window.roughcut.onSessionElapsed((ms) => {
      setElapsedMs(ms);
    });

    return () => {
      unsubCountdown();
      unsubStatus();
      unsubElapsed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Camera stream management ─────────────────────────────────────────────
  useEffect(() => {
    if (!cameraEnabled) {
      setCameraStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      return;
    }
    let active = true;
    console.info('[PanelApp] Requesting camera via getUserMedia...');
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        console.info('[PanelApp] Camera stream acquired:', s.getVideoTracks().length, 'video tracks');
        if (active) setCameraStream(s);
        else s.getTracks().forEach((t) => t.stop());
      })
      .catch((err) => {
        console.error('[PanelApp] Camera getUserMedia FAILED:', err?.name, err?.message, err);
        if (active) setCameraStream(null);
      });
    return () => {
      active = false;
      setCameraStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, [cameraEnabled]);

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Source selection ─────────────────────────────────────────────────────
  const handleSelectSource = async (id: string) => {
    setSelectedSourceId(id);
    window.roughcut.panelSetSource(id);

    // Release previous stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      // getDisplayMedia() is intercepted by main process via setDisplayMediaRequestHandler
      // which uses the selectedSourceId we set above via panelSetSource
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true, // system audio via loopback
      });
      streamRef.current = s;
      setStream(s);
      setStatus('ready');
      console.info('[PanelApp] Stream acquired via getDisplayMedia');
    } catch (err) {
      console.error('[PanelApp] Failed to acquire stream:', err);
      setStatus('idle');
    }
  };

  // ── MediaRecorder helpers ────────────────────────────────────────────────
  // Store latest camera stream in a ref so the IPC callback (which uses [] deps)
  // always sees the current value instead of the stale closure from first render.
  const cameraStreamRef = useRef(cameraStream);
  cameraStreamRef.current = cameraStream;

  const cameraEnabledRef = useRef(cameraEnabled);
  cameraEnabledRef.current = cameraEnabled;

  const startMediaRecorder = () => {
    const currentStream = streamRef.current;
    if (!currentStream) {
      console.warn('[PanelApp] startMediaRecorder called without an active stream');
      return;
    }

    chunksRef.current = [];
    cameraChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm;codecs=vp8';

    // Screen recorder
    const recorder = new MediaRecorder(currentStream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      setStatus('stopping');

      // Wait for camera recorder to finish if active
      const cameraRecorder = cameraRecorderRef.current;
      if (cameraRecorder && cameraRecorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          cameraRecorder.onstop = () => resolve();
          cameraRecorder.stop();
        });
      }

      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const buffer = await blob.arrayBuffer();
      const settings = currentStream.getVideoTracks()[0]?.getSettings();

      const metadata: RecordingMetadata = {
        fps: settings?.frameRate ?? 30,
        width: settings?.width ?? 1920,
        height: settings?.height ?? 1080,
        durationMs: elapsedMsAtStop.current,
      };

      // Build camera buffer if we have camera chunks
      let cameraBuffer: ArrayBuffer | undefined;
      if (cameraChunksRef.current.length > 0) {
        const cameraBlob = new Blob(cameraChunksRef.current, { type: 'video/webm' });
        cameraBuffer = await cameraBlob.arrayBuffer();
        console.info('[PanelApp] Camera recording size:', cameraBuffer.byteLength);
      }

      try {
        await window.roughcut.panelSaveRecording(buffer, metadata, cameraBuffer);
        // Main process will close the panel after save completes
      } catch (err) {
        console.error('[PanelApp] Failed to save recording:', err);
        setStatus('ready');
      }
    };

    recorderRef.current = recorder;
    recorder.start(1000); // 1-second chunks

    // Start camera recorder if camera stream is active (use ref to avoid stale closure)
    const currentCameraStream = cameraStreamRef.current;
    console.info('[PanelApp] Camera stream at record start:', currentCameraStream ? 'ACTIVE' : 'NULL', 'cameraEnabled:', cameraEnabledRef.current);
    if (currentCameraStream) {
      const camRecorder = new MediaRecorder(currentCameraStream, { mimeType });
      camRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) cameraChunksRef.current.push(e.data);
      };
      cameraRecorderRef.current = camRecorder;
      camRecorder.start(1000);
      console.info('[PanelApp] Camera MediaRecorder started');
    }
  };

  const stopMediaRecorder = () => {
    elapsedMsAtStop.current = elapsedMs;
    // Stop screen recorder — its onstop handler will also stop camera recorder
    if (recorderRef.current?.state === 'recording' || recorderRef.current?.state === 'paused') {
      recorderRef.current.stop();
    }
  };

  // ── User action handlers ─────────────────────────────────────────────────
  const handleStartRecording = () => {
    void window.roughcut.panelStartRecording();
  };

  const handleStopRecording = () => {
    void window.roughcut.panelStopRecording();
  };

  const handleTogglePause = () => {
    const recorder = recorderRef.current;
    console.info('[PanelApp] handleTogglePause — recorder:', recorder?.state, 'status:', status);
    if (!recorder) return;

    if (recorder.state === 'recording') {
      recorder.pause();
      if (cameraRecorderRef.current?.state === 'recording') {
        cameraRecorderRef.current.pause();
      }
      setStatus('paused');
      // Tell session manager to pause the elapsed timer
      window.roughcut.panelPause();
      console.info('[PanelApp] MediaRecorder paused');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      if (cameraRecorderRef.current?.state === 'paused') {
        cameraRecorderRef.current.resume();
      }
      setStatus('recording');
      // Tell session manager to resume the elapsed timer
      window.roughcut.panelResume();
      console.info('[PanelApp] MediaRecorder resumed');
    }
  };

  const handleClose = () => {
    void window.roughcut.closeRecordingPanel();
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const canRecord = status === 'ready' && stream !== null;

  // ─── Mini-controller during recording ─────────────────────────────────
  if (status === 'recording' || status === 'paused') {
    return (
      <MiniController
        elapsedMs={elapsedMs}
        paused={status === 'paused'}
        onStop={handleStopRecording}
        onTogglePause={handleTogglePause}
      />
    );
  }

  if (status === 'stopping') {
    return <MiniSavingIndicator />;
  }

  // ─── Full setup panel ─────────────────────────────────────────────────
  return (
    <div
      style={{
        width: 500,
        height: 460,
        background: C.bg,
        borderRadius: R.outer,
        border: `1px solid ${C.border}`,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        color: C.text,
        userSelect: 'none',
      }}
    >
      {/* 1. Title bar */}
      <TitleBar onClose={handleClose} />

      {/* 2. Video preview */}
      <VideoPreview
        stream={stream}
        countdownSeconds={countdownSeconds}
        isCountingDown={status === 'countdown'}
        cameraStream={cameraStream}
      />

      <div style={{ height: 8, flexShrink: 0 }} />
      <Divider />

      {/* 3. Source selector */}
      <SourceSelector
        sources={sources}
        selectedSourceId={selectedSourceId}
        onSelectSource={handleSelectSource}
      />

      <Divider />

      {/* 4. Device controls */}
      <DeviceControls
        micEnabled={micEnabled}
        sysAudioEnabled={sysAudioEnabled}
        cameraEnabled={cameraEnabled}
        onMicToggle={handleMicToggle}
        onSysAudioToggle={() => setSysAudioEnabled((v) => !v)}
        onCameraToggle={() => setCameraEnabled((v) => !v)}
      />

      {/* Audio level meter — shows when mic is active */}
      {micEnabled && <AudioLevelMeter level={audioLevel} />}

      <Divider />

      {/* 5. Recording controls */}
      <RecordingControls
        status={status}
        elapsedMs={elapsedMs}
        canRecord={canRecord}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onTogglePause={handleTogglePause}
      />
    </div>
  );
}
