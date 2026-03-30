import React from 'react';

interface RecordScreenLayoutProps {
  children: React.ReactNode;
}

export function RecordScreenLayout({ children }: RecordScreenLayoutProps) {
  return (
    <div
      data-testid="record-tab-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0d0d0d',
        color: '#e8e8e8',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
}
