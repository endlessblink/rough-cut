import React from 'react';

interface PreviewStageProps {
  children: React.ReactNode;
}

/**
 * PreviewStage: centers the preview card within the left column.
 *
 * Uses the flex + min-width:0 + min-height:0 pattern so that aspect-ratio
 * children are constrained by both axes — landscape fills width, portrait
 * fills height, square fills whichever is tighter. No overflow.
 */
export function PreviewStage({ children }: PreviewStageProps) {
  return (
    <section
      style={{
        flex: '1 1 auto',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'hidden',
      }}
    >
      {children}
    </section>
  );
}
