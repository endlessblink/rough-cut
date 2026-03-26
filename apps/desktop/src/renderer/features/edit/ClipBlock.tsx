import { useCallback, useState } from 'react';
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

const TRACK_COLORS: Record<TrackType, { bg: string; border: string }> = {
  video: {
    bg: 'linear-gradient(to right, rgba(108,191,255,0.85), rgba(27,97,189,0.85))',
    border: '1px solid rgba(0,0,0,0.6)',
  },
  audio: {
    bg: 'linear-gradient(to right, rgba(255,189,110,0.85), rgba(221,128,42,0.85))',
    border: '1px solid rgba(0,0,0,0.6)',
  },
};

const HANDLE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 6,
  cursor: 'ew-resize',
  zIndex: 2,
  opacity: 0,
  transition: 'opacity 0.15s',
  background: 'rgba(255,255,255,0.5)',
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
  const [hovered, setHovered] = useState(false);

  const left = clip.timelineIn * pixelsPerFrame;
  const width = Math.max((clip.timelineOut - clip.timelineIn) * pixelsPerFrame, 2);
  const colors = TRACK_COLORS[trackType];

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left,
        top: 5,
        bottom: 5,
        width,
        background: colors.bg,
        border: isSelected ? '2px solid #ffcc66' : colors.border,
        borderRadius: 4,
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 4,
        boxSizing: 'border-box',
        boxShadow: isSelected
          ? '0 0 0 1px #ffffff'
          : hovered
            ? 'inset 0 0 0 100px rgba(255,255,255,0.06)'
            : 'none',
        transition: 'box-shadow 0.1s',
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
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
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
