import type { LibraryView, LibraryViewProps, ProjectSummary } from './types';
import { formatDuration, formatRelativeTime } from './format';
import { CardCheckbox } from './checkbox-chip';

function ListView({ summaries, selection, onCardClick, onToggleSelected, onCardContextMenu }: LibraryViewProps) {
  return (
    <div className="galleryList" role="list">
      <div className="galleryListHeader" aria-hidden="true">
        <span className="galleryListColCheck" />
        <span className="galleryListColThumb" />
        <span className="galleryListColName">Project</span>
        <span className="galleryListColRes">Resolution</span>
        <span className="galleryListColDuration">Duration</span>
        <span className="galleryListColCam">Camera</span>
        <span className="galleryListColDate">Modified</span>
      </div>
      {summaries.map((summary) => (
        <ListRow
          key={summary.path}
          summary={summary}
          selected={selection.has(summary.path)}
          onCardClick={onCardClick}
          onToggleSelected={onToggleSelected}
          onCardContextMenu={onCardContextMenu}
        />
      ))}
    </div>
  );
}

function ListRow({ summary, selected, onCardClick, onToggleSelected, onCardContextMenu }: {
  summary: ProjectSummary;
  selected: boolean;
  onCardClick: (path: string, event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => void;
  onToggleSelected: (path: string) => void;
  onCardContextMenu: (path: string, x: number, y: number) => void;
}) {
  return (
    <button
      type="button"
      role="listitem"
      className={`galleryRow ${selected ? 'isSelected' : ''}`}
      onClick={(event) => onCardClick(summary.path, { metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey })}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCardContextMenu(summary.path, event.clientX, event.clientY);
      }}
      aria-pressed={selected}
      data-gallery-row={summary.path}
      data-has-camera={summary.hasCamera ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
    >
      <span className="galleryRowCheck">
        <CardCheckbox
          checked={selected}
          label={`Select ${summary.name}`}
          onChange={() => onToggleSelected(summary.path)}
        />
      </span>
      <span className="galleryRowThumb" aria-hidden="true">
        {summary.thumbnailUrl ? (
          <img src={summary.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <span className="galleryRowThumbPlaceholder" />
        )}
      </span>
      <span className="galleryRowName" title={summary.name}>{summary.name}</span>
      <span className="galleryRowRes">{summary.resolutionLabel ?? '—'}</span>
      <span className="galleryRowDuration">{formatDuration(summary.durationMs)}</span>
      <span className="galleryRowCam">{summary.hasCamera ? 'Cam' : '—'}</span>
      <span className="galleryRowDate">{formatRelativeTime(summary.modifiedAt)}</span>
    </button>
  );
}

export const LIST_VIEW: LibraryView = {
  id: 'list',
  label: 'List',
  iconName: 'timeline',
  render: (props) => <ListView {...props} />,
  supportsSizeSlider: false,
  supportsDateGrouping: true,
};
