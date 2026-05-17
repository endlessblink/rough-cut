import React from 'react';
import type { LibraryView, LibraryViewProps, ProjectSummary, SizeStep } from './types';
import { formatDuration, formatRelativeTime } from './format';
import { useHoverScrub } from './use-hover-scrub';
import { CardCheckbox } from './checkbox-chip';

const SIZE_TO_CARD_WIDTH: Record<SizeStep, number> = {
  S: 200,
  M: 280,
  L: 360,
};

function GridView({ summaries, sizeStep, onOpen, selection, hoverScrubEnabled, onCardClick, onToggleSelected, onCardContextMenu }: LibraryViewProps) {
  const cardWidth = SIZE_TO_CARD_WIDTH[sizeStep];
  const style = { '--gallery-card-w': `${cardWidth}px`, '--gallery-card-media-h': `${Math.round(cardWidth * 9 / 16)}px` } as React.CSSProperties;
  return (
    <div className="galleryGrid" style={style} role="list">
      {summaries.map((summary) => (
        <GridCard
          key={summary.path}
          summary={summary}
          onOpen={onOpen}
          selected={selection.has(summary.path)}
          hoverScrubEnabled={hoverScrubEnabled}
          onCardClick={onCardClick}
          onToggleSelected={onToggleSelected}
          onCardContextMenu={onCardContextMenu}
        />
      ))}
    </div>
  );
}

function GridCard({ summary, selected, hoverScrubEnabled, onCardClick, onToggleSelected, onCardContextMenu }: {
  summary: ProjectSummary;
  onOpen: (path: string) => void;
  selected: boolean;
  hoverScrubEnabled: boolean;
  onCardClick: (path: string, event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => void;
  onToggleSelected: (path: string) => void;
  onCardContextMenu: (path: string, x: number, y: number) => void;
}) {
  const durationSeconds = summary.durationMs / 1000;
  // Hover-scrub is gated by selection mode — when the user is multi-selecting,
  // we don't want cards to start playing on hover (distracting and a `<video>`
  // mount stampede on quick traversals).
  const scrub = useHoverScrub({ durationSeconds: hoverScrubEnabled ? durationSeconds : 0 });
  const { cardRef, videoRef, active, onPointerEnter, onPointerLeave, onPointerMove } = scrub;
  return (
    <button
      ref={cardRef as React.RefObject<HTMLButtonElement>}
      type="button"
      role="listitem"
      className={`galleryCard ${selected ? 'isSelected' : ''}`}
      onClick={(event) => onCardClick(summary.path, { metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey })}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCardContextMenu(summary.path, event.clientX, event.clientY);
      }}
      onPointerEnter={hoverScrubEnabled ? onPointerEnter : undefined}
      onPointerLeave={hoverScrubEnabled ? onPointerLeave : undefined}
      onPointerMove={hoverScrubEnabled ? onPointerMove : undefined}
      aria-pressed={selected}
      data-gallery-card={summary.path}
      data-has-camera={summary.hasCamera ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
    >
      <div className="galleryCardMedia">
        <CardCheckbox
          checked={selected}
          label={`Select ${summary.name}`}
          onChange={() => onToggleSelected(summary.path)}
        />
        {summary.thumbnailUrl ? (
          <img className="galleryCardImg" src={summary.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <div className="galleryCardMediaPlaceholder" />
        )}
        {active && summary.recordingUrl ? (
          <video
            ref={videoRef}
            className="galleryCardVideo"
            src={summary.recordingUrl}
            preload="none"
            muted
            playsInline
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) {
                try { v.currentTime = 0; } catch { /* noop */ }
              }
            }}
          />
        ) : null}
        {summary.resolutionLabel ? (
          <span className="galleryChip galleryChipResolution">{summary.resolutionLabel}</span>
        ) : null}
        {summary.hasCamera ? (
          <span className="galleryChip galleryChipCamera" title="Includes camera recording" aria-label="Includes camera recording">Cam</span>
        ) : null}
        <span className="galleryChip galleryChipDuration" aria-label={`Duration ${formatDuration(summary.durationMs)}`}>
          {formatDuration(summary.durationMs)}
        </span>
      </div>
      <div className="galleryCardBody">
        <p className="galleryCardName" title={summary.name}>{summary.name}</p>
        <p className="galleryCardMeta">{formatRelativeTime(summary.modifiedAt)}</p>
      </div>
    </button>
  );
}

export const GRID_VIEW: LibraryView = {
  id: 'grid',
  label: 'Grid',
  iconName: 'frame',
  render: (props) => <GridView {...props} />,
  supportsSizeSlider: true,
  supportsDateGrouping: true,
};
