import React, { useState } from 'react';

interface EditTimelineShellProps {
  // Tool actions
  canUndo: boolean;
  canRedo: boolean;
  canSplit: boolean;
  canDelete: boolean;
  snapEnabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onToggleSnap: () => void;

  // Zoom
  pixelsPerFrame: number;
  onZoomChange: (value: number) => void;

  // Timecode
  playheadFrame: number;
  fps?: number;

  // Body content
  children: React.ReactNode;
}

function framesToTimecode(frames: number, fps = 30): string {
  const totalSeconds = Math.floor(frames / fps);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const f = frames % fps;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
}

interface ToolButtonProps {
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}

function TimelineToolButton({ label, title, disabled = false, onClick }: ToolButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 24,
        padding: '0 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        fontFamily: 'inherit',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: hovered && !disabled ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        color: 'rgba(255,255,255,0.75)',
        opacity: disabled ? 0.35 : 1,
        transition: 'background 0.12s',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {label}
    </button>
  );
}

interface ToggleButtonProps {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
}

function TimelineToolToggle({ label, title, active, onClick }: ToggleButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 24,
        padding: '0 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        fontFamily: 'inherit',
        border: 'none',
        cursor: 'pointer',
        background: active
          ? 'rgba(255,255,255,0.14)'
          : hovered
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.04)',
        color: active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.75)',
        transition: 'background 0.12s',
        userSelect: 'none',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {label}
    </button>
  );
}

export function EditTimelineShell({
  canUndo,
  canRedo,
  canSplit,
  canDelete,
  snapEnabled,
  onUndo,
  onRedo,
  onSplit,
  onDelete,
  onToggleSnap,
  pixelsPerFrame,
  onZoomChange,
  playheadFrame,
  fps = 30,
  children,
}: EditTimelineShellProps) {
  return (
    <div
      style={{
        width: '100%',
        flex: 1,
        minHeight: 120,
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
      {/* Header — tools row */}
      <div
        style={{
          height: 32,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: 'rgba(0,0,0,0.80)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        {/* Left: tool buttons + divider + snap */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TimelineToolButton label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} />
          <TimelineToolButton label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo} />
          <TimelineToolButton label="Split" title="Split at playhead (S)" disabled={!canSplit} onClick={onSplit} />
          <TimelineToolButton label="Delete" title="Delete clip (Delete)" disabled={!canDelete} onClick={onDelete} />

          {/* Divider */}
          <div
            style={{
              width: 1,
              height: 16,
              background: 'rgba(255,255,255,0.08)',
              margin: '0 2px',
              flexShrink: 0,
            }}
          />

          <TimelineToolToggle label="Snap" title="Toggle snap to edges" active={snapEnabled} onClick={onToggleSnap} />
        </div>

        {/* Right: zoom + timecode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.50)',
              userSelect: 'none',
            }}
          >
            Zoom
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={pixelsPerFrame}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            style={{ width: 120, accentColor: '#ff7043' }}
            title={`${pixelsPerFrame}px/frame`}
          />
          <span
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.72)',
              fontFamily: 'monospace',
              letterSpacing: '0.04em',
              minWidth: 64,
              textAlign: 'right',
              userSelect: 'none',
            }}
          >
            {framesToTimecode(playheadFrame, fps)}
          </span>
        </div>
      </div>

      {/* Body — children render here (TimelineStrip) */}
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
