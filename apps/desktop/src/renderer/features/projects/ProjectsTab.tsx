import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { ProjectsScreenLayout } from './ProjectsScreenLayout.js';
import { ProjectsContent } from './ProjectsContent.js';

interface ProjectsTabProps {
  activeTab: AppView;
  onTabChange: (tab: AppView) => void;
  onNewProject: () => Promise<void>;
  onOpenProject: () => Promise<boolean>;
}

export function ProjectsTab({
  activeTab,
  onTabChange,
  onNewProject,
  onOpenProject,
}: ProjectsTabProps) {
  async function handleNew() {
    await onNewProject();
    onTabChange('record');
  }

  async function handleOpen() {
    const loaded = await onOpenProject();
    if (loaded) {
      onTabChange('edit');
    }
  }

  return (
    <ProjectsScreenLayout>
      <AppHeader activeTab={activeTab} onTabChange={onTabChange} />
      <ProjectsContent onNewProject={handleNew} onOpenProject={handleOpen} />
    </ProjectsScreenLayout>
  );
}
