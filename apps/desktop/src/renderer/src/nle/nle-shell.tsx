import React from 'react';
import { ArrowClockwise, ArrowCounterClockwise } from '@phosphor-icons/react';
import { NleTimeline } from './nle-timeline';
import { AssetPanel } from './asset-panel';
import { NleProgramMonitor } from './program-monitor';
import { NleTransport } from './transport';
import { resolveProjectFps, resolveCompositionDurationFrames } from './project-shape.mjs';
import { clampFrame, isTypingTarget } from './keyboard.mjs';
import { canSplitClipById, rightClipIdAfterSplit, splitClipById } from './clip-mutations.mjs';
import { EditorV2Layout } from '../editor-v2/editor-v2-layout';
import { EMPTY_EDIT_HISTORY, recordEdit, redoEdit, undoEdit } from '../edit-history.mjs';
import type { NleEditMode } from './mode-toolbar';
import type { NleProject } from './types';

const EDITOR_V2_STORAGE_KEY = 'roughCutEditorV2';

type NleProjectChangeOptions = {
  history?: boolean;
  previous?: NleProject | null;
};

type NleEditHistory = {
  undo: NleProject[];
  redo: NleProject[];
};

function readEditorV2Preference(): boolean {
  try {
    return window.localStorage.getItem(EDITOR_V2_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function NleShell({
  project,
  playheadFrame: controlledPlayheadFrame,
  onPlayheadFrameChange,
  onProjectChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onGoToProjects,
  onCreateBlankProject,
}: {
  project: NleProject | null;
  playheadFrame?: number;
  onPlayheadFrameChange?: (nextFrame: number) => void;
  onProjectChange?: (next: NleProject, options?: NleProjectChangeOptions) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onGoToProjects: () => void;
  onCreateBlankProject?: () => void;
}) {
  // The app owns playheadFrame when both Recording edit and NLE are mounted as
  // sibling tools. Keep a local fallback for standalone tests/embeds.
  const [localPlayheadFrame, setLocalPlayheadFrame] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [selectedClipId, setSelectedClipId] = React.useState<string | null>(null);
  const [editMode, setEditMode] = React.useState<NleEditMode>('select');
  const [timelineHistory, setTimelineHistory] = React.useState<NleEditHistory>(EMPTY_EDIT_HISTORY as NleEditHistory);
  // Editor v2 layout (TASK-237). Default ON; "Legacy" escape hatch persists.
  const [layoutV2, setLayoutV2] = React.useState<boolean>(readEditorV2Preference);
  const projectPath = project?.path ?? null;
  const isPlayheadControlled = controlledPlayheadFrame !== undefined;
  React.useEffect(() => {
    try {
      window.localStorage.setItem(EDITOR_V2_STORAGE_KEY, layoutV2 ? '1' : '0');
    } catch {
      // persistence is best-effort
    }
  }, [layoutV2]);
  React.useEffect(() => {
    if (!isPlayheadControlled) setLocalPlayheadFrame(0);
    setIsPlaying(false);
    setSelectedClipId(null);
    setEditMode('select');
    setTimelineHistory(EMPTY_EDIT_HISTORY as NleEditHistory);
  }, [isPlayheadControlled, projectPath]);

  if (project === null) {
    return <NleEmptyState onGoToProjects={onGoToProjects} onCreateBlankProject={onCreateBlankProject} />;
  }

  const fps = resolveProjectFps(project);
  const durationFrames = resolveCompositionDurationFrames(project);
  const playheadFrame = controlledPlayheadFrame ?? localPlayheadFrame;
  const setPlayheadFrame = React.useCallback((next: React.SetStateAction<number>) => {
    const resolved = typeof next === 'function' ? next(playheadFrame) : next;
    if (onPlayheadFrameChange) onPlayheadFrameChange(resolved);
    else setLocalPlayheadFrame(resolved);
  }, [onPlayheadFrameChange, playheadFrame]);
  const clampedPlayhead = Math.max(0, Math.min(durationFrames, playheadFrame));
  const canSplit = selectedClipId !== null && canSplitClipById(project, selectedClipId, clampedPlayhead);
  const selectedState = selectedClipId ? 'Clip selected' : 'No clip selected';
  const canUndoTimeline = timelineHistory.undo.length > 0 || canUndo;
  const canRedoTimeline = timelineHistory.redo.length > 0 || canRedo;

  function commitProjectChange(next: NleProject) {
    if (!onProjectChange || next === project) return;
    setTimelineHistory((history) => recordEdit(history, project) as NleEditHistory);
    onProjectChange(next, { history: true, previous: project });
  }

  React.useEffect(() => {
    if (!isPlaying) return undefined;
    let rafId = 0;
    let lastMs: number | null = null;

    function tick(nowMs: number) {
      if (lastMs === null) {
        lastMs = nowMs;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const deltaFrames = ((nowMs - lastMs) / 1000) * fps;
      lastMs = nowMs;
      setPlayheadFrame((frame) => {
        const next = clampFrame(frame + deltaFrames, durationFrames);
        if (next >= durationFrames) setIsPlaying(false);
        return next;
      });
      rafId = window.requestAnimationFrame(tick);
    }

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, durationFrames, fps, setPlayheadFrame]);

  function splitSelectedClip() {
    if (!selectedClipId || !onProjectChange) return;
    const next = splitClipById(project, selectedClipId, clampedPlayhead);
    if (next !== project) {
      commitProjectChange(next as unknown as NleProject);
      setSelectedClipId(rightClipIdAfterSplit(next, selectedClipId, clampedPlayhead));
    }
  }

  function requestUndo() {
    if (!onProjectChange) return;
    setIsPlaying(false);
    setSelectedClipId(null);
    const result = undoEdit(timelineHistory, project);
    if (result.snapshot) {
      setTimelineHistory(result.history as NleEditHistory);
      onProjectChange(result.snapshot, { history: false });
      return;
    }
    if (canUndo && onUndo) onUndo();
  }

  function requestRedo() {
    if (!onProjectChange) return;
    setIsPlaying(false);
    setSelectedClipId(null);
    const result = redoEdit(timelineHistory, project);
    if (result.snapshot) {
      setTimelineHistory(result.history as NleEditHistory);
      onProjectChange(result.snapshot, { history: false });
      return;
    }
    if (canRedo && onRedo) onRedo();
  }

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        e.shiftKey ? requestRedo() : requestUndo();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((playing) => !playing);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const direction = e.key === 'ArrowLeft' ? -1 : 1;
        const step = e.shiftKey ? 10 : 1;
        setPlayheadFrame((frame) => clampFrame(frame + direction * step, durationFrames));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setPlayheadFrame(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setPlayheadFrame(durationFrames);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setIsPlaying(false);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setIsPlaying(true);
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setIsPlaying(false);
        setPlayheadFrame((frame) => clampFrame(frame - Math.round(fps), durationFrames));
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setEditMode('select');
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setEditMode('trim');
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setEditMode('blade');
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [durationFrames, fps, setPlayheadFrame, canUndo, canRedo, onUndo, onRedo]);

  // TASK-228 — Ctrl+Shift+D writes a state dump next to the project so a
  // live "this is broken" moment becomes a reproducible report.
  const [debugDumpNotice, setDebugDumpNotice] = React.useState<string | null>(null);
  const saveDebugDump = React.useCallback(async () => {
    const bridge = (window as Window & { roughCut?: { saveDebugDump?: (payload: Record<string, unknown>) => Promise<{ path: string }> } }).roughCut;
    if (!bridge?.saveDebugDump || !project?.path) return;
    try {
      const result = await bridge.saveDebugDump({
        projectPath: project.path,
        dump: {
          capturedAt: new Date().toISOString(),
          playheadFrame: clampedPlayhead,
          durationFrames,
          fps,
          selectedClipId,
          editMode,
          layoutV2,
          timeline: project.document?.timeline ?? null,
          playbackDebug: (window as Window & { __roughCutTimelinePlaybackDebug?: unknown }).__roughCutTimelinePlaybackDebug ?? null,
        },
      });
      setDebugDumpNotice(result.path);
      console.info('[nle:debug-dump] saved', result.path);
      window.setTimeout(() => setDebugDumpNotice(null), 6000);
    } catch (error) {
      console.warn('[nle:debug-dump] failed', String(error));
    }
  }, [project, clampedPlayhead, durationFrames, fps, selectedClipId, editMode, layoutV2]);

  React.useEffect(() => {
    function handleDumpKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        void saveDebugDump();
      }
    }
    document.addEventListener('keydown', handleDumpKey);
    return () => document.removeEventListener('keydown', handleDumpKey);
  }, [saveDebugDump]);

  const layoutToggle = (
    <button
      type="button"
      className="nleLayoutToggle"
      aria-pressed={!layoutV2}
      title={layoutV2 ? 'Switch to the legacy editor layout' : 'Switch to the Editor v2 layout'}
      onClick={() => setLayoutV2((value) => !value)}
    >
      {layoutV2 ? 'Legacy' : 'v2'}
    </button>
  );

  const historyControls = (
    <div className="nleHistoryControls" role="group" aria-label="Timeline history">
      <button
        type="button"
        className="nleHistoryButton"
        aria-label="Undo timeline edit"
        title="Undo timeline edit"
        disabled={!canUndoTimeline}
        onClick={requestUndo}
      >
        <ArrowCounterClockwise aria-hidden="true" />
      </button>
      <button
        type="button"
        className="nleHistoryButton"
        aria-label="Redo timeline edit"
        title="Redo timeline edit"
        disabled={!canRedoTimeline}
        onClick={requestRedo}
      >
        <ArrowClockwise aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <section className="nleShell" data-ui-region="nle-workspace" aria-label="NLE editor">
      {/* v2 has no header row — the view starts at the panes (approved mockup);
          status + the layout escape hatch live in the timeline toolbar. */}
      {layoutV2 ? null : (
      <header className="nleHeader">
        <div>
          <p className="eyebrow">Editor</p>
          <h2 className="nleHeaderTitle">{project.document.name || 'Untitled project'}</h2>
        </div>
        <div className="nleHeaderMeta" aria-label="Editor status">
          <span>{selectedState}</span>
          <span>{Math.round(clampedPlayhead)} / {Math.round(durationFrames)} frames</span>
          <span>{fps} fps</span>
          {historyControls}
          {layoutToggle}
        </div>
      </header>
      )}
      {layoutV2 ? (
        <EditorV2Layout
          topbarExtras={(
            <div
              className="nleTimelineStatus"
              aria-label="Editor status"
              data-playhead-frame={Math.round(clampedPlayhead)}
              data-duration-frames={Math.round(durationFrames)}
            >
              {debugDumpNotice ? (
                <span className="nleDebugDumpNotice" title={debugDumpNotice}>Debug dump saved</span>
              ) : null}
              {historyControls}
              {layoutToggle}
            </div>
          )}
          project={project}
          playheadFrame={clampedPlayhead}
          durationFrames={durationFrames}
          fps={fps}
          isPlaying={isPlaying}
          selectedClipId={selectedClipId}
          editMode={editMode}
          canSplit={canSplit}
          onSplit={splitSelectedClip}
          onEditModeChange={setEditMode}
          onPlayheadFrameChange={setPlayheadFrame}
          onPlayingChange={setIsPlaying}
          onSelectedClipChange={setSelectedClipId}
          onProjectChange={commitProjectChange}
        />
      ) : (
        <div className="nleBody">
          <div className="nleLeftColumn">
            <NleProgramMonitor
              project={project}
              playheadFrame={clampedPlayhead}
              isPlaying={isPlaying}
              fps={fps}
              durationFrames={durationFrames}
              onPlayheadFrameChange={setPlayheadFrame}
              onPlayingChange={setIsPlaying}
            />
            <NleTransport
              playheadFrame={clampedPlayhead}
              durationFrames={durationFrames}
              fps={fps}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((v) => !v)}
              onPlayheadFrameChange={setPlayheadFrame}
              canSplit={canSplit}
              onSplit={splitSelectedClip}
            />
            <NleTimeline
              project={project}
              playheadFrame={clampedPlayhead}
              durationFrames={durationFrames}
              fps={fps}
              isPlaying={isPlaying}
              selectedClipId={selectedClipId}
              editMode={editMode}
              onEditModeChange={setEditMode}
              onPlayheadFrameChange={setPlayheadFrame}
              onSelectedClipChange={setSelectedClipId}
              onProjectChange={commitProjectChange}
              onSplit={splitSelectedClip}
            />
          </div>
          <AssetPanel project={project} />
        </div>
      )}
    </section>
  );
}

function NleEmptyState({
  onGoToProjects,
  onCreateBlankProject,
}: {
  onGoToProjects: () => void;
  onCreateBlankProject?: () => void;
}) {
  return (
    <section className="nleEmptyState" data-ui-region="nle-empty" aria-label="NLE editor">
      <p className="eyebrow">Editor</p>
      <h2>No project open</h2>
      <p>Create an empty timeline or open an existing Rough Cut project.</p>
      <div className="nleEmptyActions">
        {onCreateBlankProject ? (
          <button type="button" className="primaryAction" onClick={onCreateBlankProject}>
            New empty project
          </button>
        ) : null}
        <button type="button" className="secondary" onClick={onGoToProjects}>
          Open Projects
        </button>
      </div>
    </section>
  );
}
