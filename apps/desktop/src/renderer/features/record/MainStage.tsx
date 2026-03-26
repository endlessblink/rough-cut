import React from 'react';

interface MainStageProps {
  children: React.ReactNode;
}

export function MainStage({ children }: MainStageProps) {
  return (
    /* Outer: fills remaining space, centers the content column */
    <div
      style={{
        flex: '1 1 auto',
        display: 'flex',
        justifyContent: 'center',
        padding: '20px 24px 18px',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Inner: max-width column, vertical stack */}
      <div
        style={{
          width: '100%',
          maxWidth: 1140,
          display: 'flex',
          flexDirection: 'column',
          margin: '0 auto',
          flex: 1,
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
