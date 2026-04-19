import { ProjectsHero } from './ProjectsHero.js';
import { StorageSection } from './StorageSection.js';
import { RecentProjectsSection } from './RecentProjectsSection.js';
import { AboutCreditsCard } from './AboutCreditsCard.js';
import type { RecentProjectEntry } from './types.js';

interface ProjectsContentProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  recentProjects: RecentProjectEntry[];
  isLoading: boolean;
  onOpenPath: (filePath: string) => void;
  onRemove: (filePath: string) => void;
  onRefresh: () => void;
}

export function ProjectsContent({
  onNewProject,
  onOpenProject,
  recentProjects,
  isLoading,
  onOpenPath,
  onRemove,
  onRefresh,
}: ProjectsContentProps) {
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
        <StorageSection />
        <RecentProjectsSection
          projects={recentProjects}
          isLoading={isLoading}
          onOpen={onOpenPath}
          onRemove={onRemove}
          onRefresh={onRefresh}
        />
        <AboutCreditsCard />
      </div>
    </div>
  );
}
