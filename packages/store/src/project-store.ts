import { createStore } from 'zustand/vanilla';
import { temporal } from 'zundo';
import type {
  ProjectDocument,
  ProjectSettings,
  Clip,
  Asset,
  ClipId,
  TrackId,
  AssetId,
  ZoomMarker,
  ZoomMarkerId,
  CursorPresentation,
  CameraPresentation,
  RegionCrop,
  EffectInstance,
} from '@rough-cut/project-model';
import { createProject, createZoomMarker, createDefaultRecordingPresentation, createDefaultCursorPresentation, createDefaultCameraPresentation, createDefaultRegionCrop } from '@rough-cut/project-model';
import {
  addClipToTrack,
  removeClipFromTrack,
  moveClip as moveClipOp,
  moveClipToTrack as moveClipToTrackOp,
  splitClip,
  trimClipLeft,
  trimClipRight,
  replaceClipOnTrack,
} from '@rough-cut/timeline-engine';

export interface ProjectState {
  /** The full project document — single source of truth */
  project: ProjectDocument;
  /** Whether the project has unsaved changes */
  isDirty: boolean;
  /** Absolute path to the .roughcut file on disk, null if the project has never been saved */
  projectFilePath: string | null;
}

export interface ProjectActions {
  /** Replace the entire project (used for load/new) */
  setProject: (project: ProjectDocument) => void;
  /** Functional update of the project */
  updateProject: (fn: (draft: ProjectDocument) => ProjectDocument) => void;
  /** Mark as saved (resets isDirty) */
  markSaved: () => void;
  /** Set the absolute path to the .roughcut file (null = unsaved) */
  setProjectFilePath: (path: string | null) => void;

  // Clip actions
  addClip: (trackId: TrackId, clip: Clip) => void;
  removeClip: (trackId: TrackId, clipId: ClipId) => void;
  moveClip: (trackId: TrackId, clipId: ClipId, newTimelineIn: number) => void;
  moveClipToTrack: (clipId: ClipId, fromTrackId: TrackId, toTrackId: TrackId) => void;

  // Asset actions
  addAsset: (asset: Asset) => void;
  removeAsset: (assetId: AssetId) => void;

  // Edit actions
  splitClipAtFrame: (trackId: TrackId, clipId: ClipId, frame: number) => void;
  trimClipLeftEdge: (trackId: TrackId, clipId: ClipId, newTimelineIn: number) => void;
  trimClipRightEdge: (trackId: TrackId, clipId: ClipId, newTimelineOut: number) => void;
  deleteClip: (trackId: TrackId, clipId: ClipId) => void;

  // Track actions
  setTrackName: (trackId: TrackId, name: string) => void;
  setTrackLocked: (trackId: TrackId, locked: boolean) => void;
  setTrackVisible: (trackId: TrackId, visible: boolean) => void;
  setTrackVolume: (trackId: TrackId, volume: number) => void;

  // Settings actions
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  // Clip property editing (for inspector)
  updateClipField: (clipId: ClipId, patch: Partial<Pick<Clip, 'name' | 'enabled'>>) => void;

  // Recording presentation — zoom
  setRecordingAutoZoomIntensity: (assetId: AssetId, value: number) => void;
  addRecordingZoomMarker: (assetId: AssetId, startFrame: number, endFrame: number) => void;
  updateRecordingZoomMarker: (assetId: AssetId, markerId: ZoomMarkerId, patch: Partial<ZoomMarker>) => void;
  removeRecordingZoomMarker: (assetId: AssetId, markerId: ZoomMarkerId) => void;
  resetRecordingZoom: (assetId: AssetId) => void;

  // Recording presentation — cursor
  updateRecordingCursor: (assetId: AssetId, patch: Partial<CursorPresentation>) => void;
  resetRecordingCursor: (assetId: AssetId) => void;

  // Recording presentation — camera
  updateCameraPresentation: (assetId: AssetId, patch: Partial<CameraPresentation>) => void;
  resetCameraPresentation: (assetId: AssetId) => void;

  // Recording presentation — crop
  updateScreenCrop: (assetId: AssetId, patch: Partial<RegionCrop>) => void;
  resetScreenCrop: (assetId: AssetId) => void;
  updateCameraCrop: (assetId: AssetId, patch: Partial<RegionCrop>) => void;
  resetCameraCrop: (assetId: AssetId) => void;

  // Clip effect actions
  addClipEffect: (trackId: TrackId, clipId: ClipId, effect: EffectInstance) => void;
  updateClipEffect: (trackId: TrackId, clipId: ClipId, effectIndex: number, patch: Partial<EffectInstance>) => void;
  removeClipEffect: (trackId: TrackId, clipId: ClipId, effectIndex: number) => void;
}

export type ProjectStore = ProjectState & ProjectActions;

export function createProjectStore() {
  return createStore<ProjectStore>()(
    temporal(
      (set, get) => ({
        project: createProject(),
        isDirty: false,
        projectFilePath: null,

        setProject: (project: ProjectDocument) => {
          set({ project, isDirty: true, projectFilePath: null });
        },

        updateProject: (fn: (draft: ProjectDocument) => ProjectDocument) => {
          set((state) => ({ project: fn(state.project), isDirty: true }));
        },

        markSaved: () => {
          set({ isDirty: false });
        },

        setProjectFilePath: (path) => {
          set({ projectFilePath: path });
        },

        addClip: (trackId: TrackId, clip: Clip) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? addClipToTrack(t, clip) : t,
              ),
            },
          }));
        },

        removeClip: (trackId: TrackId, clipId: ClipId) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? removeClipFromTrack(t, clipId) : t,
              ),
            },
          }));
        },

        moveClip: (trackId: TrackId, clipId: ClipId, newTimelineIn: number) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) => {
                if (t.id !== trackId) return t;
                return {
                  ...t,
                  clips: t.clips.map((c) =>
                    c.id === clipId ? moveClipOp(c, newTimelineIn) : c,
                  ),
                };
              }),
            },
          }));
        },

        moveClipToTrack: (clipId: ClipId, fromTrackId: TrackId, toTrackId: TrackId) => {
          get().updateProject((doc) => {
            const fromTrack = doc.composition.tracks.find((t) => t.id === fromTrackId);
            if (!fromTrack) return doc;
            const clip = fromTrack.clips.find((c) => c.id === clipId);
            if (!clip) return doc;

            const updatedClip = moveClipToTrackOp(clip, toTrackId);

            return {
              ...doc,
              composition: {
                ...doc.composition,
                tracks: doc.composition.tracks.map((t) => {
                  if (t.id === fromTrackId) return removeClipFromTrack(t, clipId);
                  if (t.id === toTrackId) return addClipToTrack(t, updatedClip);
                  return t;
                }),
              },
            };
          });
        },

        splitClipAtFrame: (trackId: TrackId, clipId: ClipId, frame: number) => {
          const track = get().project.composition.tracks.find((t) => t.id === trackId);
          if (!track) return;
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) return;
          const result = splitClip(clip, frame);
          if (!result) return;
          const [left, right] = result;
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? replaceClipOnTrack(t, clipId, left, right) : t,
              ),
            },
          }));
        },

        trimClipLeftEdge: (trackId: TrackId, clipId: ClipId, newTimelineIn: number) => {
          const track = get().project.composition.tracks.find((t) => t.id === trackId);
          if (!track) return;
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) return;
          const trimmed = trimClipLeft(clip, newTimelineIn);
          if (!trimmed) return;
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? replaceClipOnTrack(t, clipId, trimmed) : t,
              ),
            },
          }));
        },

        trimClipRightEdge: (trackId: TrackId, clipId: ClipId, newTimelineOut: number) => {
          const track = get().project.composition.tracks.find((t) => t.id === trackId);
          if (!track) return;
          const clip = track.clips.find((c) => c.id === clipId);
          if (!clip) return;
          const trimmed = trimClipRight(clip, newTimelineOut);
          if (!trimmed) return;
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? replaceClipOnTrack(t, clipId, trimmed) : t,
              ),
            },
          }));
        },

        deleteClip: (trackId: TrackId, clipId: ClipId) => {
          get().removeClip(trackId, clipId);
        },

        updateSettings: (patch) => {
          get().updateProject((doc) => ({
            ...doc,
            settings: { ...doc.settings, ...patch },
          }));
        },

        updateClipField: (clipId: ClipId, patch: Partial<Pick<Clip, 'name' | 'enabled'>>) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) => ({
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId ? { ...c, ...patch } : c,
                ),
              })),
            },
          }));
        },

        addAsset: (asset: Asset) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: [...doc.assets, asset],
          }));
        },

        removeAsset: (assetId: AssetId) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.filter((a) => a.id !== assetId),
          }));
        },

        setTrackName: (trackId: TrackId, name: string) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? { ...t, name } : t,
              ),
            },
          }));
        },

        setTrackLocked: (trackId: TrackId, locked: boolean) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? { ...t, locked } : t,
              ),
            },
          }));
        },

        setTrackVisible: (trackId: TrackId, visible: boolean) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? { ...t, visible } : t,
              ),
            },
          }));
        },

        setTrackVolume: (trackId: TrackId, volume: number) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((t) =>
                t.id === trackId ? { ...t, volume: Math.min(1, Math.max(0, volume)) } : t,
              ),
            },
          }));
        },

        // --- Recording presentation — zoom ---

        setRecordingAutoZoomIntensity: (assetId: AssetId, value: number) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: {
                  ...pres,
                  zoom: { ...pres.zoom, autoIntensity: Math.min(1, Math.max(0, value)) },
                },
              };
            }),
          }));
        },

        addRecordingZoomMarker: (assetId: AssetId, startFrame: number, endFrame: number) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              const marker = createZoomMarker(startFrame, endFrame);
              return {
                ...a,
                presentation: {
                  ...pres,
                  zoom: {
                    ...pres.zoom,
                    markers: [...pres.zoom.markers, marker],
                  },
                },
              };
            }),
          }));
        },

        updateRecordingZoomMarker: (assetId: AssetId, markerId: ZoomMarkerId, patch: Partial<ZoomMarker>) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: {
                  ...pres,
                  zoom: {
                    ...pres.zoom,
                    markers: pres.zoom.markers.map((m) =>
                      m.id === markerId ? { ...m, ...patch } : m,
                    ),
                  },
                },
              };
            }),
          }));
        },

        removeRecordingZoomMarker: (assetId: AssetId, markerId: ZoomMarkerId) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: {
                  ...pres,
                  zoom: {
                    ...pres.zoom,
                    markers: pres.zoom.markers.filter((m) => m.id !== markerId),
                  },
                },
              };
            }),
          }));
        },

        resetRecordingZoom: (assetId: AssetId) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: {
                  ...pres,
                  zoom: createDefaultRecordingPresentation().zoom,
                },
              };
            }),
          }));
        },

        // --- Recording presentation — cursor ---

        updateRecordingCursor: (assetId: AssetId, patch: Partial<CursorPresentation>) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: {
                  ...pres,
                  cursor: { ...pres.cursor, ...patch },
                },
              };
            }),
          }));
        },

        resetRecordingCursor: (assetId: AssetId) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: {
                  ...pres,
                  cursor: createDefaultCursorPresentation(),
                },
              };
            }),
          }));
        },

        // --- Recording presentation — camera ---

        updateCameraPresentation: (assetId: AssetId, patch: Partial<CameraPresentation>) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) =>
              a.id === assetId
                ? {
                    ...a,
                    presentation: {
                      ...(a.presentation ?? createDefaultRecordingPresentation()),
                      camera: {
                        ...(a.presentation ?? createDefaultRecordingPresentation()).camera,
                        ...patch,
                      },
                    },
                  }
                : a,
            ),
          }));
        },

        resetCameraPresentation: (assetId: AssetId) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: {
                  ...pres,
                  camera: createDefaultCameraPresentation(),
                },
              };
            }),
          }));
        },

        // --- Recording presentation — crop ---

        updateScreenCrop: (assetId: AssetId, patch: Partial<RegionCrop>) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) =>
              a.id === assetId
                ? {
                    ...a,
                    presentation: {
                      ...(a.presentation ?? createDefaultRecordingPresentation()),
                      screenCrop: {
                        ...((a.presentation ?? createDefaultRecordingPresentation()).screenCrop ?? createDefaultRegionCrop()),
                        ...patch,
                      },
                    },
                  }
                : a,
            ),
          }));
        },

        resetScreenCrop: (assetId: AssetId) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: { ...pres, screenCrop: undefined },
              };
            }),
          }));
        },

        updateCameraCrop: (assetId: AssetId, patch: Partial<RegionCrop>) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) =>
              a.id === assetId
                ? {
                    ...a,
                    presentation: {
                      ...(a.presentation ?? createDefaultRecordingPresentation()),
                      cameraCrop: {
                        ...((a.presentation ?? createDefaultRecordingPresentation()).cameraCrop ?? createDefaultRegionCrop()),
                        ...patch,
                      },
                    },
                  }
                : a,
            ),
          }));
        },

        resetCameraCrop: (assetId: AssetId) => {
          get().updateProject((doc) => ({
            ...doc,
            assets: doc.assets.map((a) => {
              if (a.id !== assetId) return a;
              const pres = a.presentation ?? createDefaultRecordingPresentation();
              return {
                ...a,
                presentation: { ...pres, cameraCrop: undefined },
              };
            }),
          }));
        },

        // --- Clip effect actions ---

        addClipEffect: (trackId: TrackId, clipId: ClipId, effect: EffectInstance) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((track) =>
                track.id === trackId
                  ? {
                      ...track,
                      clips: track.clips.map((clip) =>
                        clip.id === clipId
                          ? { ...clip, effects: [...clip.effects, effect] }
                          : clip,
                      ),
                    }
                  : track,
              ),
            },
          }));
        },

        updateClipEffect: (trackId: TrackId, clipId: ClipId, effectIndex: number, patch: Partial<EffectInstance>) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((track) =>
                track.id === trackId
                  ? {
                      ...track,
                      clips: track.clips.map((clip) =>
                        clip.id === clipId
                          ? {
                              ...clip,
                              effects: clip.effects.map((effect, idx) =>
                                idx === effectIndex ? { ...effect, ...patch } : effect,
                              ),
                            }
                          : clip,
                      ),
                    }
                  : track,
              ),
            },
          }));
        },

        removeClipEffect: (trackId: TrackId, clipId: ClipId, effectIndex: number) => {
          get().updateProject((doc) => ({
            ...doc,
            composition: {
              ...doc.composition,
              tracks: doc.composition.tracks.map((track) =>
                track.id === trackId
                  ? {
                      ...track,
                      clips: track.clips.map((clip) =>
                        clip.id === clipId
                          ? {
                              ...clip,
                              effects: clip.effects.filter((_, idx) => idx !== effectIndex),
                            }
                          : clip,
                      ),
                    }
                  : track,
              ),
            },
          }));
        },
      }),
      {
        equality: (pastState, currentState) =>
          pastState.project === currentState.project,
        limit: 100,
      },
    ),
  );
}
