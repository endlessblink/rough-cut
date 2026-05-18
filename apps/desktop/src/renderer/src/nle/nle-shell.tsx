import React from 'react';
import { NleTimeline } from './nle-timeline';
import { AssetPanel } from './asset-panel';
import { NleProgramMonitor } from './program-monitor';
import { NleTransport } from './transport';
import { resolveProjectFps, resolveCompositionDurationFrames } from './project-shape.mjs';
import type { NleProject } from './types';

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
  const projectPath = project?.path ?? null;
  React.useEffect(() => {
    setPlayheadFrame(0);
    setIsPlaying(false);
    setSelectedClipId(null);
  }, [projectPath]);

  if (project === null) {
    return <NleEmptyState onGoToProjects={onGoToProjects} />;
  }

  const fps = resolveProjectFps(project);
  const durationFrames = resolveCompositionDurationFrames(project);
  const clampedPlayhead = Math.max(0, Math.min(durationFrames, playheadFrame));

  return (
    <section className="nleShell" data-ui-region="nle-workspace" aria-label="NLE editor">
      <header className="nleHeader">
        <p className="eyebrow">Editor</p>
        <h2 className="nleHeaderTitle">{project.document.name || 'Untitled project'}</h2>
      </header>
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
          />
          <NleTimeline
            project={project}
            playheadFrame={clampedPlayhead}
            durationFrames={durationFrames}
            selectedClipId={selectedClipId}
            onPlayheadFrameChange={setPlayheadFrame}
            onSelectedClipChange={setSelectedClipId}
            onProjectChange={onProjectChange}
          />
        </div>
        <AssetPanel project={project} />
      </div>
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
