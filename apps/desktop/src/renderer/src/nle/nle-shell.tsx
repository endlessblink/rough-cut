import React from 'react';
import { NleTimeline } from './nle-timeline';
import { AssetPanel } from './asset-panel';
import { NleProgramMonitor } from './program-monitor';
import { NleTransport } from './transport';
import { resolveProjectFps, resolveCompositionDurationFrames } from './project-shape.mjs';
import { clampFrame, isTypingTarget } from './keyboard.mjs';
import { canSplitClipById, rightClipIdAfterSplit, splitClipById } from './clip-mutations.mjs';
import { EditorV2Layout } from '../editor-v2/editor-v2-layout';
import type { NleEditMode } from './mode-toolbar';
import type { NleProject } from './types';

const EDITOR_V2_STORAGE_KEY = 'roughCutEditorV2';

function readEditorV2Preference(): boolean {
  try {
    return window.localStorage.getItem(EDITOR_V2_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function NleShell({
  project,
  onProjectChange,
  onGoToProjects,
}: {
  project: NleProject | null;
  onProjectChange?: (next: NleProject) => void;
  onGoToProjects: () => void;
}) {
  // playheadFrame lives here, in App-adjacent state — model is source of
  // truth. The video element follows; effects below own the read/write loop.
  // Reset to 0 whenever the project changes (path key).
  const [playheadFrame, setPlayheadFrame] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [selectedClipId, setSelectedClipId] = React.useState<string | null>(null);
  const [editMode, setEditMode] = React.useState<NleEditMode>('select');
  // Editor v2 layout (TASK-237). Default ON; "Legacy" escape hatch persists.
  const [layoutV2, setLayoutV2] = React.useState<boolean>(readEditorV2Preference);
  const projectPath = project?.path ?? null;
  React.useEffect(() => {
    try {
      window.localStorage.setItem(EDITOR_V2_STORAGE_KEY, layoutV2 ? '1' : '0');
    } catch {
      // persistence is best-effort
    }
  }, [layoutV2]);
  React.useEffect(() => {
    setPlayheadFrame(0);
    setIsPlaying(false);
    setSelectedClipId(null);
    setEditMode('select');
  }, [projectPath]);

  if (project === null) {
    return <NleEmptyState onGoToProjects={onGoToProjects} />;
  }

  const fps = resolveProjectFps(project);
  const durationFrames = resolveCompositionDurationFrames(project);
  const clampedPlayhead = Math.max(0, Math.min(durationFrames, playheadFrame));
  const canSplit = selectedClipId !== null && canSplitClipById(project, selectedClipId, clampedPlayhead);
  const selectedState = selectedClipId ? 'Clip selected' : 'No clip selected';

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
  }, [isPlaying, durationFrames, fps]);

  function splitSelectedClip() {
    if (!selectedClipId || !onProjectChange) return;
    const next = splitClipById(project, selectedClipId, clampedPlayhead);
    if (next !== project) {
      onProjectChange(next as unknown as NleProject);
      setSelectedClipId(rightClipIdAfterSplit(next, selectedClipId, clampedPlayhead));
    }
  }

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === ' ') {
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
  }, [durationFrames, fps]);

  return (
    <section className="nleShell" data-ui-region="nle-workspace" aria-label="NLE editor">
      <header className="nleHeader">
        <div>
          <p className="eyebrow">Editor</p>
          <h2 className="nleHeaderTitle">{project.document.name || 'Untitled project'}</h2>
        </div>
        <div className="nleHeaderMeta" aria-label="Editor status">
          <span>{selectedState}</span>
          <span>{Math.round(clampedPlayhead)} / {Math.round(durationFrames)} frames</span>
          <span>{fps} fps</span>
          <button
            type="button"
            className="nleLayoutToggle"
            aria-pressed={!layoutV2}
            title={layoutV2 ? 'Switch to the legacy editor layout' : 'Switch to the Editor v2 layout'}
            onClick={() => setLayoutV2((value) => !value)}
          >
            {layoutV2 ? 'Legacy' : 'v2'}
          </button>
        </div>
      </header>
      {layoutV2 ? (
        <EditorV2Layout
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
          onProjectChange={onProjectChange}
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
              selectedClipId={selectedClipId}
              editMode={editMode}
              onEditModeChange={setEditMode}
              onPlayheadFrameChange={setPlayheadFrame}
              onSelectedClipChange={setSelectedClipId}
              onProjectChange={onProjectChange}
              onSplit={splitSelectedClip}
            />
          </div>
          <AssetPanel project={project} />
        </div>
      )}
    </section>
  );
}

function NleEmptyState({ onGoToProjects }: { onGoToProjects: () => void }) {
  return (
    <section className="nleEmptyState" data-ui-region="nle-empty" aria-label="NLE editor">
      <p className="eyebrow">Editor</p>
      <h2>No project open</h2>
      <p>Open a project from Projects, or start a blank one to begin editing.</p>
      <button type="button" className="primaryAction" onClick={onGoToProjects}>
        Go to Projects
      </button>
    </section>
  );
}
