import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { ProjectDocument } from '@rough-cut/project-model';
import {
  createProject,
  createAsset,
  createClip,
  createDefaultRecordingPresentation,
} from '@rough-cut/project-model';
import type { CursorEvent } from '@rough-cut/project-model';
import type { RecordingResult } from './env.js';
import { RecordTab } from './features/record/RecordTab.js';
import { EditTab } from './features/edit/EditTab.js';
import { ExportTab } from './features/export/ExportTab.js';
import { runDesktopExport } from './features/export/run-export.js';
import { ProjectsTab } from './features/projects/ProjectsTab.js';
import { AITab } from './features/ai/AITab.js';
import { MotionTab } from './features/motion/MotionTab.js';
import type { AppView } from './ui/index.js';
import { projectStore, transportStore } from './hooks/use-stores.js';
import { getPlaybackManager } from './hooks/use-playback-manager.js';
import { parseNdjsonCursorEvents } from './components/cursor-data-loader.js';
import { generateAutoZoomMarkers } from '@rough-cut/timeline-engine';

function generateProjectName(): string {
  const d = new Date();
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
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
  { id: 'motion', label: 'Motion' },
  { id: 'ai', label: 'AI' },
  { id: 'export', label: 'Export' },
];

export function App() {
  const [projectName, setProjectName] = useState('Untitled Project');
  const [activeTab, setActiveTab] = useState<TabId>('projects');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRequestRef = useRef(0);
  const lastHandledRecordingRef = useRef<{ filePath: string; handledAt: number } | null>(null);

  // Initialize with a default project on mount
  useEffect(() => {
    const currentState = projectStore.getState();
    const shouldSeedDefaultProject =
      currentState.project.name === 'Untitled Project' &&
      currentState.project.assets.length === 0 &&
      currentState.projectFilePath == null;

    if (shouldSeedDefaultProject) {
      const defaultProject = createProject({ name: generateProjectName() });
      currentState.setProject(defaultProject);
    }

    // Keep projectName in sync with store
    const unsub = projectStore.subscribe((state) => {
      setProjectName(state.project.name);
    });

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const clearPendingAutoSave = () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };

    const unsub = projectStore.subscribe((state) => {
      clearPendingAutoSave();

      if (!state.isDirty || !state.projectFilePath) {
        return;
      }

      const snapshotProject = state.project;
      const snapshotPath = state.projectFilePath;
      const requestId = ++autoSaveRequestRef.current;

      autoSaveTimerRef.current = setTimeout(() => {
        window.roughcut
          .projectAutoSave(snapshotProject, snapshotPath)
          .then((savedPath) => {
            const currentState = projectStore.getState();
            if (
              autoSaveRequestRef.current === requestId &&
              currentState.project === snapshotProject &&
              currentState.projectFilePath === snapshotPath
            ) {
              if (savedPath !== snapshotPath) {
                currentState.setProjectFilePath(savedPath);
              }
              currentState.markSaved();
            }
          })
          .catch((err) => {
            console.error('[auto-save] Failed to persist project changes:', err);
          })
          .finally(() => {
            if (autoSaveTimerRef.current) {
              autoSaveTimerRef.current = null;
            }
          });
      }, 500);
    });

    return () => {
      clearPendingAutoSave();
      unsub();
    };
  }, []);

  // --- Flow 1: Open project ---
  const handleOpen = useCallback(async (): Promise<boolean> => {
    const result = await window.roughcut.projectOpen();
    if (result) {
      getPlaybackManager().pause();
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
    getPlaybackManager().pause();
    projectStore.getState().setProject(project);
    projectStore.getState().setProjectFilePath(null);
    transportStore.getState().seekToFrame(0);
  }, []);

  // --- Flow 4: Trigger export ---
  const handleExport = useCallback(async () => {
    const project = projectStore.getState().project;
    await runDesktopExport(project, {
      startFrame: 0,
      endFrame: project.composition.duration,
    });
  }, []);

  // --- Recording integration ---
  const handleRecordingComplete = useCallback(async (result: RecordingResult) => {
    const lastHandled = lastHandledRecordingRef.current;
    if (lastHandled?.filePath === result.filePath) {
      console.info('[App] Ignoring duplicate recording result for same file:', result.filePath);
      return;
    }

    const now = Date.now();
    if (lastHandled && now - lastHandled.handledAt < 15000) {
      console.warn('[App] Ignoring competing recording result shortly after import:', {
        acceptedFilePath: lastHandled.filePath,
        ignoredFilePath: result.filePath,
      });
      return;
    }
    lastHandledRecordingRef.current = { filePath: result.filePath, handledAt: now };

    // Decide: append to current project, or start a fresh one.
    // Rule: if the current project already has assets, the user is inside a
    //       session (recording take 2+, or capturing inside an open project),
    //       so the new recording is added as another take on the same timeline.
    //       Otherwise the first take of the session populates a freshly-named
    //       project, matching the long-standing "new project per recording" UX.
    const preStore = projectStore.getState();
    const shouldAppend = preStore.project.assets.length > 0;

    // Auto-save the current project before touching it — fire and forget.
    // Matters for both branches: in append mode we keep writing to the same
    // file; in replace mode we snapshot the outgoing project before it's
    // swapped out of memory.
    if (preStore.projectFilePath && preStore.isDirty) {
      window.roughcut.projectAutoSave(preStore.project, preStore.projectFilePath).catch((err) => {
        console.error('[auto-save] Failed to save current project before new recording:', err);
      });
    }

    getPlaybackManager().pause();

    if (shouldAppend) {
      // Land the playhead at the new clip's start so the user sees it immediately.
      transportStore.getState().seekToFrame(preStore.project.composition.duration);
    } else {
      const freshProject = createProject({ name: generateProjectName() });
      projectStore.getState().setProject(freshProject);
      projectStore.getState().setProjectFilePath(null);
      projectStore.getState().setActiveAssetId(null);
      transportStore.getState().seekToFrame(0);
    }

    // If a camera file was saved alongside the screen recording, create a camera asset first
    let cameraAssetId: ProjectDocument['assets'][number]['id'] | undefined;
    console.log('[App] Recording result cameraFilePath:', result.cameraFilePath ?? 'NONE');
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
      console.log('[App] Camera asset created:', cameraAssetId, 'path:', result.cameraFilePath);
    }

    let autoZoomIntensity = 0.5;
    try {
      autoZoomIntensity = await window.roughcut.storageGetAutoZoomIntensity();
    } catch (err) {
      console.warn('[App] Failed to load auto zoom intensity setting:', err);
    }

    let generatedZoom = null;
    if (result.cursorEventsPath) {
      try {
        const ndjson = await window.roughcut.readTextFile(result.cursorEventsPath);
        if (ndjson) {
          const cursorEvents = parseNdjsonCursorEvents(ndjson).map<CursorEvent>((event) => ({
            frame: event.frame,
            x: event.x,
            y: event.y,
            type: event.type as CursorEvent['type'],
            button: (event.button ?? 0) as CursorEvent['button'],
          }));
          generatedZoom = {
            autoIntensity: autoZoomIntensity,
            followCursor: true,
            followAnimation: 'focused' as const,
            followPadding: 0.18,
            markers: generateAutoZoomMarkers(
              cursorEvents,
              autoZoomIntensity,
              result.fps,
              result.width,
              result.height,
            ),
          };
        }
      } catch (err) {
        console.warn('[App] Failed to generate auto zoom from cursor data:', err);
      }
    }

    const store = projectStore.getState();
    const timelineFps = store.project.settings.frameRate || 30;
    const clipDuration =
      result.durationMs > 0 ? Math.round((result.durationMs / 1000) * timelineFps) : 0;

    const baseAsset = createAsset('recording', result.filePath, {
      duration: clipDuration,
      thumbnailPath: result.thumbnailPath,
      metadata: {
        width: result.width,
        height: result.height,
        fps: result.fps,
        codec: result.codec,
        fileSize: result.fileSize,
        hasAudio: result.hasAudio,
        cursorEventsPath: result.cursorEventsPath || null,
        audioCapture: result.audioCapture ?? null,
      },
      ...(generatedZoom
        ? {
            presentation: {
              ...createDefaultRecordingPresentation(),
              zoom: generatedZoom,
            },
          }
        : {}),
      ...(cameraAssetId ? { cameraAssetId } : {}),
    });

    // Hydrate zoom markers from the sidecar (if the user worked on this recording before).
    let asset = baseAsset;
    try {
      const loadedZoom = await window.roughcut.zoomLoadSidecar(result.filePath);
      if (loadedZoom) {
        const basePres =
          (baseAsset as unknown as { presentation?: Record<string, unknown> }).presentation ?? {};
        asset = {
          ...baseAsset,
          presentation: {
            ...basePres,
            zoom: loadedZoom,
          },
        } as typeof baseAsset;
        console.info(
          '[App] Hydrated zoom sidecar:',
          loadedZoom.markers.length,
          'markers for',
          result.filePath,
        );
      }
    } catch (err) {
      console.warn('[App] zoomLoadSidecar failed:', err);
    }

    console.log('[App] Recording asset before addAsset:', {
      id: asset.id,
      cameraAssetId: (asset as any).cameraAssetId,
      hasCameraId: 'cameraAssetId' in asset,
    });
    projectStore.getState().addAsset(asset);

    // Append the new clip at the current end of the timeline. On a freshly
    // replaced project, composition.duration === 0, so this lands at frame 0.
    // On an existing project, it lands right after the previous take.
    const nextTimelineIn = store.project.composition.duration;
    const nextTimelineOut = nextTimelineIn + clipDuration;

    const videoTrack = store.project.composition.tracks.find((t) => t.type === 'video');
    const audioTrack = store.project.composition.tracks.find((t) => t.type === 'audio');
    if (videoTrack && clipDuration > 0) {
      const clip = createClip(asset.id, videoTrack.id, {
        timelineIn: nextTimelineIn,
        timelineOut: nextTimelineOut,
        sourceIn: 0,
        sourceOut: clipDuration,
      });
      store.addClip(videoTrack.id, clip);

      if (result.hasAudio && audioTrack) {
        const audioClip = createClip(asset.id, audioTrack.id, {
          timelineIn: nextTimelineIn,
          timelineOut: nextTimelineOut,
          sourceIn: 0,
          sourceOut: clipDuration,
        });
        store.addClip(audioTrack.id, audioClip);
      }

      // Add camera clip on a higher video track (renders on top of screen as PiP)
      console.log(
        '[App] Camera clip check — cameraAssetId:',
        cameraAssetId,
        'clipDuration:',
        clipDuration,
      );
      if (cameraAssetId) {
        const allVideoTracks = store.project.composition.tracks
          .filter((t) => t.type === 'video')
          .sort((a, b) => b.index - a.index);
        // Use a different video track (higher z-index) so camera renders on top
        const cameraTrack = allVideoTracks.find((t) => t.id !== videoTrack.id) ?? videoTrack;
        const cameraClip = createClip(cameraAssetId, cameraTrack.id, {
          timelineIn: nextTimelineIn,
          timelineOut: nextTimelineOut,
          sourceIn: 0,
          sourceOut: clipDuration,
          // PiP: bottom-right corner, 20% size
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
        });
        store.addClip(cameraTrack.id, cameraClip);
        console.log('[App] Camera clip ADDED:', {
          clipId: cameraClip.id,
          trackId: cameraTrack.id,
          trackIndex: cameraTrack.index,
        });
        console.log('[App] Camera clip created on track:', cameraTrack.name, cameraClip.id);
      }

      // Update composition duration to the end of the new clip (or keep it
      // if it was already longer, which shouldn't happen on append but is
      // defensive).
      const newDuration = Math.max(
        projectStore.getState().project.composition.duration,
        nextTimelineOut,
      );
      projectStore.getState().updateProject((p) => ({
        ...p,
        composition: { ...p.composition, duration: newDuration },
      }));
    }

    // Auto-save the new project silently — fire and forget
    const newPath = projectStore.getState().projectFilePath;
    const updatedProject = projectStore.getState().project;
    window.roughcut
      .projectAutoSave(updatedProject, newPath ?? undefined)
      .then((savedPath) => {
        projectStore.getState().setProjectFilePath(savedPath);
        projectStore.getState().markSaved();
      })
      .catch((err) => {
        console.error('[auto-save] Failed to save after recording:', err);
      });

    // Set active asset so Record tab focuses on this recording
    projectStore.getState().setActiveAssetId(asset.id);
  }, []);

  // --- Listen for recordings from the floating panel window ---
  useEffect(() => {
    const unsub = window.roughcut.onRecordingAssetReady((result) => {
      console.info('[App] Recording asset received from panel:', result.filePath);
      handleRecordingComplete(result);
      setActiveTab('record');
    });
    return unsub;
  }, [handleRecordingComplete]);

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
    return <RecordTab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  // Edit tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'edit') {
    return <EditTab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  // Export tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'export') {
    return <ExportTab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  // Motion tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'motion') {
    return <MotionTab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  // AI tab takes over the entire viewport — no chrome wrapper
  if (activeTab === 'ai') {
    return <AITab activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          background: '#1a1a1a',
          borderBottom: '1px solid #333',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Rough Cut</span>
        <span style={{ color: '#555' }}>|</span>
        <span style={{ color: '#aaa', fontSize: 13 }}>{projectName}</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleNew} style={btnStyle}>
          New
        </button>
        <button onClick={handleOpen} style={btnStyle}>
          Open
        </button>
        <button onClick={handleExport} style={btnStyle}>
          Export
        </button>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          background: '#111',
          borderBottom: '1px solid #333',
        }}
      >
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {null}
      </div>
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
