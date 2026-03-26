import React, { useState } from 'react';

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

// ─── DeviceSegmentedControl ──────────────────────────────────────────────────

interface DeviceSegmentProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: string;
  onClick: () => void;
}

function DeviceSegment({ icon, label, active = true, accent, onClick }: DeviceSegmentProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  let background: string;
  let color: string;

  if (pressed) {
    background = 'rgba(255,255,255,0.14)';
    color = accent ?? 'rgba(255,255,255,0.96)';
  } else if (hovered) {
    background = 'rgba(255,255,255,0.06)';
    color = accent ?? 'rgba(255,255,255,0.80)';
  } else if (active) {
    background = 'rgba(255,255,255,0.08)';
    color = accent ?? 'rgba(255,255,255,0.80)';
  } else {
    background = 'transparent';
    color = accent ?? 'rgba(255,255,255,0.40)';
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.02em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        cursor: 'pointer',
        background,
        border: 'none',
        color,
        transition: 'background 150ms ease-out, color 150ms ease-out',
        fontFamily: 'inherit',
        userSelect: 'none',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      {icon}
      <span style={{ color }}>{label}</span>
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
  let border: string;

  if (recordState === 'countdown') {
    label = `Starting in ${countdownSeconds ?? 0}...`;
    bg = 'transparent';
    color = '#ffb74d';
    border = '1px solid #ffb74d';
  } else if (recordState === 'recording') {
    label = '\u25A0 Stop';
    bg = pressed ? 'rgba(255,255,255,0.10)' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent';
    color = '#f5f5f5';
    border = '1px solid rgba(255,255,255,0.40)';
  } else {
    label = '\u25CF REC';
    bg = pressed ? 'rgba(255,90,95,0.12)' : hovered ? 'rgba(255,90,95,0.08)' : 'transparent';
    color = '#ff5a5f';
    border = `1px solid ${pressed ? '#ff5a5f' : hovered ? 'rgba(255,90,95,0.60)' : 'rgba(255,90,95,0.40)'}`;
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
        border,
        cursor: recordState === 'countdown' ? 'default' : 'pointer',
        fontFamily: 'inherit',
        userSelect: 'none',
        background: bg,
        color,
        transition: 'background 150ms ease, border-color 150ms ease',
        padding: '0 14px',
        letterSpacing: '0.04em',
        flexShrink: 0,
        outline: 'none',
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
      {/* Device controls — segmented control */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          height: 32,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          padding: 2,
        }}
      >
        <DeviceSegment
          icon={<MonitorIcon />}
          label={sourceName ? `Source: ${sourceName}` : 'Source: None'}
          active={Boolean(sourceName)}
          onClick={onOpenSourcePicker}
        />
        <DeviceSegment
          icon={<MicIcon muted={isMicMuted} />}
          label={`Mic: ${micName ?? 'None'}`}
          active={!isMicMuted}
          accent={isMicMuted ? '#ff746b' : undefined}
          onClick={onToggleMicMute}
        />
        {hasSystemAudio && (
          <DeviceSegment
            icon={<SpeakerIcon />}
            label={isSystemAudioEnabled ? 'System audio' : 'Audio off'}
            active={isSystemAudioEnabled}
            onClick={onToggleSystemAudio}
          />
        )}
        {hasCamera && (
          <DeviceSegment
            icon={<CameraIcon off={!isCameraEnabled} />}
            label={isCameraEnabled ? 'Camera' : 'Camera off'}
            active={isCameraEnabled}
            onClick={onToggleCamera}
          />
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
