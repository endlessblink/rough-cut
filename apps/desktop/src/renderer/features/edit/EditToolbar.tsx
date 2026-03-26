interface EditToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  canSplit: boolean;
  canDelete: boolean;
  snapEnabled: boolean;
  pixelsPerFrame: number;
  playheadFrame: number;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onToggleSnap: () => void;
  onZoomChange: (value: number) => void;
}

const BTN: React.CSSProperties = {
  background: '#2a2a2a',
  border: '1px solid #444',
  color: '#ccc',
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 3,
  cursor: 'pointer',
  userSelect: 'none',
};

const BTN_DISABLED: React.CSSProperties = {
  ...BTN,
  opacity: 0.35,
  cursor: 'default',
};

function framesToTimecode(frames: number, fps = 24): string {
  const totalSeconds = Math.floor(frames / fps);
  const remainderFrames = frames % fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(remainderFrames).padStart(2, '0')}`;
}

export function EditToolbar({
  canUndo,
  canRedo,
  canSplit,
  canDelete,
  snapEnabled,
  pixelsPerFrame,
  playheadFrame,
  onUndo,
  onRedo,
  onSplit,
  onDelete,
  onToggleSnap,
  onZoomChange,
}: EditToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: '#1a1a1a',
        borderTop: '1px solid #333',
        borderBottom: '1px solid #333',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Undo / Redo */}
      <button
        style={canUndo ? BTN : BTN_DISABLED}
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        style={canRedo ? BTN : BTN_DISABLED}
        disabled={!canRedo}
        onClick={onRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        Redo
      </button>

      <div style={{ width: 1, height: 18, background: '#444', margin: '0 2px' }} />

      {/* Split / Delete */}
      <button
        style={canSplit ? BTN : BTN_DISABLED}
        disabled={!canSplit}
        onClick={onSplit}
        title="Split at playhead (S)"
      >
        Split
      </button>
      <button
        style={canDelete ? BTN : BTN_DISABLED}
        disabled={!canDelete}
        onClick={onDelete}
        title="Delete clip (Delete)"
      >
        Delete
      </button>

      <div style={{ width: 1, height: 18, background: '#444', margin: '0 2px' }} />

      {/* Snap toggle */}
      <button
        style={{
          ...BTN,
          background: snapEnabled ? '#1d4ed8' : '#2a2a2a',
          color: snapEnabled ? '#fff' : '#ccc',
        }}
        onClick={onToggleSnap}
        title="Toggle snap"
      >
        Snap
      </button>

      <div style={{ width: 1, height: 18, background: '#444', margin: '0 2px' }} />

      {/* Zoom */}
      <span style={{ fontSize: 10, color: '#888' }}>Zoom</span>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={pixelsPerFrame}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        style={{ width: 80, accentColor: '#2563eb' }}
        title={`${pixelsPerFrame}px/frame`}
      />

      <div style={{ flex: 1 }} />

      {/* Timecode */}
      <span
        style={{
          fontSize: 11,
          color: '#aaa',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        {framesToTimecode(playheadFrame)}
      </span>
    </div>
  );
}
