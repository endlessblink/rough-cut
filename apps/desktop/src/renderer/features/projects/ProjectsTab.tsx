import { useState, useEffect } from 'react';
import type { ProjectDocument } from '@rough-cut/project-model';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { projectStore, transportStore } from '../../hooks/use-stores.js';
import { ProjectsScreenLayout } from './ProjectsScreenLayout.js';
import { ProjectsContent } from './ProjectsContent.js';
import type { RecentProjectEntry } from './types.js';

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
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (activeTab !== 'projects') return;
    setIsLoading(true);
    window.roughcut.recentProjectsGet()
      .then(setRecentProjects)
      .catch(() => setRecentProjects([]))
      .finally(() => setIsLoading(false));
  }, [activeTab]);

  async function handleNew() {
    await onNewProject();
    projectStore.getState().setProjectFilePath(null);
    onTabChange('record');
  }

  async function handleOpen() {
    const loaded = await onOpenProject();
    if (loaded) {
      onTabChange('edit');
    }
  }

  async function handleOpenPath(filePath: string) {
    const project = await window.roughcut.projectOpenPath(filePath);
    projectStore.getState().setProject(project as ProjectDocument);
    projectStore.getState().setProjectFilePath(filePath);
    transportStore.getState().seekToFrame(0);
    onTabChange('edit');
  }

  async function handleRemove(filePath: string) {
    await window.roughcut.recentProjectsRemove(filePath);
    setRecentProjects((prev) => prev.filter((p) => p.filePath !== filePath));
  }

  function handleRefresh() {
    setIsLoading(true);
    window.roughcut.recentProjectsGet()
      .then(setRecentProjects)
      .catch(() => setRecentProjects([]))
      .finally(() => setIsLoading(false));
  }

  return (
    <ProjectsScreenLayout>
      <AppHeader activeTab={activeTab} onTabChange={onTabChange} />
      <ProjectsContent
        onNewProject={handleNew}
        onOpenProject={handleOpen}
        recentProjects={recentProjects}
        isLoading={isLoading}
        onOpenPath={handleOpenPath}
        onRemove={handleRemove}
        onRefresh={handleRefresh}
      />
    </ProjectsScreenLayout>
  );
}
