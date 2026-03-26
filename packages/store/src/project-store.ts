import { createStore } from 'zustand/vanilla';
import { temporal } from 'zundo';
import type {
  ProjectDocument,
  Clip,
  Asset,
  ClipId,
  TrackId,
  AssetId,
} from '@rough-cut/project-model';
import { createProject } from '@rough-cut/project-model';
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
}

export interface ProjectActions {
  /** Replace the entire project (used for load/new) */
  setProject: (project: ProjectDocument) => void;
  /** Functional update of the project */
  updateProject: (fn: (draft: ProjectDocument) => ProjectDocument) => void;
  /** Mark as saved (resets isDirty) */
  markSaved: () => void;

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
}

export type ProjectStore = ProjectState & ProjectActions;

export function createProjectStore() {
  return createStore<ProjectStore>()(
    temporal(
      (set, get) => ({
        project: createProject(),
        isDirty: false,

        setProject: (project: ProjectDocument) => {
          set({ project, isDirty: true });
        },

        updateProject: (fn: (draft: ProjectDocument) => ProjectDocument) => {
          set((state) => ({ project: fn(state.project), isDirty: true }));
        },

        markSaved: () => {
          set({ isDirty: false });
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
      }),
      {
        equality: (pastState, currentState) =>
          pastState.project === currentState.project,
        limit: 100,
      },
    ),
  );
}
