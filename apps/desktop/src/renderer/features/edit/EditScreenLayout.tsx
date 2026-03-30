import React from 'react';

interface EditScreenLayoutProps {
  children: React.ReactNode;
}

export function EditScreenLayout({ children }: EditScreenLayoutProps) {
  return (
    <div
      data-testid="edit-tab-root"
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
