import React from 'react';

interface PreviewStageProps {
  children: React.ReactNode;
}

/**
 * PreviewStage: centers the preview card within the left column.
 * The card itself owns all visual framing (corners, shadow, vignette).
 * This component only handles flex centering + max-width constraint.
 */
export function PreviewStage({ children }: PreviewStageProps) {
  return (
    <section
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 420,
      }}
    >
      <div style={{ width: '100%', maxWidth: 1040 }}>{children}</div>
    </section>
  );
}
