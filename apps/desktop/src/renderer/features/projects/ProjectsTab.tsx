import { useState, useEffect } from 'react';
import type { ProjectDocument } from '@rough-cut/project-model';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { projectStore, transportStore } from '../../hooks/use-stores.js';
import { ProjectsScreenLayout } from './ProjectsScreenLayout.js';
import { ProjectsContent } from './ProjectsContent.js';
import { ProjectDetailView } from './ProjectDetailView.js';
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
  const [selectedProject, setSelectedProject] = useState<{ project: ProjectDocument; filePath: string } | null>(null);

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

  // Click a project card → load and show detail view
  async function handleOpenPath(filePath: string) {
    try {
      const project = await window.roughcut.projectOpenPath(filePath);
      setSelectedProject({ project: project as ProjectDocument, filePath });
    } catch (err) {
      console.error('[ProjectsTab] Failed to load project:', err);
    }
  }

  // User picked a recording and chose Recorder or Editor
  function handleOpenRecording(assetId: string, destination: 'record' | 'edit') {
    if (!selectedProject) return;
    const { project, filePath } = selectedProject;

    // Load project into store
    projectStore.getState().setProject(project);
    projectStore.getState().setProjectFilePath(filePath);

    // Find the clip that references this asset and seek to it
    const clip = project.composition.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.assetId === assetId);
    if (clip) {
      transportStore.getState().seekToFrame(clip.timelineIn);
    } else {
      transportStore.getState().seekToFrame(0);
    }

    onTabChange(destination);
  }

  function handleBackToProjects() {
    setSelectedProject(null);
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
      {selectedProject ? (
        <ProjectDetailView
          project={selectedProject.project}
          filePath={selectedProject.filePath}
          onBack={handleBackToProjects}
          onOpenRecording={handleOpenRecording}
        />
      ) : (
        <ProjectsContent
          onNewProject={handleNew}
          onOpenProject={handleOpen}
          recentProjects={recentProjects}
          isLoading={isLoading}
          onOpenPath={handleOpenPath}
          onRemove={handleRemove}
          onRefresh={handleRefresh}
        />
      )}
    </ProjectsScreenLayout>
  );
}
