/**
 * PanelApp — Self-contained recording panel for the floating Electron window.
 *
 * Manages its own state, acquires its own MediaStream, runs its own
 * MediaRecorder, and communicates with the main process via window.roughcut.
 *
 * The screen-capture preview lives in the main Record tab (not here) — this
 * window is controls-only, with a small live camera PiP that overlays the
 * bottom-right corner when the camera is enabled.
 *
 * Layout (500 × 240, +44 when issues banner is shown):
 *   1. TitleBar          (32px)
 *   2. SourceSelector    (40px)
 *   3. DeviceControls    (40px + audio level meter when mic is on)
 *   4. RecordingControls (56px)
 *   + CameraPiPOverlay (bottom-right, absolute, only when camera is on)
 *   + CountdownOverlay (position:fixed — covers the whole window)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CaptureSource,
  RecordingMetadata,
  RecordingRecoveryMarker,
  RecordingSessionConnectionIssues,
  SystemAudioSourceOption,
} from '../../env.js';
import { CountdownOverlay } from './CountdownOverlay.js';
import { formatElapsed } from './format-elapsed.js';
import { useRecordingConfig, updateRecordingConfig } from './recording-config.js';
import { useRecordingDeviceOptions } from './use-recording-device-options.js';
import { useToast } from '../../ui/toast.js';
import { getRecordingPauseCapability } from '../../../shared/recording-pause-policy.mjs';

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

async function warmCameraStream(stream: MediaStream): Promise<void> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.style.position = 'fixed';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.left = '-9999px';
  video.style.top = '-9999px';
  video.srcObject = stream;
  document.body.appendChild(video);

  try {
    await video.play().catch(() => {});
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out warming camera stream'));
      }, 1500);
      const handleLoadedData = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error('Camera warmup video failed to load data'));
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', handleLoadedData);
        video.removeEventListener('error', handleError);
      };
      video.addEventListener('loadeddata', handleLoadedData, { once: true });
      video.addEventListener('error', handleError, { once: true });
    });
  } finally {
    video.pause();
    video.srcObject = null;
    video.remove();
  }
}

async function waitForCameraStreamReady(
  getStream: () => MediaStream | null,
  timeoutMs = 1500,
): Promise<MediaStream | null> {
  const existing = getStream();
  if (existing) return existing;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    const stream = getStream();
    if (stream) return stream;
  }
  return getStream();
}

// ─── Audio Level Meter ──────────────────────────────────────────────────────

function AudioLevelMeter({ level }: { level: number }) {
  const pct = Math.min(level * 300, 100);
  const color = level > 0.7 ? '#ef4444' : level > 0.4 ? '#eab308' : '#4ade80';

  return (
    <div
      style={{
        height: 4,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        marginLeft: 12,
        marginRight: 12,
        marginTop: 2,
        marginBottom: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 2,
          transition: 'width 50ms ease-out',
        }}
      />
    </div>
  );
}

// ─── Status type ────────────────────────────────────────────────────────────

type PanelStatus = 'idle' | 'ready' | 'countdown' | 'recording' | 'stopping';

const pauseCapability = getRecordingPauseCapability({ capturesCursor: true });

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

function TitleBar({ onClose, accessory }: { onClose: () => void; accessory?: React.ReactNode }) {
  const [closeHovered, setCloseHovered] = useState(false);

  return (
    <div
      style={
        {
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 14,
          paddingRight: 10,
          flexShrink: 0,
          WebkitAppRegion: 'drag',
          userSelect: 'none',
        } as React.CSSProperties
      }
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {accessory}
        <button
          aria-label="Close recording panel"
          onClick={onClose}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
          style={
            {
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
            } as React.CSSProperties
          }
        >
          ×
        </button>
      </div>
    </div>
  );
}

function SetupModeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      data-testid="panel-return-mini"
      onClick={onClick}
      style={
        {
          WebkitAppRegion: 'no-drag',
          height: 22,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.04)',
          color: 'rgba(255,255,255,0.74)',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          padding: '0 10px',
          marginLeft: 'auto',
          marginRight: 8,
        } as React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }
      }
    >
      Compact
    </button>
  );
}

// ─── Camera PiP ─────────────────────────────────────────────────────────────

function CameraPiPOverlay({ cameraStream }: { cameraStream: MediaStream | null }) {
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = cameraVideoRef.current;
    if (!node || !cameraStream) {
      return;
    }

    node.srcObject = cameraStream;
    void node.play().catch(() => {});
  }, [cameraStream]);

  if (!cameraStream) {
    return null;
  }

  return (
    <video
      ref={cameraVideoRef}
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
        zIndex: 2,
        pointerEvents: 'none',
      }}
    />
  );
}

// ─── SourceSelector ─────────────────────────────────────────────────────────

interface SourceSelectorProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  issue?: string | null;
  onSelectSource: (id: string) => void;
  onRefreshSources?: () => void;
  onRetarget?: () => void;
  canRetarget?: boolean;
}

function SourceSelector({
  sources,
  selectedSourceId,
  issue,
  onSelectSource,
  onRefreshSources,
  onRetarget,
  canRetarget = false,
}: SourceSelectorProps) {
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

      {issue && (
        <span
          data-testid="panel-source-offline-badge"
          title={issue}
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#fcd34d',
            border: '1px solid rgba(245,158,11,0.28)',
            background: 'rgba(245,158,11,0.1)',
            borderRadius: 999,
            padding: '2px 6px',
            flexShrink: 0,
          }}
        >
          Offline
        </span>
      )}

      <select
        data-testid="panel-source-select"
        value={selectedSourceId ?? ''}
        onChange={(e) => {
          if (e.target.value) onSelectSource(e.target.value);
        }}
        style={
          {
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
          } as React.CSSProperties
        }
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

      {issue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            data-testid="panel-source-refresh"
            onClick={onRefreshSources}
            style={sourceActionButtonStyle}
          >
            Refresh
          </button>
          <button
            data-testid="panel-source-retarget"
            onClick={onRetarget}
            disabled={!canRetarget}
            style={{
              ...sourceActionButtonStyle,
              opacity: canRetarget ? 1 : 0.45,
              cursor: canRetarget ? 'pointer' : 'default',
            }}
          >
            Re-target
          </button>
        </div>
      )}
    </div>
  );
}

const sourceActionButtonStyle: React.CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.84)',
  fontSize: 12,
  fontFamily: 'inherit',
  flexShrink: 0,
};

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
    ? hovered
      ? C.inputHover
      : C.input
    : hovered
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(255,255,255,0.03)';

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
  micIssue?: string | null;
  cameraIssue?: string | null;
  systemAudioIssue?: string | null;
  micOptions: Array<{ id: string; label: string }>;
  selectedMicDeviceId: string | null;
  onSelectMicDevice: (id: string | null) => void;
  cameraOptions: Array<{ id: string; label: string }>;
  selectedCameraDeviceId: string | null;
  onSelectCameraDevice: (id: string | null) => void;
  systemAudioOptions: SystemAudioSourceOption[];
  selectedSystemAudioSourceId: string | null;
  onSelectSystemAudioSource: (id: string | null) => void;
  onMicToggle: () => void;
  onSysAudioToggle: () => void;
  onCameraToggle: () => void;
}

function DeviceControls({
  micEnabled,
  sysAudioEnabled,
  cameraEnabled,
  micIssue,
  cameraIssue,
  systemAudioIssue,
  micOptions,
  selectedMicDeviceId,
  onSelectMicDevice,
  cameraOptions,
  selectedCameraDeviceId,
  onSelectCameraDevice,
  systemAudioOptions,
  selectedSystemAudioSourceId,
  onSelectSystemAudioSource,
  onMicToggle,
  onSysAudioToggle,
  onCameraToggle,
}: DeviceControlsProps) {
  const selectedMicValue =
    selectedMicDeviceId && micOptions.some((option) => option.id === selectedMicDeviceId)
      ? selectedMicDeviceId
      : '';
  const selectedCameraValue =
    selectedCameraDeviceId && cameraOptions.some((option) => option.id === selectedCameraDeviceId)
      ? selectedCameraDeviceId
      : '';
  const selectedSystemAudioValue =
    selectedSystemAudioSourceId &&
    systemAudioOptions.some((option) => option.id === selectedSystemAudioSourceId)
      ? selectedSystemAudioSourceId
      : '';

  return (
    <div
      style={{
        minHeight: 84,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 6,
        paddingLeft: 10,
        paddingRight: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <select
          data-testid="panel-mic-select"
          value={selectedMicValue}
          onChange={(event) => onSelectMicDevice(event.target.value || null)}
          style={panelSelectStyle}
          aria-label="Microphone device"
        >
          <option value="">Default microphone</option>
          {micOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {micIssue && (
          <span data-testid="panel-mic-offline-badge" title={micIssue} style={offlineBadgeStyle}>
            Offline
          </span>
        )}
        <select
          data-testid="panel-system-audio-select"
          value={selectedSystemAudioValue}
          onChange={(event) => onSelectSystemAudioSource(event.target.value || null)}
          style={panelSelectStyle}
          aria-label="System audio source"
        >
          <option value="">Default system audio</option>
          {systemAudioOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {systemAudioIssue && (
          <span
            data-testid="panel-system-audio-offline-badge"
            title={systemAudioIssue}
            style={offlineBadgeStyle}
          >
            Offline
          </span>
        )}
        <select
          data-testid="panel-camera-select"
          value={selectedCameraValue}
          onChange={(event) => onSelectCameraDevice(event.target.value || null)}
          style={panelSelectStyle}
          aria-label="Camera device"
        >
          <option value="">Default camera</option>
          {cameraOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {cameraIssue && (
          <span
            data-testid="panel-camera-offline-badge"
            title={cameraIssue}
            style={offlineBadgeStyle}
          >
            Offline
          </span>
        )}
      </div>
    </div>
  );
}

const offlineBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#fcd34d',
  border: '1px solid rgba(245,158,11,0.28)',
  background: 'rgba(245,158,11,0.1)',
  borderRadius: 999,
  padding: '2px 6px',
  flexShrink: 0,
};

const panelSelectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 30,
  background: C.input,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: R.button,
  fontSize: 12,
  paddingLeft: 10,
  paddingRight: 10,
  outline: 'none',
};

// ─── RecordingControls ──────────────────────────────────────────────────────

interface RecordingControlsProps {
  status: PanelStatus;
  elapsedMs: number;
  canRecord: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

function RecordingControls({
  status,
  elapsedMs,
  canRecord,
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
      }}
    >
      {(status === 'idle' || status === 'ready') && (
        <RecButton onStart={onStartRecording} disabled={!canRecord} />
      )}
      {status === 'countdown' && <StatusLabel text="Starting…" />}
      {status === 'recording' && <RecordingRow elapsedMs={elapsedMs} onStop={onStopRecording} />}
      {status === 'stopping' && <StatusLabel text="Saving…" showSpinner />}
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

function RecordingRow({ elapsedMs, onStop }: { elapsedMs: number; onStop: () => void }) {
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}>
      <PauseUnavailableBadge compact />

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

function PauseUnavailableBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-label={pauseCapability.reason ?? pauseCapability.label}
      title={pauseCapability.reason ?? pauseCapability.label}
      style={{
        minWidth: compact ? 104 : 118,
        height: compact ? 36 : 32,
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        background: C.input,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '0 10px' : '0 12px',
        flexShrink: 0,
        color: C.textSecondary,
        fontSize: compact ? 11 : 10,
        fontWeight: 600,
        letterSpacing: '0.03em',
      }}
    >
      Pause unavailable
    </div>
  );
}

function StopButton({ onStop }: { onStop: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = pressed ? 'rgba(255,90,95,0.25)' : hovered ? 'rgba(255,90,95,0.15)' : C.input;
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

// ─── MiniStopButton ──────────────────────────────────────────────────────────

function MiniStopButton({ onStop }: { onStop: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const bg = pressed ? 'rgba(255,90,95,0.25)' : hovered ? 'rgba(255,90,95,0.15)' : C.input;
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
  issueLabel,
  onFixIssue,
  onStop,
}: {
  elapsedMs: number;
  issueLabel: string | null;
  onFixIssue: (() => void) | null;
  onStop: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [faded, setFaded] = useState(false);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  useEffect(() => {
    const handle = window.setTimeout(() => setFaded(true), 3000);
    return () => window.clearTimeout(handle);
  }, [elapsedMs, collapsed]);

  const wakeController = useCallback(() => {
    setFaded(false);
  }, []);

  return (
    <div
      data-testid="mini-controller"
      onMouseMove={wakeController}
      onMouseEnter={wakeController}
      style={
        {
          width: collapsed ? 220 : 340,
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
          opacity: faded ? 0.36 : 1,
          transition: 'opacity 180ms ease, width 180ms ease',
        } as React.CSSProperties
      }
    >
      {/* Recording indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <PulsingDot />
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

      {!collapsed && <PauseUnavailableBadge />}

      {issueLabel && !collapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span
            data-testid="mini-controller-issue-pill"
            style={{
              fontSize: 10,
              color: '#fcd34d',
              fontWeight: 600,
              flexShrink: 0,
              border: '1px solid rgba(245,158,11,0.32)',
              background: 'rgba(245,158,11,0.12)',
              borderRadius: 999,
              padding: '3px 8px',
            }}
          >
            {issueLabel}
          </span>
          {onFixIssue && (
            <button
              data-testid="mini-controller-fix-issue"
              onClick={onFixIssue}
              style={
                {
                  height: 24,
                  padding: '0 8px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.88)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  WebkitAppRegion: 'no-drag',
                } as React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }
              }
            >
              Fix
            </button>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Controls */}
      <div
        style={
          {
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            WebkitAppRegion: 'no-drag',
            flexShrink: 0,
          } as React.CSSProperties
        }
      >
        <button
          data-testid="mini-controller-toggle"
          onClick={() => {
            wakeController();
            setCollapsed((value) => !value);
          }}
          title={collapsed ? 'Expand controller' : 'Minimize controller'}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.72)',
            cursor: 'pointer',
            fontSize: 15,
            lineHeight: '28px',
            padding: 0,
          }}
        >
          {collapsed ? '>' : '-'}
        </button>
        <MiniStopButton onStop={onStop} />
      </div>
    </div>
  );
}

// ─── MiniSavingIndicator ─────────────────────────────────────────────────────

function MiniSavingIndicator() {
  return (
    <div
      style={
        {
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
        } as React.CSSProperties
      }
    >
      <SpinnerDot />
      Saving…
    </div>
  );
}

function IssueNotice({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;

  return (
    <div
      data-testid="panel-issue-notice"
      style={{
        margin: '8px 10px 0',
        borderRadius: 8,
        border: '1px solid rgba(245,158,11,0.28)',
        background: 'rgba(245,158,11,0.1)',
        color: '#fef3c7',
        fontSize: 11,
        lineHeight: 1.4,
        padding: '7px 10px',
        flexShrink: 0,
      }}
    >
      {messages.join(' ')}
    </div>
  );
}

function RecoveryNotice({
  recovery,
  busy,
  onRecover,
  onOpenFolder,
  onDismiss,
}: {
  recovery: RecordingRecoveryMarker;
  busy: boolean;
  onRecover: () => void;
  onOpenFolder: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="panel-recovery-banner"
      style={{
        margin: '8px 10px 0',
        borderRadius: 8,
        border: '1px solid rgba(245,158,11,0.28)',
        background: 'rgba(245,158,11,0.12)',
        color: '#fef3c7',
        fontSize: 11,
        lineHeight: 1.4,
        padding: '8px 10px',
        flexShrink: 0,
      }}
    >
      <div style={{ fontWeight: 600 }}>Recover interrupted take</div>
      <div style={{ marginTop: 2, color: 'rgba(255,255,255,0.78)' }}>
        Found a partial recording from {recovery.startedAt}. Rough Cut can import the saved video
        and any matching sidecars.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          data-testid="panel-recovery-recover"
          onClick={onRecover}
          disabled={busy}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.12)',
            background: busy ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.14)',
            color: 'rgba(255,255,255,0.92)',
            cursor: busy ? 'default' : 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          {busy ? 'Recovering…' : 'Recover take'}
        </button>
        <button
          data-testid="panel-recovery-open-folder"
          onClick={onOpenFolder}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.84)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          Open folder
        </button>
        <button
          data-testid="panel-recovery-dismiss"
          onClick={onDismiss}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.72)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── buildRecordingStream ────────────────────────────────────────────────────

/**
 * Build a combined MediaStream for recording: video + optional system audio + optional mic audio.
 * When both audio sources are present, mixes them via AudioContext.
 */
function buildRecordingStream(
  displayStream: MediaStream,
  micStream: MediaStream | null,
  sysAudioEnabled: boolean,
  micEnabled: boolean,
): { stream: MediaStream; cleanup: () => void } {
  const videoTrack = displayStream.getVideoTracks()[0];
  if (!videoTrack) throw new Error('No video track in display stream');

  const sysAudioTracks = sysAudioEnabled ? displayStream.getAudioTracks() : [];
  const micAudioTrack = micEnabled && micStream ? (micStream.getAudioTracks()[0] ?? null) : null;

  // No audio at all
  if (sysAudioTracks.length === 0 && !micAudioTrack) {
    return { stream: new MediaStream([videoTrack]), cleanup: () => {} };
  }

  // Only one audio source — no mixing needed
  if (sysAudioTracks.length === 0 && micAudioTrack) {
    return { stream: new MediaStream([videoTrack, micAudioTrack]), cleanup: () => {} };
  }
  if (sysAudioTracks.length > 0 && !micAudioTrack) {
    return { stream: new MediaStream([videoTrack, ...sysAudioTracks]), cleanup: () => {} };
  }

  // Both system + mic — mix via AudioContext
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const sysSource = ctx.createMediaStreamSource(new MediaStream(sysAudioTracks));
  const micSource = ctx.createMediaStreamSource(new MediaStream([micAudioTrack!]));
  sysSource.connect(dest);
  micSource.connect(dest);

  const mixedAudioTrack = dest.stream.getAudioTracks()[0]!;
  const combined = new MediaStream([videoTrack, mixedAudioTrack]);
  const cleanup = () => {
    sysSource.disconnect();
    micSource.disconnect();
    void ctx.close();
  };
  return { stream: combined, cleanup };
}

// ─── PanelApp ───────────────────────────────────────────────────────────────

export function PanelApp() {
  const { showToast } = useToast();
  // ── State ────────────────────────────────────────────────────────────────
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const hydrated = useRecordingConfig((s) => s.hydrated);
  const recordMode = useRecordingConfig((s) => s.recordMode);
  const selectedSourceId = useRecordingConfig((s) => s.selectedSourceId);
  const micEnabled = useRecordingConfig((s) => s.micEnabled);
  const sysAudioEnabled = useRecordingConfig((s) => s.sysAudioEnabled);
  const cameraEnabled = useRecordingConfig((s) => s.cameraEnabled);
  const configuredCountdownSeconds = useRecordingConfig((s) => s.countdownSeconds);
  const selectedMicDeviceId = useRecordingConfig((s) => s.selectedMicDeviceId);
  const selectedCameraDeviceId = useRecordingConfig((s) => s.selectedCameraDeviceId);
  const selectedSystemAudioSourceId = useRecordingConfig((s) => s.selectedSystemAudioSourceId);
  const {
    micOptions,
    cameraOptions,
    systemAudioOptions,
    refresh: refreshDeviceOptions,
  } = useRecordingDeviceOptions();

  // Microphone stream for audio level monitoring (separate from screen capture stream)
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [connectionIssues, setConnectionIssues] = useState<RecordingSessionConnectionIssues>({
    mic: null,
    camera: null,
    systemAudio: null,
    source: null,
  });
  const [recordingRecovery, setRecordingRecovery] = useState<RecordingRecoveryMarker | null>(null);
  const [recoveringTake, setRecoveringTake] = useState(false);
  const [setupModeDuringRecording, setSetupModeDuringRecording] = useState(false);
  const warningRef = useRef<Record<string, string | null>>({
    mic: null,
    camera: null,
    systemAudio: null,
    source: null,
  });
  const availableSelectionRef = useRef<Record<string, boolean>>({
    mic: false,
    camera: false,
    systemAudio: false,
  });
  const statusRef = useRef<PanelStatus>('idle');
  const previousSelectedSourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (selectedSourceId) {
      previousSelectedSourceIdRef.current = selectedSourceId;
      setConnectionIssues((current) => ({ ...current, source: null }));
    }
  }, [selectedSourceId]);

  useEffect(() => {
    if (selectedMicDeviceId) {
      setConnectionIssues((current) => ({ ...current, mic: null }));
    }
  }, [selectedMicDeviceId]);

  useEffect(() => {
    if (selectedCameraDeviceId) {
      setConnectionIssues((current) => ({ ...current, camera: null }));
    }
  }, [selectedCameraDeviceId]);

  useEffect(() => {
    if (selectedSystemAudioSourceId) {
      setConnectionIssues((current) => ({ ...current, systemAudio: null }));
    }
  }, [selectedSystemAudioSourceId]);

  useEffect(() => {
    const hasIssue = Object.values(connectionIssues).some(Boolean);
    window.roughcut.panelReportConnectionIssues(hasIssue ? connectionIssues : null);
  }, [connectionIssues]);

  useEffect(() => {
    if (!hydrated) return;
    if (!micEnabled) {
      setMicStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        audio: selectedMicDeviceId ? { deviceId: { exact: selectedMicDeviceId } } : true,
        video: false,
      })
      .then((s) => {
        setMicStream(s);
        void refreshDeviceOptions();
      })
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
  }, [hydrated, micEnabled, refreshDeviceOptions, selectedMicDeviceId]);

  useEffect(() => {
    const wasAvailable = availableSelectionRef.current.mic;
    const isAvailable = selectedMicDeviceId
      ? micOptions.some((option) => option.id === selectedMicDeviceId)
      : false;
    availableSelectionRef.current.mic = isAvailable;

    if (
      wasAvailable &&
      selectedMicDeviceId &&
      !isAvailable &&
      warningRef.current.mic !== selectedMicDeviceId
    ) {
      warningRef.current.mic = selectedMicDeviceId;
      updateRecordingConfig({ selectedMicDeviceId: null, micEnabled: false });
      setConnectionIssues((current) => ({
        ...current,
        mic: 'Mic offline. Recording will continue without microphone audio until you pick another input.',
      }));
      showToast({
        title: 'Microphone disconnected',
        message: 'Recording will continue without mic audio until you choose another input.',
        tone: 'warning',
      });
      return;
    }
    warningRef.current.mic = null;
  }, [micOptions, selectedMicDeviceId, showToast]);

  useEffect(() => {
    const wasAvailable = availableSelectionRef.current.camera;
    const isAvailable = selectedCameraDeviceId
      ? cameraOptions.some((option) => option.id === selectedCameraDeviceId)
      : false;
    availableSelectionRef.current.camera = isAvailable;

    if (
      wasAvailable &&
      selectedCameraDeviceId &&
      !isAvailable &&
      warningRef.current.camera !== selectedCameraDeviceId
    ) {
      warningRef.current.camera = selectedCameraDeviceId;
      updateRecordingConfig({ selectedCameraDeviceId: null, cameraEnabled: false });
      setConnectionIssues((current) => ({
        ...current,
        camera:
          'Camera offline. Recording will continue without camera video until you pick another camera.',
      }));
      showToast({
        title: 'Camera disconnected',
        message: 'Recording will continue without camera video until you choose another camera.',
        tone: 'warning',
      });
      return;
    }
    warningRef.current.camera = null;
  }, [cameraOptions, selectedCameraDeviceId, showToast]);

  useEffect(() => {
    const wasAvailable = availableSelectionRef.current.systemAudio;
    const isAvailable = selectedSystemAudioSourceId
      ? systemAudioOptions.some((option) => option.id === selectedSystemAudioSourceId)
      : false;
    availableSelectionRef.current.systemAudio = isAvailable;

    if (
      wasAvailable &&
      selectedSystemAudioSourceId &&
      !isAvailable &&
      warningRef.current.systemAudio !== selectedSystemAudioSourceId
    ) {
      warningRef.current.systemAudio = selectedSystemAudioSourceId;
      updateRecordingConfig({ selectedSystemAudioSourceId: null, sysAudioEnabled: false });
      setConnectionIssues((current) => ({
        ...current,
        systemAudio:
          'System audio offline. Recording will continue without desktop audio until you pick another output.',
      }));
      showToast({
        title: 'System audio source unavailable',
        message: 'Recording will continue without system audio until you choose another output.',
        tone: 'warning',
      });
      return;
    }
    warningRef.current.systemAudio = null;
  }, [selectedSystemAudioSourceId, showToast, systemAudioOptions]);

  // Audio level monitoring from mic stream
  const audioLevel = useAudioLevel(micStream, micEnabled);

  // Mic toggle with track muting — only mutes the mic stream, not system audio
  const handleMicToggle = useCallback(() => {
    const next = !micEnabled;
    // Mute/unmute only the mic stream tracks so system audio is unaffected
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
    updateRecordingConfig({ micEnabled: next });
  }, [micEnabled]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const cameraRecorderRef = useRef<any>(null); // CameraRecorder (WebCodecs H.264)
  const cameraRecorderStartRef = useRef<Promise<void> | null>(null);
  const cameraRecorderKindRef = useRef<'none' | 'mediabunny' | 'mediarecorder'>('none');
  const cameraRecorderMimeTypeRef = useRef<string>('video/webm');
  const cameraRecordingStreamRef = useRef<MediaStream | null>(null);
  const cameraChunksRef = useRef<BlobPart[]>([]); // kept for fallback
  const screenRecorderStartFailedRef = useRef(false);
  const activeCameraStreamKeyRef = useRef<string | null>(null);
  // Capture elapsed at the moment stop is triggered (recorder.onstop fires async)
  const elapsedMsAtStop = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Refs for audio state — needed because startMediaRecorder is called from a stale IPC closure
  const micStreamRef = useRef<MediaStream | null>(null);
  const micEnabledRef = useRef(micEnabled);
  const sysAudioEnabledRef = useRef(sysAudioEnabled);
  const audioMixCleanupRef = useRef<(() => void) | null>(null);

  // Keep streamRef in sync so onstop closure can access current value
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // Keep audio state refs in sync so startMediaRecorder (stale IPC closure) sees current values
  useEffect(() => {
    micStreamRef.current = micStream;
  }, [micStream]);
  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);
  useEffect(() => {
    sysAudioEnabledRef.current = sysAudioEnabled;
  }, [sysAudioEnabled]);

  const refreshSources = useCallback(async () => {
    try {
      const nextSources = await window.roughcut.recordingGetSources();
      setSources(nextSources);
    } catch (error) {
      console.warn('[PanelApp] Failed to refresh capture sources:', error);
      setSources([]);
    }
  }, []);

  // ── Load sources on mount ────────────────────────────────────────────────
  useEffect(() => {
    void refreshSources();
  }, [refreshSources]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void refreshSources();
      }
    };

    const handleFocus = () => {
      void refreshSources();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSources]);

  // ── IPC event subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    const unsubCountdown = window.roughcut.onSessionCountdownTick((s) => {
      setCountdownSeconds(s);
      setStatus('countdown');
    });

    const unsubStatus = window.roughcut.onSessionStatusChanged((s) => {
      if (s === 'recording') {
        setStatus('recording');
        setSetupModeDuringRecording(false);
        startMediaRecorder();
      } else if (s === 'stopping') {
        stopMediaRecorder();
      } else if (s === 'idle') {
        setStatus('idle');
        setSetupModeDuringRecording(false);
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
    if (!hydrated) return;
    if (!cameraEnabled) {
      activeCameraStreamKeyRef.current = null;
      setCameraStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      return;
    }
    const desiredCameraKey = selectedCameraDeviceId ?? '__default__';
    const existingTrack = cameraStream?.getVideoTracks()[0] ?? null;
    if (
      cameraStream &&
      existingTrack &&
      existingTrack.readyState === 'live' &&
      activeCameraStreamKeyRef.current === desiredCameraKey
    ) {
      return;
    }
    let active = true;
    console.info('[PanelApp] Requesting camera via getUserMedia...');
    navigator.mediaDevices
      .getUserMedia({
        video: {
          ...(selectedCameraDeviceId ? { deviceId: { exact: selectedCameraDeviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      })
      .then(async (s) => {
        const track = s.getVideoTracks()[0];
        try {
          await warmCameraStream(s);
        } catch (err) {
          console.warn('[PanelApp] Camera warmup failed:', err);
        }
        if (track) {
          const settings = track.getSettings();
          console.info(
            `[PanelApp] Camera stream: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`,
          );
        }
        void refreshDeviceOptions();
        if (active) {
          activeCameraStreamKeyRef.current = desiredCameraKey;
          setCameraStream((prev) => {
            if (prev && prev !== s) {
              prev.getTracks().forEach((t) => t.stop());
            }
            return s;
          });
        }
        else s.getTracks().forEach((t) => t.stop());
      })
      .catch((err) => {
        console.error('[PanelApp] Camera getUserMedia FAILED:', err?.name, err?.message, err);
        if (active) setCameraStream(null);
      });
    return () => {
      active = false;
    };
  }, [cameraEnabled, cameraStream, hydrated, refreshDeviceOptions, selectedCameraDeviceId]);

  useEffect(() => {
    const track = micStream?.getAudioTracks()[0] ?? null;
    if (!track) {
      warningRef.current.mic = null;
      return;
    }

    const handleEnded = () => {
      if (warningRef.current.mic === track.id) return;
      warningRef.current.mic = track.id;
      updateRecordingConfig({ selectedMicDeviceId: null, micEnabled: false });
      setConnectionIssues((current) => ({
        ...current,
        mic: 'Mic offline. Recording is still running, but microphone audio has been removed.',
      }));
      showToast({
        title: 'Microphone disconnected',
        message: 'Recording is still running, but mic audio has been removed.',
        tone: 'warning',
      });
    };

    track.addEventListener('ended', handleEnded);
    return () => {
      track.removeEventListener('ended', handleEnded);
    };
  }, [micStream, showToast]);

  useEffect(() => {
    const track = cameraStream?.getVideoTracks()[0] ?? null;
    if (!track) {
      warningRef.current.camera = null;
      return;
    }

    const handleEnded = () => {
      if (warningRef.current.camera === track.id) return;
      warningRef.current.camera = track.id;
      updateRecordingConfig({ selectedCameraDeviceId: null, cameraEnabled: false });
      setConnectionIssues((current) => ({
        ...current,
        camera: 'Camera offline. Recording is still running, but camera video has been removed.',
      }));
      showToast({
        title: 'Camera disconnected',
        message: 'Recording is still running, but camera video has been removed.',
        tone: 'warning',
      });
    };

    track.addEventListener('ended', handleEnded);
    return () => {
      track.removeEventListener('ended', handleEnded);
    };
  }, [cameraStream, showToast]);

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      micStream?.getTracks().forEach((t) => t.stop());
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraStream, micStream, stream]);

  // ── Source selection ─────────────────────────────────────────────────────
  const handleSelectSource = useCallback((id: string) => {
    updateRecordingConfig({ selectedSourceId: id });
  }, []);

  const handleRetargetSource = useCallback(() => {
    const expectedType = recordMode === 'window' ? 'window' : 'screen';
    const fallbackSource = sources.find((source) => source.type === expectedType) ?? null;
    if (!fallbackSource) return;
    updateRecordingConfig({ selectedSourceId: fallbackSource.id });
  }, [recordMode, sources]);

  useEffect(() => {
    if (!hydrated) return;

    const expectedType = recordMode === 'window' ? 'window' : 'screen';
    const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? null;
    if (selectedSource?.type === expectedType) return;

    if (selectedSourceId) {
      previousSelectedSourceIdRef.current = selectedSourceId;
      updateRecordingConfig({ selectedSourceId: null });
      setConnectionIssues((current) => ({
        ...current,
        source:
          sources.length > 0
            ? 'Source offline. The selected screen or window is no longer available. Re-target to continue.'
            : 'Source offline. No capture sources are currently available. Refresh sources or reconnect a display.',
      }));
      return;
    }

    if (previousSelectedSourceIdRef.current) {
      return;
    }

    const fallbackSource = sources.find((source) => source.type === expectedType) ?? null;
    if (fallbackSource && fallbackSource.id !== selectedSourceId) {
      updateRecordingConfig({ selectedSourceId: fallbackSource.id });
    }
  }, [hydrated, recordMode, selectedSourceId, sources]);

  useEffect(() => {
    let active = true;

    if (!hydrated) {
      return () => {
        active = false;
      };
    }

    if (!selectedSourceId) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setStream(null);
      setStatus((current) =>
        current === 'recording' || current === 'stopping' ? current : 'idle',
      );
      return () => {
        active = false;
      };
    }

    const acquireStream = async () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      try {
        const s = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 15, max: 20 },
          },
          audio: true,
        });
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }

        const videoTrack = s.getVideoTracks()[0];
        if (videoTrack) {
          void videoTrack.applyConstraints({ frameRate: { ideal: 15, max: 20 } }).catch(() => {});
          const settings = videoTrack.getSettings();
          console.info(
            '[PanelApp] Screen track:',
            settings.width,
            'x',
            settings.height,
            '@',
            settings.frameRate,
            'fps',
          );
        }

        streamRef.current = s;
        setStream(s);
        setStatus('ready');
        console.info('[PanelApp] Stream acquired via getDisplayMedia');
      } catch (err) {
        if (!active) return;
        console.error('[PanelApp] Failed to acquire stream:', err);
        streamRef.current = null;
        setStream(null);
        setStatus('idle');
      }
    };

    void acquireStream();

    return () => {
      active = false;
    };
  }, [hydrated, selectedSourceId]);

  useEffect(() => {
    let active = true;
    window.roughcut
      .recordingRecoveryGet()
      .then((recovery) => {
        if (active) setRecordingRecovery(recovery?.canRecover ? recovery : null);
      })
      .catch((error) => {
        console.warn('[PanelApp] Failed to load recovery state:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const track = stream?.getVideoTracks()[0] ?? null;
    if (!track) {
      warningRef.current.source = null;
      return;
    }

    const handleEnded = () => {
      if (warningRef.current.source === track.id) return;
      warningRef.current.source = track.id;
      updateRecordingConfig({ selectedSourceId: null });
      setConnectionIssues((current) => ({
        ...current,
        source:
          'Source offline. The selected screen or window disappeared, so recording was stopped safely.',
      }));
      if (statusRef.current === 'recording') {
        void window.roughcut.panelStopRecording();
      }
      setStatus('idle');
      showToast({
        title: 'Capture source disconnected',
        message: 'The selected screen or window disappeared, so recording was stopped safely.',
        tone: 'warning',
      });
    };

    track.addEventListener('ended', handleEnded);
    return () => {
      track.removeEventListener('ended', handleEnded);
    };
  }, [showToast, stream]);

  // ── MediaRecorder helpers ────────────────────────────────────────────────
  // Store latest camera stream in a ref so the IPC callback (which uses [] deps)
  // always sees the current value instead of the stale closure from first render.
  const cameraStreamRef = useRef(cameraStream);
  cameraStreamRef.current = cameraStream;

  const cameraEnabledRef = useRef(cameraEnabled);
  cameraEnabledRef.current = cameraEnabled;

  const selectedCameraDeviceIdRef = useRef(selectedCameraDeviceId);
  selectedCameraDeviceIdRef.current = selectedCameraDeviceId;

  // Test-only hooks for controlling the panel's camera preview state from Playwright
  // specs. Matches the existing `window.__roughcutStores` and `window.roughcut.debug*`
  // patterns — always exposed, harmless in production because nothing in shipping code
  // invokes them. Added to support the preview-track-ended regression test for the
  // 2026-04-22 camera-recording bug. See TASK-185.
  useEffect(() => {
    const hooks = {
      injectCameraStream: (stream: MediaStream | null) => {
        // Match the preview useEffect's key so its early-bail guard passes and it
        // doesn't immediately re-acquire via getUserMedia.
        activeCameraStreamKeyRef.current = stream
          ? (selectedCameraDeviceIdRef.current ?? '__default__')
          : null;
        // Update the ref synchronously so immediate follow-up calls (e.g. killing
        // tracks in the same microtask from a test) see the injected stream
        // without waiting for a React render pass.
        cameraStreamRef.current = stream;
        setCameraStream(stream);
      },
      killCameraStreamTracks: () => {
        cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      },
      getCameraStreamTrackStates: () =>
        cameraStreamRef.current?.getTracks().map((t) => t.readyState) ?? [],
    };
    (window as unknown as { __panelTestHooks?: typeof hooks }).__panelTestHooks = hooks;
    return () => {
      delete (window as unknown as { __panelTestHooks?: typeof hooks }).__panelTestHooks;
    };
  }, []);

  const finalizePanelRecording = async (currentStream: MediaStream) => {
    setStatus('stopping');

    let cameraBuffer: ArrayBuffer | undefined;
    let cameraMimeType: string | undefined;
    if (cameraRecorderStartRef.current) {
      try {
        await cameraRecorderStartRef.current;
      } catch (err) {
        console.error('[PanelApp] Camera recorder startup failed before stop:', err);
      } finally {
        cameraRecorderStartRef.current = null;
      }
    }
    const cameraRecorder = cameraRecorderRef.current;
    console.info('[PanelApp] Finalizing camera recorder:', {
      kind: cameraRecorderKindRef.current,
      hasRecorder: Boolean(cameraRecorder),
      constructorName: cameraRecorder?.constructor?.name ?? 'none',
      mimeType: cameraRecorderMimeTypeRef.current,
      chunkCount: cameraChunksRef.current.length,
    });
    if (cameraRecorder instanceof MediaRecorder) {
      cameraMimeType = cameraRecorderMimeTypeRef.current;
      try {
        if (cameraRecorder.state === 'recording' || cameraRecorder.state === 'paused') {
          cameraBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const handleStop = async () => {
              cameraRecorder.removeEventListener('stop', handleStop);
              cameraRecorder.removeEventListener('error', handleError);
              try {
                const blob = new Blob(cameraChunksRef.current, {
                  type: cameraMimeType || 'video/webm',
                });
                resolve(await blob.arrayBuffer());
              } catch (error) {
                reject(error);
              }
            };
            const handleError = (event: Event) => {
              cameraRecorder.removeEventListener('stop', handleStop);
              cameraRecorder.removeEventListener('error', handleError);
              reject(event);
            };

            cameraRecorder.addEventListener('stop', handleStop, { once: true });
            cameraRecorder.addEventListener('error', handleError, { once: true });
            try {
              cameraRecorder.requestData();
            } catch {
              // Ignore requestData timing issues.
            }
            cameraRecorder.stop();
          });
        }
      } catch (err) {
        console.error('[PanelApp] Camera recorder stop failed:', err);
      }
    } else if (cameraRecorder && typeof cameraRecorder.stop === 'function') {
      cameraMimeType = cameraRecorderMimeTypeRef.current;
      try {
        console.info('[PanelApp] Stopping custom camera recorder');
        const raw = await cameraRecorder.stop();
        if (raw instanceof Uint8Array) {
          cameraBuffer = Uint8Array.from(raw).buffer;
        } else if (raw instanceof ArrayBuffer) {
          cameraBuffer = raw;
        }
        if (cameraBuffer) {
          console.info('[PanelApp] Camera recording size:', cameraBuffer.byteLength);
        }
      } catch (err) {
        console.error('[PanelApp] Camera recorder stop failed:', err);
      }
    }
    cameraRecorderRef.current = null;
    cameraRecorderKindRef.current = 'none';
    cameraRecordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraRecordingStreamRef.current = null;

    const blob = new Blob(chunksRef.current, { type: 'video/webm' });
    const buffer = await blob.arrayBuffer();
    const settings = currentStream.getVideoTracks()[0]?.getSettings();

    const metadata: RecordingMetadata = {
      fps: settings?.frameRate ?? 30,
      width: settings?.width ?? 1920,
      height: settings?.height ?? 1080,
      durationMs: elapsedMsAtStop.current,
      timelineFps: 30,
    };

    try {
      await window.roughcut.panelSaveRecording(buffer, metadata, cameraBuffer, cameraMimeType);
    } catch (err) {
      console.error('[PanelApp] Failed to save recording:', err);
      setStatus('ready');
    }
  };

  const startMediaRecorder = () => {
    const currentStream = streamRef.current;
    if (!currentStream) {
      console.warn('[PanelApp] startMediaRecorder called without an active stream');
      return;
    }

    chunksRef.current = [];
    cameraChunksRef.current = [];
    screenRecorderStartFailedRef.current = false;

    // Build combined stream with audio mixing
    // Debug: log audio state (check panel window DevTools)
    console.info('[PanelApp] buildRecordingStream inputs:', {
      displayAudioTracks: currentStream.getAudioTracks().length,
      hasMicStream: !!micStreamRef.current,
      micAudioTracks: micStreamRef.current?.getAudioTracks().length ?? 0,
      sysAudioEnabled: sysAudioEnabledRef.current,
      micEnabled: micEnabledRef.current,
    });
    const { stream: recordingStream, cleanup: audioCleanup } = buildRecordingStream(
      currentStream,
      micStreamRef.current,
      sysAudioEnabledRef.current,
      micEnabledRef.current,
    );
    audioMixCleanupRef.current = audioCleanup;

    const hasAudio = recordingStream.getAudioTracks().length > 0;
    console.info(
      '[PanelApp] Recording stream:',
      'video:',
      recordingStream.getVideoTracks().length,
      'audio:',
      hasAudio,
      'mimeType will be audio-aware:',
      hasAudio,
    );
    let mimeType: string;
    if (hasAudio) {
      mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';
    } else {
      mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm;codecs=vp8';
    }

    // Screen recorder
    const recorder = new MediaRecorder(recordingStream, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      void finalizePanelRecording(currentStream);
    };

    recorderRef.current = recorder;
    try {
      recorder.start(1000); // 1-second chunks
    } catch (err) {
      screenRecorderStartFailedRef.current = true;
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorderRef.current = null;
      console.error('[PanelApp] Screen MediaRecorder failed to start; relying on fallback save path:', err);
    }
    // Sync cursor recording start time with actual MediaRecorder start
    (window as any).roughcut.panelMediaRecorderStarted(Date.now());

    // Record camera on a fresh getUserMedia stream so preview lifecycle doesn't affect capture.
    const currentCameraStream = cameraStreamRef.current;
    console.info(
      '[PanelApp] Camera stream at record start:',
      currentCameraStream ? 'ACTIVE' : 'NULL',
      'cameraEnabled:',
      cameraEnabledRef.current,
    );
    if (currentCameraStream && cameraEnabledRef.current) {
      void (async () => {
        let recordingCameraStream: MediaStream;
        try {
          recordingCameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
              ...(selectedCameraDeviceId ? { deviceId: { exact: selectedCameraDeviceId } } : {}),
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          });
        } catch (err) {
          console.error('[PanelApp] Camera acquire for recording failed:', err);
          return;
        }

        const recordingCameraTrack = recordingCameraStream.getVideoTracks()[0] ?? null;
        if (!recordingCameraTrack || recordingCameraTrack.readyState !== 'live') {
          console.error(
            '[PanelApp] Camera track not live after acquire:',
            recordingCameraTrack?.readyState ?? 'no-track',
          );
          recordingCameraStream.getTracks().forEach((t) => t.stop());
          return;
        }

        cameraRecordingStreamRef.current = recordingCameraStream;
        cameraRecorderStartRef.current = import('./camera-recorder.js')
          .then(async ({ CameraRecorder }) => {
            const recorder = new CameraRecorder();
            cameraRecorderKindRef.current = 'mediabunny';
            cameraRecorderMimeTypeRef.current = 'video/mp4';
            cameraRecorderRef.current = recorder;
            await recorder.start(recordingCameraStream);
          })
          .catch((err) => {
            console.error('[PanelApp] CameraRecorder failed, falling back to MediaRecorder:', err);
            const fallbackMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
              ? 'video/webm;codecs=vp8'
              : 'video/webm';
            cameraRecorderMimeTypeRef.current = fallbackMime;
            try {
              const camRecorder = new MediaRecorder(recordingCameraStream, { mimeType: fallbackMime });
              cameraRecorderKindRef.current = 'mediarecorder';
              cameraRecorderRef.current = camRecorder;
              camRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) cameraChunksRef.current.push(e.data);
              };
              camRecorder.onerror = (event) => {
                console.error('[PanelApp] Camera MediaRecorder error event:', event);
              };
              camRecorder.start(250);
            } catch (fallbackErr) {
              console.error('[PanelApp] Camera MediaRecorder failed:', fallbackErr);
              cameraRecorderRef.current = null;
              cameraRecorderKindRef.current = 'none';
            }
          })
          .finally(() => {
            cameraRecorderStartRef.current = null;
          });
      })();
    }
  };

  const stopMediaRecorder = () => {
    elapsedMsAtStop.current = elapsedMs;
    // Clean up AudioContext mixer if active
    audioMixCleanupRef.current?.();
    audioMixCleanupRef.current = null;
    // Stop screen recorder — its onstop handler will also stop camera recorder
    if (recorderRef.current?.state === 'recording' || recorderRef.current?.state === 'paused') {
      recorderRef.current.stop();
      return;
    }
    if (screenRecorderStartFailedRef.current && streamRef.current) {
      screenRecorderStartFailedRef.current = false;
      void finalizePanelRecording(streamRef.current);
    }
  };

  const teardownLocalRecordingResources = useCallback(() => {
    audioMixCleanupRef.current?.();
    audioMixCleanupRef.current = null;

    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        try {
          recorder.stop();
        } catch {
          // Ignore renderer teardown races.
        }
      }
    }
    recorderRef.current = null;

    const cameraRecorder = cameraRecorderRef.current;
    if (cameraRecorder && typeof cameraRecorder.stop === 'function') {
      Promise.resolve(cameraRecorder.stop()).catch(() => {});
    }
    cameraRecorderRef.current = null;
    cameraRecorderStartRef.current = null;
    cameraRecorderKindRef.current = 'none';
    cameraRecordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraRecordingStreamRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      teardownLocalRecordingResources();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [teardownLocalRecordingResources]);

  // ── User action handlers ─────────────────────────────────────────────────
  const handleStartRecording = () => {
    const selectedMicLabel =
      selectedMicDeviceId && micOptions.some((option) => option.id === selectedMicDeviceId)
        ? (micOptions.find((option) => option.id === selectedMicDeviceId)?.label ?? null)
        : null;

    void (async () => {
      if (cameraEnabledRef.current) {
        const readyCameraStream = await waitForCameraStreamReady(() => cameraStreamRef.current);
        if (!readyCameraStream) {
          console.warn('[PanelApp] Blocking recording start because camera stream is not ready');
          showToast({
            title: 'Camera still warming up',
            message: 'Wait a moment for the camera preview before starting the take.',
            tone: 'warning',
          });
          return;
        }
      }

      await window.roughcut.panelStartRecording({
        micEnabled: micEnabledRef.current,
        sysAudioEnabled: sysAudioEnabledRef.current,
        countdownSeconds: configuredCountdownSeconds,
        selectedMicDeviceId,
        selectedMicLabel,
        selectedSystemAudioSourceId,
      });
    })();
  };

  const handleStopRecording = () => {
    void window.roughcut.panelStopRecording();
  };

  const handleClose = () => {
    if (statusRef.current === 'recording' || statusRef.current === 'stopping') {
      setStatus('stopping');
    }
    void window.roughcut.closeRecordingPanel();
  };

  const handleOpenFixMode = useCallback(() => {
    setSetupModeDuringRecording(true);
    void window.roughcut.panelResize('setup');
  }, []);

  const handleReturnMiniMode = useCallback(() => {
    setSetupModeDuringRecording(false);
    void window.roughcut.panelResize('mini');
  }, []);

  const handleRecoverTake = useCallback(() => {
    setRecoveringTake(true);
    void window.roughcut
      .recordingRecoveryRecover()
      .then((result) => {
        if (!result) {
          showToast({
            title: 'Recovery unavailable',
            message: 'The partial take is no longer available to import.',
            tone: 'warning',
          });
          setRecordingRecovery(null);
          return;
        }

        setRecordingRecovery(null);
        showToast({
          title: 'Recovered interrupted take',
          message: 'The partial recording was imported into the current project flow.',
          tone: 'info',
        });
        void window.roughcut.closeRecordingPanel();
      })
      .catch((error) => {
        console.error('[PanelApp] Failed to recover interrupted take:', error);
        showToast({
          title: 'Recovery failed',
          message: 'Rough Cut could not import the interrupted take.',
          tone: 'error',
        });
      })
      .finally(() => {
        setRecoveringTake(false);
      });
  }, [showToast]);

  // ─── Render ──────────────────────────────────────────────────────────────
  const canRecord = hydrated && status === 'ready' && stream !== null;
  const issueMessages = Object.values(connectionIssues).filter((message): message is string =>
    Boolean(message),
  );
  const setupPanelHeight = (issueMessages.length > 0 ? 284 : 240) + (recordingRecovery ? 86 : 0);
  const miniIssueLabel = connectionIssues.source
    ? 'Source offline'
    : connectionIssues.mic
      ? 'Mic offline'
      : connectionIssues.camera
        ? 'Camera offline'
        : connectionIssues.systemAudio
          ? 'Audio offline'
          : null;

  // ─── Mini-controller during recording ─────────────────────────────────
  if (status === 'recording' && !setupModeDuringRecording) {
    return (
      <MiniController
        elapsedMs={elapsedMs}
        issueLabel={miniIssueLabel}
        onFixIssue={miniIssueLabel ? handleOpenFixMode : null}
        onStop={handleStopRecording}
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
        height: setupPanelHeight,
        background: C.bg,
        borderRadius: R.outer,
        border: `1px solid ${C.border}`,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        color: C.text,
        userSelect: 'none',
      }}
    >
      {/* 1. Title bar */}
      <TitleBar
        onClose={handleClose}
        accessory={
          status === 'recording' && setupModeDuringRecording ? (
            <SetupModeButton onClick={handleReturnMiniMode} />
          ) : undefined
        }
      />

      {recordingRecovery && (
        <RecoveryNotice
          recovery={recordingRecovery}
          busy={recoveringTake}
          onRecover={handleRecoverTake}
          onOpenFolder={() => {
            void window.roughcut.shellOpenPath(recordingRecovery.recordingsDir);
          }}
          onDismiss={() => {
            void window.roughcut.recordingRecoveryDismiss().then(() => setRecordingRecovery(null));
          }}
        />
      )}

      {/* 2. Source selector */}
      <SourceSelector
        sources={sources}
        selectedSourceId={selectedSourceId}
        issue={connectionIssues.source}
        onSelectSource={handleSelectSource}
        onRefreshSources={() => {
          void refreshSources();
        }}
        onRetarget={handleRetargetSource}
        canRetarget={sources.some(
          (source) => source.type === (recordMode === 'window' ? 'window' : 'screen'),
        )}
      />

      <IssueNotice messages={issueMessages} />

      <Divider />

      {/* 3. Device controls */}
      <DeviceControls
        micEnabled={micEnabled}
        sysAudioEnabled={sysAudioEnabled}
        cameraEnabled={cameraEnabled}
        micIssue={connectionIssues.mic}
        cameraIssue={connectionIssues.camera}
        systemAudioIssue={connectionIssues.systemAudio}
        micOptions={micOptions}
        selectedMicDeviceId={selectedMicDeviceId}
        onSelectMicDevice={(id) =>
          updateRecordingConfig({ selectedMicDeviceId: id, micEnabled: id ? true : micEnabled })
        }
        cameraOptions={cameraOptions}
        selectedCameraDeviceId={selectedCameraDeviceId}
        onSelectCameraDevice={(id) =>
          updateRecordingConfig({
            selectedCameraDeviceId: id,
            cameraEnabled: id ? true : cameraEnabled,
          })
        }
        systemAudioOptions={systemAudioOptions}
        selectedSystemAudioSourceId={selectedSystemAudioSourceId}
        onSelectSystemAudioSource={(id) =>
          updateRecordingConfig({
            selectedSystemAudioSourceId: id,
            sysAudioEnabled: id ? true : sysAudioEnabled,
          })
        }
        onMicToggle={handleMicToggle}
        onSysAudioToggle={() => updateRecordingConfig({ sysAudioEnabled: !sysAudioEnabled })}
        onCameraToggle={() => updateRecordingConfig({ cameraEnabled: !cameraEnabled })}
      />

      {/* Audio level meter — shows when mic is active */}
      {micEnabled && <AudioLevelMeter level={audioLevel} />}

      <Divider />

      {/* 4. Recording controls */}
      <RecordingControls
        status={status}
        elapsedMs={elapsedMs}
        canRecord={canRecord}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
      />

      {/* Live camera PiP — top-right overlay, only when camera is enabled */}
      <CameraPiPOverlay cameraStream={cameraStream} />

      {/* Countdown overlay — position:fixed, covers the whole window */}
      <CountdownOverlay secondsRemaining={countdownSeconds} visible={status === 'countdown'} />
    </div>
  );
}
