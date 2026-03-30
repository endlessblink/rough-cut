import { useCallback, useState } from 'react';
import type { Clip, TrackType } from '@rough-cut/project-model';

interface ClipBlockProps {
  clip: Clip;
  trackType: TrackType;
  pixelsPerFrame: number;
  isSelected: boolean;
  label: string;
  /** Duration of the source asset in frames — used to clamp trim handles */
  assetDuration?: number;
  snapEnabled?: boolean;
  allClipEdges?: number[];
  playheadFrame?: number;
  onSnapWhileDragging?: (snapFrame: number | null) => void;
  onClick: (clipId: string) => void;
  onTrimLeft?: (clipId: string, newTimelineIn: number) => void;
  onTrimRight?: (clipId: string, newTimelineOut: number) => void;
  onMove?: (clipId: string, newTimelineIn: number) => void;
  onDragStart?: (clipId: string) => void;
  onDragEnd?: () => void;
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
  assetDuration,
  snapEnabled,
  allClipEdges,
  playheadFrame,
  onSnapWhileDragging,
  onClick,
  onTrimLeft,
  onTrimRight,
  onMove,
  onDragStart,
  onDragEnd,
}: ClipBlockProps) {
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

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
      // Earliest timeline position where sourceIn would still be >= 0
      const minTimelineIn = clip.timelineIn - clip.sourceIn;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const deltaFrames = Math.round(dx / pixelsPerFrame);
        const newFrame = Math.max(minTimelineIn, startFrame + deltaFrames);
        onTrimLeft(clip.id, newFrame);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clip.id, clip.timelineIn, clip.sourceIn, pixelsPerFrame, onTrimLeft],
  );

  const handleTrimRightMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onTrimRight) return;
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startFrame = clip.timelineOut;
      // Latest timeline position where sourceOut would still be <= assetDuration
      const maxTimelineOut = assetDuration !== undefined
        ? clip.timelineIn + (assetDuration - clip.sourceIn)
        : undefined;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const deltaFrames = Math.round(dx / pixelsPerFrame);
        let newFrame = startFrame + deltaFrames;
        if (maxTimelineOut !== undefined) newFrame = Math.min(maxTimelineOut, newFrame);
        onTrimRight(clip.id, newFrame);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clip.id, clip.timelineIn, clip.timelineOut, clip.sourceIn, assetDuration, pixelsPerFrame, onTrimRight],
  );

  const handleDragMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onMove) return;
      // Don't start drag from trim handles
      if ((e.target as HTMLElement).classList.contains('trim-handle')) return;

      e.preventDefault();
      const startX = e.clientX;
      let dragging = false;
      let currentOffset = 0;
      let snappedIn = clip.timelineIn;
      const clipDuration = clip.timelineOut - clip.timelineIn;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        if (!dragging && Math.abs(dx) > 3) {
          dragging = true;
          setIsDragging(true);
          onDragStart?.(clip.id);
        }
        if (dragging) {
          currentOffset = dx;
          const rawDeltaFrames = dx / pixelsPerFrame;
          const newTimelineIn = clip.timelineIn + rawDeltaFrames;
          const newTimelineOut = newTimelineIn + clipDuration;

          let snapTarget: number | null = null;

          if (snapEnabled) {
            const SNAP_THRESHOLD_FRAMES = Math.ceil(5 / pixelsPerFrame);
            const targets = [...(allClipEdges ?? [])];
            if (playheadFrame !== undefined) targets.push(playheadFrame);

            for (const target of targets) {
              if (Math.abs(newTimelineIn - target) <= SNAP_THRESHOLD_FRAMES) {
                snappedIn = target;
                snapTarget = target;
                break;
              }
              if (Math.abs(newTimelineOut - target) <= SNAP_THRESHOLD_FRAMES) {
                snappedIn = target - clipDuration;
                snapTarget = target;
                break;
              }
            }

            if (snapTarget === null) {
              snappedIn = newTimelineIn;
            }
          } else {
            snappedIn = newTimelineIn;
          }

          onSnapWhileDragging?.(snapTarget);

          const snappedOffset = (snappedIn - clip.timelineIn) * pixelsPerFrame;
          setDragOffset(snapEnabled ? snappedOffset : currentOffset);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (dragging) {
          onSnapWhileDragging?.(null);
          const finalTimelineIn = Math.max(0, Math.round(snappedIn));
          onMove(clip.id, finalTimelineIn);
          setIsDragging(false);
          setDragOffset(0);
          onDragEnd?.();
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clip.id, clip.timelineIn, clip.timelineOut, pixelsPerFrame, snapEnabled, allClipEdges, playheadFrame, onSnapWhileDragging, onMove, onDragStart, onDragEnd],
  );

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(clip.id);
      }}
      onMouseDown={handleDragMouseDown}
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
        cursor: isDragging ? 'grabbing' : 'pointer',
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
        transition: isDragging ? 'none' : 'box-shadow 0.1s',
        transform: isDragging ? `translateX(${dragOffset}px)` : undefined,
        opacity: isDragging ? 0.5 : undefined,
        zIndex: isDragging ? 100 : undefined,
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
