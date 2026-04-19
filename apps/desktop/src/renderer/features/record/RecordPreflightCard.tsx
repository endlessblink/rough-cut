import { useState } from 'react';
import type { RecordingPreflightStatus } from '../../env.js';

interface RuntimeCheck {
  label: string;
  status: 'ready' | 'warning';
  detail: string;
}

interface RecordPreflightCardProps {
  diagnostics: RecordingPreflightStatus | null;
  runtimeChecks: RuntimeCheck[];
  running: boolean;
  onRun: () => void;
  onOpenSettings: (kind: 'screenCapture' | 'microphone' | 'camera') => void;
}

function StatusPill({ label, tone }: { label: string; tone: 'good' | 'warn' | 'neutral' }) {
  const styles =
    tone === 'good'
      ? {
          background: 'rgba(16,185,129,0.14)',
          color: '#6ee7b7',
          border: '1px solid rgba(16,185,129,0.28)',
        }
      : tone === 'warn'
        ? {
            background: 'rgba(245,158,11,0.14)',
            color: '#fcd34d',
            border: '1px solid rgba(245,158,11,0.28)',
          }
        : {
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(255,255,255,0.08)',
          };

  return (
    <span
      style={{
        ...styles,
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 11,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 10px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
        color: disabled ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.88)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

export function RecordPreflightCard({
  diagnostics,
  runtimeChecks,
  running,
  onRun,
  onOpenSettings,
}: RecordPreflightCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const rows = diagnostics
    ? [
        {
          key: 'screenCapture' as const,
          label: 'Screen capture',
          value: diagnostics.screenCapture,
        },
        { key: 'microphone' as const, label: 'Microphone', value: diagnostics.microphone },
        { key: 'camera' as const, label: 'Camera', value: diagnostics.camera },
      ]
    : [];

  return (
    <div
      data-testid="record-preflight-card"
      style={{
        margin: '8px 24px 12px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        padding: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>
            Recording preflight
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            Verify capture permissions, device availability, and source readiness before a real
            take.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ActionButton
            label={collapsed ? 'Expand' : 'Minimize'}
            onClick={() => setCollapsed((value) => !value)}
            testId="record-preflight-toggle"
          />
          <ActionButton
            label={running ? 'Running…' : 'Run preflight'}
            onClick={onRun}
            disabled={running}
            testId="record-preflight-run"
          />
        </div>
      </div>

      {!collapsed && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((row) => {
            const tone =
              row.value.status === 'granted' || row.value.status === 'not-required'
                ? 'good'
                : 'warn';
            const pillLabel =
              row.value.status === 'granted'
                ? 'Ready'
                : row.value.status === 'not-required'
                  ? 'OS not required'
                  : row.value.status === 'unsupported'
                    ? 'Unsupported'
                    : 'Needs attention';
            return (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.22)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)' }}>{row.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                    {row.value.detail}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <StatusPill label={pillLabel} tone={tone} />
                  <ActionButton
                    label="Open settings"
                    onClick={() => onOpenSettings(row.key)}
                    disabled={!row.value.canOpenSettings}
                    testId={`record-preflight-open-${row.key}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!collapsed && runtimeChecks.length > 0 && (
        <div
          data-testid="record-preflight-runtime"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
        >
          {runtimeChecks.map((check) => (
            <div
              key={check.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.22)',
              }}
            >
              <StatusPill
                label={check.status === 'ready' ? 'Ready' : 'Warning'}
                tone={check.status === 'ready' ? 'good' : 'warn'}
              />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>
                {check.label}: {check.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {!collapsed && diagnostics?.requiresFullRelaunch && (
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          macOS privacy changes usually require a full app relaunch before Electron sees the new
          state.
        </div>
      )}
    </div>
  );
}
