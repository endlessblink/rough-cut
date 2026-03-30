import React, { useEffect, useState, useCallback } from 'react';
import type { ProjectDocument } from '@rough-cut/project-model';
import { createProject, createAsset, createClip } from '@rough-cut/project-model';
import type { RecordingResult } from './env.js';
import { RecordTab } from './features/record/RecordTab.js';
import { EditTab } from './features/edit/EditTab.js';
import { ExportTab } from './features/export/ExportTab.js';
import { ProjectsTab } from './features/projects/ProjectsTab.js';
import type { AppView } from './ui/index.js';
import { projectStore, transportStore } from './hooks/use-stores.js';

function generateProjectName(): string {
  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `Recording ${month} ${day}, ${year} - ${hours}:${minutes}`;
}

type TabId = AppView;
const TABS: { id: TabId; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'record', label: 'Record' },
  { id: 'edit', label: 'Edit' },
  { id: 'aiMotion', label: 'AI Motion' },
  { id: 'export', label: 'Export' },
];

export function App() {
  const [projectName, setProjectName] = useState('Untitled Project');
  const [activeTab, setActiveTab] = useState<TabId>('projects');

  // Initialize with a default project on mount
  useEffect(() => {
    const defaultProject = createProject({ name: generateProjectName() });
    projectStore.getState().setProject(defaultProject);

    // Keep projectName in sync with store
    const unsub = projectStore.subscribe((state) => {
      setProjectName(state.project.name);
    });

    return () => {
      unsub();
    };
  }, []);

  // --- Flow 1: Open project ---
  const handleOpen = useCallback(async (): Promise<boolean> => {
    const result = await window.roughcut.projectOpen();
    if (result) {
      projectStore.getState().setProject(result.project as ProjectDocument);
      projectStore.getState().setProjectFilePath(result.filePath);
      transportStore.getState().seekToFrame(0);
      return true;
    }
    return false;
  }, []);

  // New project
  const handleNew = useCallback(async () => {
    await window.roughcut.projectNew();
    const project = createProject({ name: generateProjectName() });
    projectStore.getState().setProject(project);
    projectStore.getState().setProjectFilePath(null);
    transportStore.getState().seekToFrame(0);
  }, []);

  // --- Flow 4: Trigger export ---
  const handleExport = useCallback(async () => {
    const project = projectStore.getState().project;
    const settings = project.exportSettings;
    await window.roughcut.exportStart(project, settings, '/tmp/rough-cut-export.mp4');
  }, []);

  // --- Recording integration ---
  const handleRecordingComplete = useCallback((result: RecordingResult) => {
    console.group('[App] handleRecordingComplete');
    console.log('[App] RecordingResult:', {
      filePath: result.filePath,
      durationFrames: result.durationFrames,
      width: result.width,
      height: result.height,
      fps: result.fps,
      codec: result.codec,
      fileSize: result.fileSize,
      cameraFilePath: result.cameraFilePath,
    });

    // If a camera file was saved alongside the screen recording, create a camera asset first
    let cameraAssetId: string | undefined;
    if (result.cameraFilePath) {
      const cameraAsset = createAsset('video', result.cameraFilePath, {
        duration: result.durationFrames,
        metadata: {
          isCamera: true,
          width: 640,
          height: 480,
        },
      });
      projectStore.getState().addAsset(cameraAsset);
      cameraAssetId = cameraAsset.id;
      console.log('[App] Camera asset created:', cameraAsset.id);
    }

    const asset = createAsset('recording', result.filePath, {
      duration: result.durationFrames,
      thumbnailPath: result.thumbnailPath,
      metadata: {
        width: result.width,
        height: result.height,
        fps: result.fps,
        codec: result.codec,
        fileSize: result.fileSize,
      },
      ...(cameraAssetId ? { cameraAssetId } : {}),
    });
    projectStore.getState().addAsset(asset);
    console.log('[App] Recording asset created:', { id: asset.id, type: asset.type, duration: asset.duration, filePath: asset.filePath });

    // Also create a clip on the first video track referencing this asset
    // Guard: skip clip creation if duration is zero (ffprobe failure)
    const clipDuration = result.durationFrames > 0 ? result.durationFrames : 0;
    console.log('[App] clipDuration:', clipDuration);
    const store = projectStore.getState();
    const videoTrack = store.project.composition.tracks.find((t) => t.type === 'video');
    console.log('[App] Target video track:', videoTrack ? { id: videoTrack.id, name: videoTrack.name, index: videoTrack.index, clipCount: videoTrack.clips.length } : 'NONE');
    if (videoTrack && clipDuration > 0) {
      // Place clip at the end of existing content on this track
      const trackEnd = videoTrack.clips.reduce((max, c) => Math.max(max, c.timelineOut), 0);
      const clip = createClip(asset.id, videoTrack.id, {
        timelineIn: trackEnd,
        timelineOut: trackEnd + clipDuration,
        sourceIn: 0,
        sourceOut: clipDuration,
      });
      console.log('[App] Clip created:', { id: clip.id, assetId: clip.assetId, trackId: clip.trackId, timelineIn: clip.timelineIn, timelineOut: clip.timelineOut, sourceIn: clip.sourceIn, sourceOut: clip.sourceOut });
      store.addClip(videoTrack.id, clip);

      // Update composition duration so all timelines (Record, Export) render clips
      const prevDuration = projectStore.getState().project.composition.duration;
      const newDuration = Math.max(prevDuration, trackEnd + result.durationFrames);
      console.log('[App] Composition duration:', { prevDuration, trackEnd, resultDurationFrames: result.durationFrames, newDuration });
      projectStore.getState().updateProject((p) => ({
        ...p,
        composition: { ...p.composition, duration: newDuration },
      }));
    } else {
      console.warn('[App] Skipped clip creation:', { videoTrack: !!videoTrack, clipDuration });
    }

    // Log final project state for debugging
    const finalProject = projectStore.getState().project;
    console.log('[App] Final project state after recording:', {
      assetCount: finalProject.assets.length,
      assets: finalProject.assets.map((a) => ({ id: a.id, type: a.type, duration: a.duration, filePath: a.filePath })),
      trackCount: finalProject.composition.tracks.length,
      tracks: finalProject.composition.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        index: t.index,
        clipCount: t.clips.length,
        clips: t.clips.map((c) => ({ id: c.id, assetId: c.assetId, timelineIn: c.timelineIn, timelineOut: c.timelineOut, sourceIn: c.sourceIn, sourceOut: c.sourceOut })),
      })),
      compositionDuration: finalProject.composition.duration,
    });
    console.groupEnd();

    // Auto-save silently after recording — fire and forget, never blocks the UI
    const currentPath = projectStore.getState().projectFilePath;
    const updatedProject = projectStore.getState().project;
    window.roughcut.projectAutoSave(updatedProject, currentPath ?? undefined)
      .then((savedPath) => {
        projectStore.getState().setProjectFilePath(savedPath);
        projectStore.getState().markSaved();
      })
      .catch((err) => {
        console.error('[auto-save] Failed to save after recording:', err);
      });
  }, []);

  // --- Listen for recordings from the floating panel window ---
  useEffect(() => {
    const unsub = window.roughcut.onRecordingAssetReady((result) => {
      console.info('[App] Recording asset received from panel:', result.filePath);
      handleRecordingComplete(result);
    });
    return unsub;
  }, [handleRecordingComplete]);

  // --- Tab content ---
  // Record and Edit tabs own their own full-viewport layouts.
  // All other tabs use the classic sidebar + placeholder split.
  function renderTabContent() {
    switch (activeTab) {
      case 'aiMotion':
        return <TabPlaceholder name="AI Motion" />;
    }
  }

  // Projects tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'projects') {
    return (
      <ProjectsTab
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        onNewProject={handleNew}
        onOpenProject={handleOpen}
      />
    );
  }

  // Record tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'record') {
    return <RecordTab onAssetCreated={handleRecordingComplete} activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  // Edit tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'edit') {
    return <EditTab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  // Export tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'export') {
    return <ExportTab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Rough Cut</span>
        <span style={{ color: '#555' }}>|</span>
        <span style={{ color: '#aaa', fontSize: 13 }}>{projectName}</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleNew} style={btnStyle}>New</button>
        <button onClick={handleOpen} style={btnStyle}>Open</button>
        <button onClick={handleExport} style={btnStyle}>Export</button>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        background: '#111',
        borderBottom: '1px solid #333',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 20px',
              background: activeTab === tab.id ? '#1a1a1a' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#888',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        {renderTabContent()}
      </div>
    </div>
  );
}

function TabPlaceholder({ name }: { name: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: '#555',
      fontSize: 14,
    }}>
      {name} tab coming soon
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '4px 12px',
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
};
