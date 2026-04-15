import { useState, useEffect } from 'react';
import type { ProjectDocument } from '@rough-cut/project-model';
import { AppHeader } from '../../ui/index.js';
import type { AppView } from '../../ui/index.js';
import { projectStore, transportStore } from '../../hooks/use-stores.js';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
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
  const [selectedProject, setSelectedProject] = useState<{
    project: ProjectDocument;
    filePath: string;
  } | null>(null);

  useEffect(() => {
    if (activeTab !== 'projects') return;
    setIsLoading(true);
    window.roughcut
      .recentProjectsGet()
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
      getPlaybackManager().pause();
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

    // Build a clean timeline with ONLY the selected recording.
    // Preserve the linked camera clip when the recording has one.
    const selectedAsset = project.assets.find((a) => a.id === assetId);
    const clipDuration = selectedAsset?.duration ?? 0;
    const firstVideoTrack = project.composition.tracks.find((t) => t.type === 'video');
    const linkedCameraAssetId =
      selectedAsset && 'cameraAssetId' in selectedAsset
        ? (selectedAsset.cameraAssetId ?? null)
        : null;
    const cameraTrack = linkedCameraAssetId
      ? (project.composition.tracks.find(
          (t) =>
            t.type === 'video' &&
            t.id !== firstVideoTrack?.id &&
            t.clips.some((c) => c.assetId === linkedCameraAssetId),
        ) ??
        project.composition.tracks.find((t) => t.type === 'video' && t.id !== firstVideoTrack?.id))
      : null;

    const cleanTracks = project.composition.tracks.map((track) => {
      if (!firstVideoTrack || clipDuration <= 0) {
        return { ...track, clips: [] };
      }

      if (track.id === firstVideoTrack.id) {
        const existingClip = track.clips.find((c) => c.assetId === assetId);
        const clipId = existingClip?.id ?? `clip-${Date.now()}`;
        return {
          ...track,
          clips: [
            {
              ...(existingClip ?? {
                id: clipId,
                assetId,
                trackId: track.id,
                name: '',
                enabled: true,
                transform: {
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  anchorX: 0,
                  anchorY: 0,
                  opacity: 1,
                },
                effects: [],
                keyframes: [],
              }),
              timelineIn: 0,
              timelineOut: clipDuration,
              sourceIn: 0,
              sourceOut: clipDuration,
            },
          ],
        };
      }

      if (linkedCameraAssetId && cameraTrack && track.id === cameraTrack.id) {
        const existingCameraClip = track.clips.find((c) => c.assetId === linkedCameraAssetId);
        const cameraClipId = existingCameraClip?.id ?? `clip-${Date.now()}-camera`;
        return {
          ...track,
          clips: [
            {
              ...(existingCameraClip ?? {
                id: cameraClipId,
                assetId: linkedCameraAssetId,
                trackId: track.id,
                name: '',
                enabled: true,
                transform: {
                  x: 0.78,
                  y: 0.78,
                  scaleX: 0.2,
                  scaleY: 0.2,
                  rotation: 0,
                  anchorX: 0.5,
                  anchorY: 0.5,
                  opacity: 1,
                },
                effects: [],
                keyframes: [],
              }),
              timelineIn: 0,
              timelineOut: clipDuration,
              sourceIn: 0,
              sourceOut: clipDuration,
            },
          ],
        };
      }

      return { ...track, clips: [] };
    });

    const cleanProject = {
      ...project,
      composition: {
        ...project.composition,
        tracks: cleanTracks,
        duration: clipDuration > 0 ? clipDuration : project.composition.duration,
      },
    };

    transportStore.getState().seekToFrame(0);

    // Load clean project into store
    getPlaybackManager().pause();
    projectStore.getState().setProject(cleanProject as ProjectDocument);
    projectStore.getState().setProjectFilePath(filePath);
    projectStore.getState().setActiveAssetId(assetId);

    onTabChange(destination);
  }

  function handleNewRecording() {
    if (!selectedProject) return;
    const { project, filePath } = selectedProject;

    // Load the FULL project into store (not a stripped version)
    transportStore.getState().seekToFrame(0);
    getPlaybackManager().pause();
    projectStore.getState().setProject(project as ProjectDocument);
    projectStore.getState().setProjectFilePath(filePath);

    onTabChange('record');
  }

  function handleBackToProjects() {
    setSelectedProject(null);
  }

  // Delete a recording from the project, save, and refresh the detail view
  async function handleDeleteRecording(assetId: string) {
    if (!selectedProject) return;
    const { project, filePath } = selectedProject;

    // Remove asset and any clips referencing it
    const updatedAssets = project.assets.filter((a) => a.id !== assetId);
    const updatedTracks = project.composition.tracks.map((track) => ({
      ...track,
      clips: track.clips.filter((c) => c.assetId !== assetId),
    }));
    const updatedProject = {
      ...project,
      assets: updatedAssets,
      composition: { ...project.composition, tracks: updatedTracks },
    };

    // Save the updated project to disk
    await window.roughcut.projectSave(updatedProject as ProjectDocument, filePath);

    // Update local state to re-render the detail view
    setSelectedProject({ project: updatedProject as ProjectDocument, filePath });
  }

  async function handleRemove(filePath: string) {
    await window.roughcut.recentProjectsRemove(filePath);
    setRecentProjects((prev) => prev.filter((p) => p.filePath !== filePath));
  }

  function handleRefresh() {
    setIsLoading(true);
    window.roughcut
      .recentProjectsGet()
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
          onDeleteRecording={handleDeleteRecording}
          onNewRecording={handleNewRecording}
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
