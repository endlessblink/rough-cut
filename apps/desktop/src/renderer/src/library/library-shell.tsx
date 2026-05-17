import React from 'react';
import type { LibraryView, LibraryViewId, ProjectSummary, SizeStep } from './types';
import { DEFAULT_VIEW_ID, LIBRARY_VIEWS, findView } from './views';
import { groupSummariesByDate } from './group-by-date.mjs';
import { clearSelection, resolveClickIntent, selectAll, selectRange, toggleSelection } from './selection.mjs';
import { BulkActionBar } from './bulk-action-bar';
import { DeleteConfirm } from './delete-confirm';
import { SelectModeToggle } from './select-mode-toggle';
import { FilterToSelect } from './filter-to-select';
import { ContextMenu } from './context-menu';
import { resolveContextTargets } from './context-targets.mjs';

const SIZE_STEPS: ReadonlyArray<SizeStep> = ['S', 'M', 'L'];

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summaries: ProjectSummary[] };

type ProjectStateLike = {
  path: string;
  document: unknown;
  recording: unknown;
  mediaUrl: string | null;
  cameraMediaUrl?: string | null;
};

export function LibraryShell({
  onOpenProjectByPath,
  onOpenProjectDialog,
  openProjectPath,
  onRenameInFlight,
  onCloseOpenProject,
  onProjectRenamed,
}: {
  onOpenProjectByPath: (path: string) => void;
  onOpenProjectDialog: () => void;
  // Path of the currently-loaded project (or null). Used to atomically close
  // the open project when it's deleted, and to swap the editor's state when
  // it's renamed.
  openProjectPath: string | null;
  // Flips the rename-in-flight gate in App so autosave + explicit saves pause
  // for the ~200ms rename window.
  onRenameInFlight: (flag: boolean) => void;
  // Called by confirmDelete just before the IPC fires when the delete set
  // contains the currently-open project. App nulls the project state and
  // switches to the projects view.
  onCloseOpenProject: () => void;
  // Called after a successful rename so App can swap React state if it's the
  // open project. Receives old path + the new ProjectState from the IPC.
  onProjectRenamed: (oldPath: string, updated: ProjectStateLike) => void;
}) {
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [viewId, setViewId] = React.useState<LibraryViewId>(DEFAULT_VIEW_ID);
  const [sizeStep, setSizeStep] = React.useState<SizeStep>('M');
  const [selection, setSelection] = React.useState<Set<string>>(() => new Set());
  const [anchorPath, setAnchorPath] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [selectMode, setSelectMode] = React.useState(false);
  const [contextMenuState, setContextMenuState] = React.useState<{ x: number; y: number; targetPath: string } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ProjectSummary[] | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const activeView = findView(viewId);

  React.useEffect(() => {
    let cancelled = false;
    window.roughCut.listRecentProjects()
      .then((summaries) => {
        if (cancelled) return;
        setState({ status: 'ready', summaries: Array.isArray(summaries) ? summaries : [] });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', message });
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Drop selection when the underlying list changes — stale entries would
  // confuse the bulk bar.
  const summariesKey = state.status === 'ready' ? state.summaries.map((s) => s.path).join('|') : '';
  React.useEffect(() => {
    if (selection.size === 0) return;
    if (state.status !== 'ready') return;
    const valid = new Set(state.summaries.map((s) => s.path));
    const pruned = new Set(Array.from(selection).filter((p) => valid.has(p)));
    if (pruned.size !== selection.size) setSelection(pruned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summariesKey]);

  const orderedPaths = state.status === 'ready' ? state.summaries.map((s) => s.path) : [];

  const handleCardClick = React.useCallback((path: string, event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    const intent = resolveClickIntent({ selection, summaryPath: path, selectMode, ...event });
    if (intent.kind === 'toggle') {
      setSelection((prev) => toggleSelection(prev, path));
      setAnchorPath(path);
      return;
    }
    if (intent.kind === 'range') {
      setSelection((prev) => selectRange(prev, orderedPaths, anchorPath, path));
      return;
    }
    if (intent.kind === 'clear-and-open') {
      setSelection(clearSelection());
      setAnchorPath(null);
    }
    onOpenProjectByPath(path);
  }, [selection, selectMode, anchorPath, orderedPaths, onOpenProjectByPath]);

  // Explicit checkbox toggle from a card's <CardCheckbox>. Bypasses
  // modifier/selectMode/intent resolution — always a pure add-or-remove.
  const handleToggleSelected = React.useCallback((path: string) => {
    setSelection((prev) => toggleSelection(prev, path));
    setAnchorPath(path);
  }, []);

  const triggerRefresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  // Right-click on a card. Does NOT touch the selection. The menu's targets
  // are computed at action time via getContextTargets(): if the right-clicked
  // card is part of an active selection, the action operates on the whole
  // selection; otherwise it operates on just that one card (Finder pattern,
  // without the auto-replace-selection step).
  const handleCardContextMenu = React.useCallback((path: string, x: number, y: number) => {
    setContextMenuState({ x, y, targetPath: path });
  }, []);

  const getContextTargets = React.useCallback((targetPath: string): ProjectSummary[] => {
    return resolveContextTargets({
      summaries: state.status === 'ready' ? state.summaries : [],
      selection,
      targetPath,
    });
  }, [state, selection]);

  const handleContextDelete = React.useCallback((targetPath: string) => {
    const targets = getContextTargets(targetPath);
    if (targets.length === 0) return;
    setPendingDelete(targets);
  }, [getContextTargets]);

  const handleContextCopyPaths = React.useCallback(async (targetPath: string) => {
    const targets = getContextTargets(targetPath);
    if (targets.length === 0) return;
    try {
      await navigator.clipboard.writeText(targets.map((s) => s.path).join('\n'));
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    }
  }, [getContextTargets]);

  const handleContextReveal = React.useCallback((targetPath: string) => {
    const targets = getContextTargets(targetPath);
    if (targets.length !== 1) return;
    const target = targets[0];
    if (!target) return;
    window.roughCut.showItemInFolder(target.path).catch((err: unknown) => {
      setBulkError(err instanceof Error ? err.message : String(err));
    });
  }, [getContextTargets]);

  const handleContextDuplicate = React.useCallback(async (targetPath: string) => {
    const targets = getContextTargets(targetPath);
    if (targets.length !== 1) return;
    const target = targets[0];
    if (!target) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      await window.roughCut.duplicateProject({ path: target.path });
      triggerRefresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }, [getContextTargets, triggerRefresh]);

  const handleGroupSelectAll = React.useCallback((items: ReadonlyArray<ProjectSummary>) => {
    setSelection((prev) => {
      const next = new Set(prev);
      for (const item of items) next.add(item.path);
      return next;
    });
  }, []);

  // Esc clears, Cmd/Ctrl+A selects all visible. Only active when the library
  // is mounted (and not inside an input — focused inputs swallow Esc/A on
  // their own).
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (event.key === 'Escape' && (selection.size > 0 || selectMode)) {
        event.preventDefault();
        setSelection(clearSelection());
        setAnchorPath(null);
        setSelectMode(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && orderedPaths.length > 0) {
        event.preventDefault();
        setSelection(selectAll(orderedPaths));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.size, orderedPaths]);

  const selectedSummaries = React.useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.summaries.filter((s) => selection.has(s.path));
  }, [state, selection]);

  const containsOpenProject = openProjectPath !== null && selection.has(openProjectPath);

  const handleRename = React.useCallback(async (newName: string) => {
    if (selection.size !== 1) return;
    const path = Array.from(selection)[0];
    if (!path) return;
    setBulkBusy(true);
    setBulkError(null);
    // Flip the rename-in-flight gate BEFORE the IPC so any pending autosave
    // or explicit save short-circuits via saveProjectGuarded for the window.
    onRenameInFlight(true);
    try {
      const updated = await window.roughCut.renameProject({ path, name: newName, openProjectPath });
      // If the renamed project is the currently-open one, swap App's
      // project state so the editor's autosave useEffect re-binds to the
      // new path on the next render.
      if (path === openProjectPath) {
        onProjectRenamed(path, updated);
      }
      setSelection(clearSelection());
      setAnchorPath(null);
      triggerRefresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      onRenameInFlight(false);
      setBulkBusy(false);
    }
  }, [selection, openProjectPath, triggerRefresh, onRenameInFlight, onProjectRenamed]);

  const handleDelete = React.useCallback(async () => {
    if (selectedSummaries.length === 0) return;
    setPendingDelete(selectedSummaries);
  }, [selectedSummaries]);

  const handleAddMany = React.useCallback((paths: ReadonlyArray<string>) => {
    setSelection((prev) => {
      const next = new Set(prev);
      for (const path of paths) next.add(path);
      return next;
    });
  }, []);

  const handleInvert = React.useCallback(() => {
    if (state.status !== 'ready') return;
    const all = new Set(state.summaries.map((s) => s.path));
    const inverted = new Set<string>();
    for (const path of all) if (!selection.has(path)) inverted.add(path);
    setSelection(inverted);
    setAnchorPath(null);
  }, [state, selection]);

  const handleReveal = React.useCallback(() => {
    if (selectedSummaries.length !== 1) return;
    const target = selectedSummaries[0];
    if (!target) return;
    window.roughCut.showItemInFolder(target.path).catch((err: unknown) => {
      setBulkError(err instanceof Error ? err.message : String(err));
    });
  }, [selectedSummaries]);

  const handleCopyPaths = React.useCallback(async () => {
    if (selectedSummaries.length === 0) return;
    const text = selectedSummaries.map((s) => s.path).join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedSummaries]);

  const handleDuplicate = React.useCallback(async () => {
    if (selectedSummaries.length !== 1) return;
    const target = selectedSummaries[0];
    if (!target) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      await window.roughCut.duplicateProject({ path: target.path });
      setSelection(clearSelection());
      setAnchorPath(null);
      triggerRefresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }, [selectedSummaries, triggerRefresh]);

  const confirmDelete = React.useCallback(async () => {
    if (!pendingDelete) return;
    setBulkBusy(true);
    setBulkError(null);
    // If the delete set includes the currently-open project, close it FIRST.
    // Otherwise the editor would hold a stale ProjectState pointing at a
    // .roughcut that no longer exists on disk.
    const includesOpen = openProjectPath !== null && pendingDelete.some((s) => s.path === openProjectPath);
    if (includesOpen) onCloseOpenProject();
    try {
      const result = await window.roughCut.removeRecentProjects({
        paths: pendingDelete.map((s) => s.path),
        // Now that we've closed the open project (if any) before this call,
        // pass null so the server-side OPEN_PROJECT_LOCKED guard doesn't
        // reject a delete that's already safe to perform.
        openProjectPath: includesOpen ? null : openProjectPath,
      });
      if (result.failed.length > 0) {
        setBulkError(`${result.failed.length} failed: ${result.failed.map((f) => f.error).join('; ')}`);
      }
      setSelection(clearSelection());
      setAnchorPath(null);
      setPendingDelete(null);
      triggerRefresh();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  }, [pendingDelete, openProjectPath, triggerRefresh, onCloseOpenProject]);

  const viewProps = {
    sizeStep,
    onOpen: onOpenProjectByPath,
    selection,
    hoverScrubEnabled: selection.size === 0 && !selectMode,
    onCardClick: handleCardClick,
    onToggleSelected: handleToggleSelected,
    onCardContextMenu: handleCardContextMenu,
  };

  return (
    <section className="libraryShell" aria-label="Project library" data-ui-region="project-library">
      <header className="libraryHeader">
        <div className="libraryHeaderTitle">
          <p className="eyebrow">Projects</p>
          <h2>{summaryCountLabel(state)}</h2>
        </div>
        <div className="libraryHeaderControls">
          <ViewSwitcher activeId={viewId} onChange={setViewId} />
          {activeView.supportsSizeSlider ? (
            <SizeSwitcher value={sizeStep} onChange={setSizeStep} />
          ) : null}
          <SelectModeToggle active={selectMode} onToggle={() => setSelectMode((on) => !on)} />
          <button type="button" className="libraryOpenFile" onClick={onOpenProjectDialog}>Open file…</button>
        </div>
      </header>
      <FilterToSelect
        summaries={state.status === 'ready' ? state.summaries : []}
        onAddMany={handleAddMany}
      />
      {selection.size > 0 ? (
        <BulkActionBar
          count={selection.size}
          containsOpenProject={containsOpenProject}
          singleSelectedName={selection.size === 1 ? (selectedSummaries[0]?.name ?? '') : null}
          singleSelectedPath={selection.size === 1 ? (selectedSummaries[0]?.path ?? null) : null}
          busy={bulkBusy}
          error={bulkError}
          onRename={handleRename}
          onDelete={handleDelete}
          onInvert={handleInvert}
          onReveal={handleReveal}
          onCopyPaths={handleCopyPaths}
          onDuplicate={handleDuplicate}
          onCancel={() => { setSelection(clearSelection()); setAnchorPath(null); setBulkError(null); }}
        />
      ) : null}
      <div className="libraryBody">
        {state.status === 'loading' ? <LibraryEmptyState eyebrow="Loading" body="Scanning your recordings…" /> : null}
        {state.status === 'error' ? <LibraryEmptyState eyebrow="Couldn’t load projects" body={state.message} tone="error" /> : null}
        {state.status === 'ready' && state.summaries.length === 0 ? (
          <LibraryEmptyState eyebrow="No projects yet" body="Record a take and it will appear here." />
        ) : null}
        {state.status === 'ready' && state.summaries.length > 0 ? (
          <LibraryViewport view={activeView} summaries={state.summaries} viewProps={viewProps} onGroupSelectAll={handleGroupSelectAll} />
        ) : null}
      </div>
      {pendingDelete ? (
        <DeleteConfirm
          summaries={pendingDelete}
          busy={bulkBusy}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
      {contextMenuState ? (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          onClose={() => setContextMenuState(null)}
          items={(() => {
            const targetPath = contextMenuState.targetPath;
            const targets = getContextTargets(targetPath);
            const count = targets.length;
            const target = targets[0] ?? null;
            // Single-target-only actions (open / duplicate / reveal) are
            // disabled when the resolved target set is more than one.
            const singleOnly = count !== 1;
            const copyLabel = count > 1 ? `Copy ${count} paths` : 'Copy path';
            const deleteLabel = count > 1 ? `Delete ${count}` : 'Delete';
            // Note: Rename is intentionally not in the context menu — it
            // requires the bulk bar's controlled input. Use the bar.
            return [
              { id: 'open', label: 'Open', disabled: singleOnly || !target, onSelect: () => target && onOpenProjectByPath(target.path) },
              { id: 'duplicate', label: 'Duplicate', disabled: singleOnly, onSelect: () => handleContextDuplicate(targetPath) },
              { id: 'reveal', label: 'Reveal in folder', disabled: singleOnly, onSelect: () => handleContextReveal(targetPath) },
              { id: 'copy', label: copyLabel, disabled: count === 0, onSelect: () => handleContextCopyPaths(targetPath) },
              { id: 'delete', label: deleteLabel, danger: true, disabled: count === 0, onSelect: () => handleContextDelete(targetPath) },
            ];
          })()}
        />
      ) : null}
    </section>
  );
}

function summaryCountLabel(state: LoadState): string {
  if (state.status !== 'ready') return 'Pick a recording to open';
  const n = state.summaries.length;
  if (n === 0) return 'No projects yet';
  return `${n} recording${n === 1 ? '' : 's'}`;
}

function LibraryEmptyState({ eyebrow, body, tone }: { eyebrow: string; body: string; tone?: 'error' }) {
  return (
    <div className={`libraryEmptyState ${tone === 'error' ? 'libraryEmptyError' : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <p className="eyebrow">{eyebrow}</p>
      <p>{body}</p>
    </div>
  );
}

type SharedViewProps = {
  sizeStep: SizeStep;
  onOpen: (path: string) => void;
  selection: ReadonlySet<string>;
  hoverScrubEnabled: boolean;
  onCardClick: (path: string, event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => void;
  onToggleSelected: (path: string) => void;
  onCardContextMenu: (path: string, x: number, y: number) => void;
};

function LibraryViewport({ view, summaries, viewProps, onGroupSelectAll }: { view: LibraryView; summaries: ProjectSummary[]; viewProps: SharedViewProps; onGroupSelectAll: (items: ReadonlyArray<ProjectSummary>) => void }) {
  if (!view.supportsDateGrouping) {
    return <>{view.render({ summaries, ...viewProps })}</>;
  }
  const groups = groupSummariesByDate(summaries);
  return (
    <>
      {groups.map((group) => (
        <section key={group.id} className="libraryGroup" data-library-group={group.id}>
          <header className="libraryGroupHeader">
            <h3>{group.label}</h3>
            <span className="libraryGroupCount">{group.items.length}</span>
            <button
              type="button"
              className="libraryGroupSelectAll"
              onClick={() => onGroupSelectAll(group.items)}
              title={`Select all ${group.items.length} in ${group.label}`}
            >
              Select all
            </button>
          </header>
          {view.render({ summaries: group.items, ...viewProps })}
        </section>
      ))}
    </>
  );
}

function ViewSwitcher({ activeId, onChange }: { activeId: LibraryViewId; onChange: (id: LibraryViewId) => void }) {
  return (
    <div className="libraryViewSwitcher" role="group" aria-label="View">
      {LIBRARY_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={`libraryViewChip ${view.id === activeId ? 'active' : ''}`}
          onClick={() => onChange(view.id)}
          aria-pressed={view.id === activeId}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

function SizeSwitcher({ value, onChange }: { value: SizeStep; onChange: (step: SizeStep) => void }) {
  return (
    <div className="librarySizeSwitcher" role="group" aria-label="Card size">
      {SIZE_STEPS.map((step) => (
        <button
          key={step}
          type="button"
          className={`librarySizeChip ${step === value ? 'active' : ''}`}
          onClick={() => onChange(step)}
          aria-pressed={step === value}
        >
          {step}
        </button>
      ))}
    </div>
  );
}
