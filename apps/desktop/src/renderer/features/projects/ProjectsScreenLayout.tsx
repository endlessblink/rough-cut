import React from 'react';

interface ProjectsScreenLayoutProps {
  children: React.ReactNode;
}

export function ProjectsScreenLayout({ children }: ProjectsScreenLayoutProps) {
  return (
    <div
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
