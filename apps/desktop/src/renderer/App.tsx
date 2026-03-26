import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PreviewCompositor } from '@rough-cut/preview-renderer';
import type { ProjectDocument } from '@rough-cut/project-model';
import { createProject, createAsset } from '@rough-cut/project-model';
import type { RecordingResult } from './env.js';
import { RecordTab } from './features/record/RecordTab.js';
import { EditTab } from './features/edit/EditTab.js';
import type { AppView } from './features/record/HeaderBar.js';
import { projectStore, transportStore } from './hooks/use-stores.js';

type TabId = AppView;
const TABS: { id: TabId; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'record', label: 'Record' },
  { id: 'edit', label: 'Edit' },
  { id: 'export', label: 'Export' },
  { id: 'aiMotion', label: 'AI Motion' },
];

export function App() {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<PreviewCompositor | null>(null);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('record');

  // --- Flow 2: Mount preview compositor ---
  useEffect(() => {
    let unsubProject: (() => void) | undefined;
    let unsubTransport: (() => void) | undefined;
    let disposed = false;

    const compositor = new PreviewCompositor(
      { width: 640, height: 360 },
      { onFrameRendered: (f) => setCurrentFrame(f) },
    );
    compositorRef.current = compositor;

    // Wait for init to finish before wiring stores
    compositor.init().then((canvas) => {
      if (disposed) return;
      if (canvasContainerRef.current) {
        canvasContainerRef.current.appendChild(canvas);
        setIsReady(true);
      }

      // Wire project store -> compositor (only after init)
      unsubProject = projectStore.subscribe((state) => {
        compositor.setProject(state.project);
        setProjectName(state.project.name);
        setDuration(state.project.composition.duration);
      });

      // Wire transport store -> compositor
      unsubTransport = transportStore.subscribe((state) => {
        compositor.seekTo(state.playheadFrame);
        setCurrentFrame(state.playheadFrame);
      });

      // Apply current project state now that compositor is ready
      const currentState = projectStore.getState();
      compositor.setProject(currentState.project);
      setProjectName(currentState.project.name);
      setDuration(currentState.project.composition.duration);
    });

    // Initialize with a default project (store update is fine — compositor just buffers it)
    const defaultProject = createProject();
    projectStore.getState().setProject(defaultProject);

    return () => {
      disposed = true;
      unsubProject?.();
      unsubTransport?.();
      compositor.dispose();
    };
  }, []);

  // --- Flow 1: Open project ---
  const handleOpen = useCallback(async () => {
    const data = await window.roughcut.projectOpen();
    if (data) {
      projectStore.getState().setProject(data as ProjectDocument);
      transportStore.getState().seekToFrame(0);
    }
  }, []);

  // New project
  const handleNew = useCallback(async () => {
    await window.roughcut.projectNew();
    const project = createProject();
    projectStore.getState().setProject(project);
    transportStore.getState().seekToFrame(0);
  }, []);

  // --- Flow 3: Scrub transport ---
  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value, 10);
    transportStore.getState().setPlayheadFrame(frame);
  }, []);

  // --- Flow 4: Trigger export ---
  const handleExport = useCallback(async () => {
    const project = projectStore.getState().project;
    const settings = project.exportSettings;
    await window.roughcut.exportStart(project, settings, '/tmp/rough-cut-export.mp4');
  }, []);

  // --- Recording integration ---
  const handleRecordingComplete = useCallback((result: RecordingResult) => {
    const asset = createAsset('recording', result.filePath, {
      duration: result.durationFrames,
      metadata: {
        width: result.width,
        height: result.height,
        fps: result.fps,
        codec: result.codec,
        fileSize: result.fileSize,
      },
    });
    projectStore.getState().addAsset(asset);
  }, []);

  // --- Tab content ---
  // Record and Edit tabs own their own full-viewport layouts.
  // All other tabs use the classic sidebar + preview canvas split.
  function renderTabContent() {
    switch (activeTab) {
      case 'projects':
        return <TabPlaceholder name="Projects" />;
      case 'export':
        return <TabPlaceholder name="Export" />;
      case 'aiMotion':
        return <TabPlaceholder name="AI Motion" />;
    }
  }

  // Record tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'record') {
    return <RecordTab onAssetCreated={handleRecordingComplete} activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  // Edit tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'edit') {
    return <EditTab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
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

      {/* Main content area: sidebar + preview canvas split */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Tab panel (left side) */}
        <div style={{ width: 360, minWidth: 280, borderRight: '1px solid #333', overflow: 'hidden' }}>
          {renderTabContent()}
        </div>

        {/* Preview canvas (right side) */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          position: 'relative',
        }}>
          <div ref={canvasContainerRef} style={{ borderRadius: 4, overflow: 'hidden' }} />
          {!isReady && (
            <span style={{ color: '#555', position: 'absolute' }}>Initializing preview...</span>
          )}
        </div>
      </div>

      {/* Transport bar */}
      <div style={{
        padding: '8px 16px',
        background: '#1a1a1a',
        borderTop: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13, minWidth: 140 }}>
          Frame: {currentFrame} / {duration}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(duration - 1, 0)}
          value={currentFrame}
          onChange={handleScrub}
          style={{ flex: 1 }}
        />
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
