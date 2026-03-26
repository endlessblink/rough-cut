import React from 'react';

interface MainStageProps {
  children: React.ReactNode;
}

export function MainStage({ children }: MainStageProps) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 24px 8px',
        minHeight: 0,
        overflow: 'hidden',
        background: 'linear-gradient(to bottom, #111111, #050505)',
      }}
    >
      {children}
    </div>
  );
}
