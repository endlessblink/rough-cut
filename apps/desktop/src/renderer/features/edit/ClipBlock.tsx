import type { Clip, TrackType } from '@rough-cut/project-model';

interface ClipBlockProps {
  clip: Clip;
  trackType: TrackType;
  pixelsPerFrame: number;
  isSelected: boolean;
  label: string;
  onClick: (clipId: string) => void;
}

const TRACK_COLORS: Record<TrackType, string> = {
  video: '#2563eb',
  audio: '#16a34a',
};

const SELECTED_BORDER = '#f59e0b';

export function ClipBlock({
  clip,
  trackType,
  pixelsPerFrame,
  isSelected,
  label,
  onClick,
}: ClipBlockProps) {
  const left = clip.timelineIn * pixelsPerFrame;
  const width = Math.max((clip.timelineOut - clip.timelineIn) * pixelsPerFrame, 2);
  const bg = TRACK_COLORS[trackType];

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(clip.id);
      }}
      title={label}
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
    </div>
  );
}
