import React from 'react';

interface EditTimelineShellProps {
  children: React.ReactNode;
}

export function EditTimelineShell({ children }: EditTimelineShellProps) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 1140,
        height: 180,
        margin: '12px auto 0',
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

      {/* Body — children render here (EditToolbar + TimelineStrip) */}
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
