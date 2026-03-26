import React from 'react';

interface PreviewStageProps {
  children: React.ReactNode;
}

/**
 * PreviewStage wraps PreviewCard and ensures it stays at a reasonable
 * max size while preserving the 16:9 ratio. It is the visual hero of
 * the Record screen — it should dominate the viewport.
 */
export function PreviewStage({ children }: PreviewStageProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 560,
        padding: '24px 32px',
        borderRadius: 16,
        background: 'radial-gradient(circle at 20% 0%, #202020 0%, #050505 60%)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.65)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 960 }}>{children}</div>
    </div>
  );
}
