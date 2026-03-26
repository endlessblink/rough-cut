import { useState, useRef, useCallback } from 'react';

interface VerticalWorkspaceSplitProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
  initialRatio?: number; // 0-1, default 0.65
  minRatio?: number;     // default 0.3
  maxRatio?: number;     // default 0.85
}

export function VerticalWorkspaceSplit({
  top,
  bottom,
  initialRatio = 0.65,
  minRatio = 0.3,
  maxRatio = 0.85,
}: VerticalWorkspaceSplitProps) {
  const [ratio, setRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [dragActive, setDragActive] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      setDragActive(true);

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const y = ev.clientY - rect.top;
        const newRatio = Math.min(maxRatio, Math.max(minRatio, y / rect.height));
        setRatio(newRatio);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        setDragActive(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [minRatio, maxRatio],
  );

  return (
    <div
      ref={containerRef}
      data-testid="vertical-split"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}
    >
      {/* Top pane */}
      <div style={{ flex: ratio, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {top}
      </div>

      {/* Splitter */}
      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          height: 8,
          flexShrink: 0,
          cursor: 'row-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            width: 32,
            height: 3,
            borderRadius: 999,
            background:
              dragActive || hovered ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.15)',
            transition: 'background 100ms ease',
          }}
        />
      </div>

      {/* Bottom pane */}
      <div style={{ flex: 1 - ratio, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {bottom}
      </div>
    </div>
  );
}
