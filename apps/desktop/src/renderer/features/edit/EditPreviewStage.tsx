import React from 'react';

interface EditPreviewStageProps {
  children?: React.ReactNode;
}

// ─── EditPreviewCard ──────────────────────────────────────────────────────────

function EditPreviewCard() {
  return (
    <div
      style={{
        aspectRatio: '16 / 9',
        maxWidth: 960,
        width: '100%',
        borderRadius: 18,
        background: '#050505',
        boxShadow: '0 18px 60px rgba(0,0,0,0.80)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          color: 'rgba(255,255,255,0.40)',
          fontSize: 13,
          userSelect: 'none',
          letterSpacing: '0.04em',
        }}
      >
        Preview
      </span>
    </div>
  );
}

// ─── EditPreviewStage ─────────────────────────────────────────────────────────

export function EditPreviewStage({ children }: EditPreviewStageProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 420,
        padding: '24px 32px',
        borderRadius: 18,
        background: 'radial-gradient(circle at 20% 0%, #202020 0%, #050505 60%)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.75)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 960 }}>
        {children ?? <EditPreviewCard />}
      </div>
    </div>
  );
}
