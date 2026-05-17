import React from 'react';

export function BulkActionBar({
  count,
  singleSelectedName,
  singleSelectedPath,
  containsOpenProject,
  busy,
  error,
  onRename,
  onDelete,
  onCancel,
  onInvert,
  onReveal,
  onCopyPaths,
  onDuplicate,
}: {
  count: number;
  singleSelectedName: string | null;
  singleSelectedPath: string | null;
  containsOpenProject: boolean;
  busy: boolean;
  error: string | null;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onCancel: () => void;
  onInvert: () => void;
  onReveal: () => void;
  onCopyPaths: () => void;
  onDuplicate: () => void;
}) {
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);

  // When the rename input is opened or the underlying single-selection name
  // changes, prime the input with the current name + select-all for fast
  // overwrite.
  React.useEffect(() => {
    if (!renameOpen) return;
    setRenameValue(singleSelectedName ?? '');
    const id = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [renameOpen, singleSelectedName]);

  // Closing the rename input when selection collapses keeps the bar tidy.
  React.useEffect(() => {
    if (count !== 1 && renameOpen) setRenameOpen(false);
  }, [count, renameOpen]);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === singleSelectedName) {
      setRenameOpen(false);
      return;
    }
    onRename(trimmed);
    setRenameOpen(false);
  }

  // Rename and Delete are now both safe on the currently-open project — the
  // shell pauses autosave during rename and atomically closes-then-deletes.
  // The `containsOpenProject` flag is still used for a soft hint in the bar.
  const renameDisabled = count !== 1 || busy;
  const deleteDisabled = busy;
  const singleOnlyDisabled = count !== 1 || busy;
  const duplicateDisabled = count !== 1 || busy;

  return (
    <div className="bulkActionBar" data-ui-region="library-bulk-bar" aria-live="polite">
      <span className="bulkActionCount">
        {count} selected
      </span>
      {containsOpenProject ? (
        <span className="bulkActionWarning" title="Renaming the open project re-binds its editor automatically. Deleting it closes the editor first.">
          Includes the open project
        </span>
      ) : null}
      <div className="bulkActionGroup">
        {renameOpen ? (
          <form
            className="bulkRenameForm"
            onSubmit={(event) => { event.preventDefault(); commitRename(); }}
          >
            <input
              ref={renameInputRef}
              type="text"
              className="bulkRenameInput"
              value={renameValue}
              maxLength={120}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setRenameOpen(false);
                }
              }}
              aria-label="New project name"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="submit" className="bulkActionPrimary" disabled={busy || !renameValue.trim()}>Save</button>
            <button type="button" className="bulkActionSecondary" onClick={() => setRenameOpen(false)} disabled={busy}>Cancel</button>
          </form>
        ) : (
          <>
            <button
              type="button"
              className="bulkActionSecondary"
              onClick={() => setRenameOpen(true)}
              disabled={renameDisabled}
              title={count !== 1 ? 'Select a single project to rename' : 'Rename selected project'}
            >
              Rename
            </button>
            <button
              type="button"
              className="bulkActionSecondary"
              onClick={onDuplicate}
              disabled={duplicateDisabled}
              title={count !== 1 ? 'Select a single project to duplicate' : 'Duplicate to a new file'}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="bulkActionSecondary"
              onClick={onReveal}
              disabled={singleOnlyDisabled || !singleSelectedPath}
              title={count !== 1 ? 'Select a single project to reveal' : 'Show in file manager'}
            >
              Reveal
            </button>
            <button
              type="button"
              className="bulkActionSecondary"
              onClick={onCopyPaths}
              disabled={busy}
              title="Copy selected paths to clipboard"
            >
              Copy paths
            </button>
            <button
              type="button"
              className="bulkActionGhost"
              onClick={onInvert}
              disabled={busy}
              title="Invert selection"
            >
              Invert
            </button>
            <button
              type="button"
              className="bulkActionDanger"
              onClick={onDelete}
              disabled={deleteDisabled}
              title={containsOpenProject ? 'Will close the open project, then delete' : 'Delete selected projects'}
            >
              Delete
            </button>
            <button type="button" className="bulkActionGhost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          </>
        )}
      </div>
      {error ? <span className="bulkActionError" role="alert">{error}</span> : null}
    </div>
  );
}
