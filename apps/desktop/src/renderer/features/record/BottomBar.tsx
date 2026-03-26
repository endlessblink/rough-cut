import { useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecordState = 'idle' | 'countdown' | 'recording';

export interface BottomBarProps {
  sourceName: string | null;
  onOpenSourcePicker: () => void;

  micName: string | null;
  isMicMuted: boolean;
  onToggleMicMute: () => void;

  hasSystemAudio: boolean;
  isSystemAudioEnabled: boolean;
  onToggleSystemAudio: () => void;

  hasCamera: boolean;
  isCameraEnabled: boolean;
  onToggleCamera: () => void;

  recordState: RecordState;
  onClickRecord: () => void;
  countdownSeconds?: number;

  elapsedSeconds: number;
  resolutionLabel: string;
  fpsLabel: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="13" x2="9" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7" y1="10.5" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="5" y="1" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3 6.5a4 4 0 0 0 8 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7" y1="10.5" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      {muted && (
        <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 5h2l3-3v10L4 9H2V5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.5 5a3 3 0 0 1 0 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="3.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 5.5l3-1.5v6l-3-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      {off && (
        <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

// ─── SourcePill ───────────────────────────────────────────────────────────────

function SourcePill({
  sourceName,
  onClick,
}: {
  sourceName: string | null;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = pressed
    ? 'rgba(255,255,255,0.16)'
    : hovered
      ? 'rgba(255,255,255,0.10)'
      : sourceName
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(255,255,255,0.03)';

  const border = hovered
    ? '1px solid rgba(255,255,255,0.20)'
    : '1px solid rgba(255,255,255,0.12)';

  const color = sourceName ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.66)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        height: 28,
        padding: '0 12px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: bg,
        border,
        color,
        fontSize: 12,
        fontWeight: 400,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 100ms ease, border-color 100ms ease',
        userSelect: 'none',
      }}
    >
      <MonitorIcon />
      {`Source: ${sourceName ?? 'None'}`}
    </button>
  );
}

// ─── MicChip ─────────────────────────────────────────────────────────────────

function MicChip({
  micName,
  isMuted,
  onClick,
}: {
  micName: string | null;
  isMuted: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = isMuted
    ? hovered ? 'rgba(255,99,71,0.14)' : 'rgba(255,99,71,0.08)'
    : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';

  const iconColor = isMuted ? '#ff746b' : 'rgba(255,255,255,0.86)';
  const textColor = (isMuted || !micName) ? '#ff746b' : 'rgba(255,255,255,0.80)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: bg,
        border: '1px solid rgba(255,255,255,0.14)',
        color: iconColor,
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 100ms ease',
        userSelect: 'none',
      }}
    >
      <MicIcon muted={isMuted} />
      <span style={{ color: textColor }}>
        {`Mic: ${micName ?? 'None'}`}
      </span>
    </button>
  );
}

// ─── SystemAudioChip ──────────────────────────────────────────────────────────

function SystemAudioChip({
  isEnabled,
  onClick,
}: {
  isEnabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = isEnabled
    ? hovered ? 'rgba(90,200,250,0.20)' : 'rgba(90,200,250,0.14)'
    : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';

  const textColor = isEnabled ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.60)';
  const iconColor = isEnabled ? 'rgba(90,200,250,0.90)' : 'rgba(255,255,255,0.50)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: bg,
        border: '1px solid rgba(255,255,255,0.14)',
        color: iconColor,
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'background 100ms ease',
        userSelect: 'none',
      }}
    >
      <SpeakerIcon />
      <span style={{ color: textColor }}>
        {isEnabled ? 'System audio' : 'System audio off'}
      </span>
    </button>
  );
}

// ─── CameraToggle ─────────────────────────────────────────────────────────────

function CameraToggle({
  isEnabled,
  onClick,
}: {
  isEnabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = isEnabled
    ? hovered ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.14)'
    : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';

  const iconColor = isEnabled ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.50)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        border: '1px solid rgba(255,255,255,0.14)',
        color: iconColor,
        cursor: 'pointer',
        transition: 'background 100ms ease',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <CameraIcon off={!isEnabled} />
    </button>
  );
}

// ─── RecordButton ─────────────────────────────────────────────────────────────

function RecordButton({
  recordState,
  countdownSeconds,
  onClick,
}: {
  recordState: RecordState;
  countdownSeconds?: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  let label: string;
  let bg: string;
  let color: string;

  if (recordState === 'countdown') {
    label = `Starting in ${countdownSeconds ?? 0}...`;
    bg = '#ffb74d';
    color = '#000';
  } else if (recordState === 'recording') {
    label = '\u25A0 Stop';
    bg = pressed ? '#e8e8e8' : hovered ? '#ffffff' : '#f5f5f5';
    color = '#111';
  } else {
    label = '\u25CF REC';
    bg = pressed ? '#e34a4f' : hovered ? '#ff7075' : '#ff5a5f';
    color = '#000';
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        height: 30,
        minWidth: 80,
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: 12,
        fontWeight: 600,
        border: 'none',
        cursor: recordState === 'countdown' ? 'default' : 'pointer',
        fontFamily: 'inherit',
        userSelect: 'none',
        background: bg,
        color,
        transition: 'background 120ms ease',
        padding: '0 14px',
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

// ─── CaptureStatus ────────────────────────────────────────────────────────────

function CaptureStatus({
  elapsedSeconds,
  resolutionLabel,
  fpsLabel,
  isRecording,
}: {
  elapsedSeconds: number;
  resolutionLabel: string;
  fpsLabel: string;
  isRecording: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontFamily: 'monospace, monospace',
          color: isRecording ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.50)',
          letterSpacing: '0.02em',
        }}
      >
        {formatElapsed(elapsedSeconds)}
      </span>

      <div
        style={{
          width: 1,
          height: 16,
          background: 'rgba(255,255,255,0.10)',
          flexShrink: 0,
        }}
      />

      <span
        style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.64)',
        }}
      >
        {`${resolutionLabel} · ${fpsLabel}`}
      </span>
    </div>
  );
}

// ─── BottomBar ────────────────────────────────────────────────────────────────

export function BottomBar({
  sourceName,
  onOpenSourcePicker,
  micName,
  isMicMuted,
  onToggleMicMute,
  hasSystemAudio,
  isSystemAudioEnabled,
  onToggleSystemAudio,
  hasCamera,
  isCameraEnabled,
  onToggleCamera,
  recordState,
  onClickRecord,
  countdownSeconds,
  elapsedSeconds,
  resolutionLabel,
  fpsLabel,
}: BottomBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        gap: 8,
      }}
    >
      {/* Left group — device pills */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <SourcePill sourceName={sourceName} onClick={onOpenSourcePicker} />
        <MicChip micName={micName} isMuted={isMicMuted} onClick={onToggleMicMute} />
        {hasSystemAudio && (
          <SystemAudioChip isEnabled={isSystemAudioEnabled} onClick={onToggleSystemAudio} />
        )}
        {hasCamera && (
          <CameraToggle isEnabled={isCameraEnabled} onClick={onToggleCamera} />
        )}
      </div>

      {/* Center group — record button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <RecordButton
          recordState={recordState}
          countdownSeconds={countdownSeconds}
          onClick={onClickRecord}
        />
      </div>

      {/* Right group — status, pushed to end */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginLeft: 'auto',
        }}
      >
        <CaptureStatus
          elapsedSeconds={elapsedSeconds}
          resolutionLabel={resolutionLabel}
          fpsLabel={fpsLabel}
          isRecording={recordState === 'recording'}
        />
      </div>
    </div>
  );
}
