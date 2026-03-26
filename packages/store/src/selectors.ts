import type { ProjectState } from './project-store.js';
import type { TransportState } from './transport-store.js';
import type { Clip, Track, Asset, TrackId, AssetId } from '@rough-cut/project-model';

// Project selectors
export const selectProject = (state: ProjectState) => state.project;
export const selectTracks = (state: ProjectState) => state.project.composition.tracks;
export const selectAssets = (state: ProjectState) => state.project.assets;
export const selectTrackById =
  (trackId: TrackId) =>
  (state: ProjectState): Track | undefined =>
    state.project.composition.tracks.find((t) => t.id === trackId);
export const selectAssetById =
  (assetId: AssetId) =>
  (state: ProjectState): Asset | undefined =>
    state.project.assets.find((a) => a.id === assetId);
export const selectAllClips = (state: ProjectState): Clip[] =>
  state.project.composition.tracks.flatMap((t) => [...t.clips]);
export const selectIsDirty = (state: ProjectState) => state.isDirty;
export const selectSettings = (state: ProjectState) => state.project.settings;
export const selectCompositionDuration = (state: ProjectState) =>
  state.project.composition.duration;

// Transport selectors
export const selectPlayheadFrame = (state: TransportState) => state.playheadFrame;
export const selectIsPlaying = (state: TransportState) => state.isPlaying;
export const selectPlaybackRate = (state: TransportState) => state.playbackRate;
