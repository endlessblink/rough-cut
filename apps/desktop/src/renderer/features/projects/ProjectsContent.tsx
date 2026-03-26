import { ProjectsHero } from './ProjectsHero.js';
import { RecentProjectsSection } from './RecentProjectsSection.js';

interface ProjectsContentProps {
  onNewProject: () => void;
  onOpenProject: () => void;
}

export function ProjectsContent({ onNewProject, onOpenProject }: ProjectsContentProps) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '80px 64px 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
      }}
    >
      {/* Inner constrained column */}
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 64,
        }}
      >
        <ProjectsHero onNewProject={onNewProject} onOpenProject={onOpenProject} />
        <RecentProjectsSection />
      </div>
    </div>
  );
}
