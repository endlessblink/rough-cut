import { NleTimeline } from './nle-timeline';
import { AssetPanel } from './asset-panel';
import type { NleProject } from './types';

export function NleShell({
  project,
  onGoToProjects,
}: {
  project: NleProject | null;
  // Reserved for future use — NLE writes go through this once transcript
  // editor + clip mutations land (TASK-176 wires it; TASK-132+ uses it).
  onProjectChange?: (next: NleProject) => void;
  onGoToProjects: () => void;
}) {
  if (project === null) {
    return <NleEmptyState onGoToProjects={onGoToProjects} />;
  }

  return (
    <section className="nleShell" data-ui-region="nle-workspace" aria-label="NLE editor">
      <header className="nleHeader">
        <p className="eyebrow">Editor</p>
        <h2 className="nleHeaderTitle">{project.document.name || 'Untitled project'}</h2>
      </header>
      <div className="nleBody">
        <NleTimeline />
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
