import React, { useEffect, useRef, useState } from 'react';
import type { CaptureSource } from '../../env.js';
import { CountdownOverlay } from './CountdownOverlay.js';
import { formatElapsed } from './format-elapsed.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordingPanelProps {
  /** Available capture sources from main process */
  sources: CaptureSource[];
  /** Currently selected source ID */
  selectedSourceId: string | null;
  /** Callback when user selects a source */
  onSelectSource: (id: string) => void;
  /** The live MediaStream from useLivePreview */
  stream: MediaStream | null;
  /** Callback ref for attaching stream to video element */
  videoRef: (node: HTMLVideoElement | null) => void;
  /** Current recording status */
  status: string;
  /** Countdown seconds remaining (3, 2, 1) */
  countdownSeconds: number;
  /** Elapsed recording time in seconds */
  elapsedSeconds: number;
  /** Start recording (triggers countdown → record) */
  onStartRecording: () => void;
  /** Stop recording */
  onStopRecording: () => void;
  /** Close the panel */
  onClose: () => void;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

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
  overlay: 'rgba(0,0,0,0.5)',
  previewBg: '#111',
} as const;

const R = {
  outer: 12,
  inner: 8,
  button: 6,
  pill: 20,
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

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
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Rough Cut
      </span>

      {/* Close button — must not be draggable */}
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
          fontSize: 14,
          lineHeight: 1,
        } as React.CSSProperties}
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface VideoPreviewProps {
  stream: MediaStream | null;
  videoRef: (node: HTMLVideoElement | null) => void;
  countdownSeconds: number;
  isCountingDown: boolean;
}

function VideoPreview({ stream, videoRef, countdownSeconds, isCountingDown }: VideoPreviewProps) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);

  // Merge external callback ref with internal ref
  const setRef = (node: HTMLVideoElement | null) => {
    internalVideoRef.current = node;
    videoRef(node);
    // Ensure autoplay when node appears with an existing stream
    if (node && stream) {
      void node.play().catch(() => {});
    }
  };

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
          ref={setRef}
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
          {/* Hidden ref-holder so videoRef callback still fires */}
          <video
            ref={setRef}
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
            {/* Monitor icon placeholder */}
            <MonitorIcon size={40} color={C.textSecondary} />
            <span style={{ fontSize: 12, color: C.textSecondary }}>
              Select a source to preview
            </span>
          </div>
        </>
      )}

      {/* Countdown rendered absolutely over the preview, not the whole panel */}
      <CountdownOverlay
        secondsRemaining={countdownSeconds}
        visible={isCountingDown}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

interface SourceSelectorRowProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  onSelectSource: (id: string) => void;
}

function SourceSelectorRow({ sources, selectedSourceId, onSelectSource }: SourceSelectorRowProps) {
  const selectedSource = sources.find((s) => s.id === selectedSourceId);

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
      {/* Monitor icon */}
      <div style={{ flexShrink: 0, opacity: 0.6 }}>
        <MonitorIcon size={16} color={C.text} />
      </div>

      {/* Source dropdown */}
      <select
        value={selectedSourceId ?? ''}
        onChange={(e) => {
          if (e.target.value) onSelectSource(e.target.value);
        }}
        style={{
          flex: 1,
          height: 30,
          background: C.input,
          color: selectedSource ? C.text : C.textSecondary,
          border: `1px solid ${C.border}`,
          borderRadius: R.button,
          fontSize: 12,
          paddingLeft: 10,
          paddingRight: 28,
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          // Custom arrow via background
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '8px 5px',
        } as React.CSSProperties}
      >
        {sources.length === 0 ? (
          <option value="" disabled>
            No sources available
          </option>
        ) : (
          <>
            {!selectedSourceId && (
              <option value="" disabled>
                Select a source…
              </option>
            )}
            {sources.map((src) => (
              <option key={src.id} value={src.id}>
                {src.name}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DeviceControls() {
  const [micEnabled, setMicEnabled] = useState(true);
  const [sysAudioEnabled, setSysAudioEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

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
      {/* Mic toggle */}
      <DeviceToggleButton
        label="Microphone"
        icon={<MicIcon size={13} color={micEnabled ? C.text : C.textSecondary} />}
        active={micEnabled}
        text="Mic"
        onToggle={() => setMicEnabled((v) => !v)}
      />

      {/* System audio toggle */}
      <DeviceToggleButton
        label="System Audio"
        icon={<SpeakerIcon size={13} color={sysAudioEnabled ? C.text : C.textSecondary} />}
        active={sysAudioEnabled}
        text="Audio"
        onToggle={() => setSysAudioEnabled((v) => !v)}
      />

      {/* Camera toggle */}
      <DeviceToggleButton
        label="Camera"
        icon={<CameraIcon size={13} color={cameraEnabled ? C.text : C.textSecondary} />}
        active={cameraEnabled}
        text="Camera"
        onToggle={() => setCameraEnabled((v) => !v)}
      />
    </div>
  );
}

interface DeviceToggleButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  text: string;
  onToggle: () => void;
}

function DeviceToggleButton({ label, icon, active, text, onToggle }: DeviceToggleButtonProps) {
  const [hovered, setHovered] = useState(false);

  const bg = active
    ? hovered
      ? C.inputHover
      : C.input
    : hovered
      ? 'rgba(255,255,255,0.04)'
      : 'transparent';

  const borderColor = active ? C.borderLight : C.border;

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
        opacity: active ? 1 : 0.55,
      }}
    >
      {icon}
      <span
        style={{
          fontSize: 11,
          color: active ? C.text : C.textSecondary,
          fontWeight: active ? 500 : 400,
          userSelect: 'none',
        }}
      >
        {text}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface RecordingControlsProps {
  status: string;
  elapsedSeconds: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

function RecordingControls({
  status,
  elapsedSeconds,
  onStartRecording,
  onStopRecording,
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
        position: 'relative',
      }}
    >
      {(status === 'idle' || status === 'ready' || status === 'loading-sources') && (
        <RecButton onStart={onStartRecording} disabled={status !== 'ready'} />
      )}

      {status === 'countdown' && (
        <StartingLabel />
      )}

      {status === 'recording' && (
        <RecordingRow
          elapsedSeconds={elapsedSeconds}
          onStop={onStopRecording}
        />
      )}

      {status === 'stopping' && (
        <SavingLabel />
      )}

      {status === 'error' && (
        <RecButton onStart={onStartRecording} disabled={false} />
      )}
    </div>
  );
}

function RecButton({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = disabled
    ? 'rgba(255,90,95,0.35)'
    : pressed
      ? C.accentDark
      : hovered
        ? C.accentHover
        : C.accent;

  return (
    <button
      aria-label="Start recording"
      disabled={disabled}
      onClick={onStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
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
      {/* Record circle icon */}
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

function StartingLabel() {
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
      <SpinnerDot />
      Starting…
    </div>
  );
}

function SavingLabel() {
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
      <SpinnerDot />
      Saving…
    </div>
  );
}

function SpinnerDot() {
  return (
    <>
      <style>{`
        @keyframes rc-panel-spin {
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
          animation: 'rc-panel-spin 0.8s linear infinite',
          flexShrink: 0,
        }}
      />
    </>
  );
}

function RecordingRow({
  elapsedSeconds,
  onStop,
}: {
  elapsedSeconds: number;
  onStop: () => void;
}) {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* Pause button (placeholder — wired later) */}
      <PauseButton />

      {/* Elapsed timer — centered via flex-grow spacers */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RecordingTimer elapsedSeconds={elapsedSeconds} />
      </div>

      {/* Stop button */}
      <StopButton onStop={onStop} />
    </div>
  );
}

function RecordingTimer({ elapsedSeconds }: { elapsedSeconds: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        userSelect: 'none',
      }}
    >
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
  );
}

function PulsingDot() {
  return (
    <>
      <style>{`
        @keyframes rc-panel-pulse {
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
          animation: 'rc-panel-pulse 1.4s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
    </>
  );
}

function PauseButton() {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      aria-label="Pause recording"
      title="Pause (coming soon)"
      disabled
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36,
        height: 36,
        borderRadius: R.button,
        border: `1px solid ${C.border}`,
        background: hovered ? C.inputHover : C.input,
        cursor: 'not-allowed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        padding: 0,
        opacity: 0.45,
        flexShrink: 0,
        transition: 'background 120ms ease-out',
      }}
    >
      {/* Pause icon — two vertical bars */}
      <svg width="10" height="12" viewBox="0 0 10 12" fill={C.text} aria-hidden="true">
        <rect x="0" y="0" width="3.5" height="12" rx="1" />
        <rect x="6.5" y="0" width="3.5" height="12" rx="1" />
      </svg>
    </button>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = pressed
    ? 'rgba(255,90,95,0.25)'
    : hovered
      ? 'rgba(255,90,95,0.15)'
      : C.input;

  const borderColor = hovered ? 'rgba(255,90,95,0.5)' : C.border;

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
      {/* Stop square icon */}
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

// ─── Divider ──────────────────────────────────────────────────────────────────

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

// ─── RecordingPanel ───────────────────────────────────────────────────────────

export function RecordingPanel({
  sources,
  selectedSourceId,
  onSelectSource,
  stream,
  videoRef,
  status,
  countdownSeconds,
  elapsedSeconds,
  onStartRecording,
  onStopRecording,
  onClose,
}: RecordingPanelProps) {
  const isCountingDown = status === 'countdown';

  return (
    <div
      style={{
        width: 500,
        height: 450,
        background: C.bg,
        borderRadius: R.outer,
        border: `1px solid ${C.border}`,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        color: C.text,
        // Prevent text selection globally within panel
        userSelect: 'none',
      }}
    >
      {/* 1. Title bar */}
      <TitleBar onClose={onClose} />

      {/* 2. Live preview */}
      <VideoPreview
        stream={stream}
        videoRef={videoRef}
        countdownSeconds={countdownSeconds}
        isCountingDown={isCountingDown}
      />

      {/* Spacing below preview */}
      <div style={{ height: 8, flexShrink: 0 }} />

      <Divider />

      {/* 3. Source selector */}
      <SourceSelectorRow
        sources={sources}
        selectedSourceId={selectedSourceId}
        onSelectSource={onSelectSource}
      />

      <Divider />

      {/* 4. Device controls */}
      <DeviceControls />

      <Divider />

      {/* 5. Recording controls */}
      <RecordingControls
        status={status}
        elapsedSeconds={elapsedSeconds}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
      />
    </div>
  );
}
