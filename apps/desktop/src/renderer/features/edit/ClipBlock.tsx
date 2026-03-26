import { useCallback } from 'react';
import type { Clip, TrackType } from '@rough-cut/project-model';

interface ClipBlockProps {
  clip: Clip;
  trackType: TrackType;
  pixelsPerFrame: number;
  isSelected: boolean;
  label: string;
  onClick: (clipId: string) => void;
  onTrimLeft?: (clipId: string, newTimelineIn: number) => void;
  onTrimRight?: (clipId: string, newTimelineOut: number) => void;
}

const TRACK_COLORS: Record<TrackType, string> = {
  video: '#2563eb',
  audio: '#16a34a',
};

const SELECTED_BORDER = '#f59e0b';

const HANDLE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 6,
  cursor: 'ew-resize',
  zIndex: 2,
  opacity: 0,
  transition: 'opacity 0.15s',
  background: 'rgba(255,255,255,0.35)',
};

export function ClipBlock({
  clip,
  trackType,
  pixelsPerFrame,
  isSelected,
  label,
  onClick,
  onTrimLeft,
  onTrimRight,
}: ClipBlockProps) {
  const left = clip.timelineIn * pixelsPerFrame;
  const width = Math.max((clip.timelineOut - clip.timelineIn) * pixelsPerFrame, 2);
  const bg = TRACK_COLORS[trackType];

  const handleTrimLeftMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onTrimLeft) return;
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startFrame = clip.timelineIn;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const deltaFrames = Math.round(dx / pixelsPerFrame);
        const newFrame = startFrame + deltaFrames;
        onTrimLeft(clip.id, newFrame);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clip.id, clip.timelineIn, pixelsPerFrame, onTrimLeft],
  );

  const handleTrimRightMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onTrimRight) return;
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startFrame = clip.timelineOut;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const deltaFrames = Math.round(dx / pixelsPerFrame);
        const newFrame = startFrame + deltaFrames;
        onTrimRight(clip.id, newFrame);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clip.id, clip.timelineOut, pixelsPerFrame, onTrimRight],
  );

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(clip.id);
      }}
      title={label}
      className="clip-block"
      style={{
        position: 'absolute',
        left,
        top: 2,
        bottom: 2,
        width,
        background: bg,
        border: isSelected ? `2px solid ${SELECTED_BORDER}` : '1px solid rgba(255,255,255,0.15)',
        borderRadius: 3,
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 4,
        boxSizing: 'border-box',
        boxShadow: isSelected ? `0 0 6px ${SELECTED_BORDER}` : 'none',
      }}
    >
      {/* Left trim handle */}
      {onTrimLeft && (
        <div
          onMouseDown={handleTrimLeftMouseDown}
          className="trim-handle"
          style={{ ...HANDLE_STYLE, left: 0 }}
        />
      )}

      <span
        style={{
          fontSize: 10,
          color: '#fff',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          userSelect: 'none',
        }}
      >
        {label}
      </span>

      {/* Right trim handle */}
      {onTrimRight && (
        <div
          onMouseDown={handleTrimRightMouseDown}
          className="trim-handle"
          style={{ ...HANDLE_STYLE, right: 0 }}
        />
      )}

      {/* CSS for hover reveal of handles */}
      <style>{`
        .clip-block:hover .trim-handle {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
