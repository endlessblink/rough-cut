import React from 'react';
import type { ProjectSummary } from './types';

export function DeleteConfirm({ summaries, busy, onCancel, onConfirm }: {
  summaries: ReadonlyArray<ProjectSummary>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    // Esc to cancel — works only while the dialog is mounted.
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKey);
    cancelButtonRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const count = summaries.length;
  const heading = count === 1 ? 'Delete this project?' : `Delete ${count} projects?`;

  return (
    <div className="deleteConfirmBackdrop" role="dialog" aria-modal="true" aria-labelledby="deleteConfirmHeading" onClick={busy ? undefined : onCancel}>
      <div
        ref={dialogRef}
        className="deleteConfirmDialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="deleteConfirmHeading" className="deleteConfirmHeading">{heading}</h2>
        <p className="deleteConfirmBody">
          This will remove the project file and its associated recording, camera, and thumbnail files from disk. This cannot be undone.
        </p>
        <ul className="deleteConfirmList" aria-label="Projects to delete">
          {summaries.slice(0, 8).map((summary) => (
            <li key={summary.path} title={summary.path}>{summary.name}</li>
          ))}
          {summaries.length > 8 ? (
            <li className="deleteConfirmMore">…and {summaries.length - 8} more</li>
          ) : null}
        </ul>
        <div className="deleteConfirmActions">
          <button
            type="button"
            ref={cancelButtonRef}
            className="bulkActionSecondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bulkActionDanger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Deleting…' : `Delete ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}
