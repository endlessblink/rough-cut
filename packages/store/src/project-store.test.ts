import { describe, it, expect, beforeEach } from 'vitest';
import { createProjectStore } from './project-store.js';
import { createTransportStore } from './transport-store.js';
import {
  createProject,
  createTrack,
  createClip,
  createAsset,
} from '@rough-cut/project-model';
import type { StoreApi } from 'zustand/vanilla';
import type { ProjectStore } from './project-store.js';

describe('projectStore', () => {
  let store: StoreApi<ProjectStore>;

  beforeEach(() => {
    store = createProjectStore();
  });

  describe('initial state', () => {
    it('has a default ProjectDocument', () => {
      const state = store.getState();
      expect(state.project).toBeDefined();
      expect(state.project.name).toBe('Untitled Project');
      expect(state.project.composition).toBeDefined();
    });

    it('isDirty is false', () => {
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('setProject', () => {
    it('replaces the document', () => {
      const newProject = createProject({ name: 'New Project' });
      store.getState().setProject(newProject);
      expect(store.getState().project.name).toBe('New Project');
    });

    it('sets isDirty = true', () => {
      const newProject = createProject();
      store.getState().setProject(newProject);
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('updateProject', () => {
    it('applies a function to the document', () => {
      store.getState().updateProject((doc) => ({ ...doc, name: 'Updated' }));
      expect(store.getState().project.name).toBe('Updated');
    });

    it('sets isDirty = true', () => {
      store.getState().updateProject((doc) => ({ ...doc, name: 'Updated' }));
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('markSaved', () => {
    it('sets isDirty = false', () => {
      const newProject = createProject();
      store.getState().setProject(newProject);
      expect(store.getState().isDirty).toBe(true);
      store.getState().markSaved();
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('clip actions', () => {
    it('addClip: clip appears on the specified track', () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      const clip = createClip(
        'asset-1' as ReturnType<typeof createClip>['assetId'],
        track.id,
        { timelineIn: 0, timelineOut: 30 },
      );
      store.getState().addClip(track.id, clip);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.clips).toHaveLength(1);
      expect(updatedTrack?.clips[0]?.id).toBe(clip.id);
    });

    it('removeClip: clip is removed from the track', () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      const clip = createClip(
        'asset-1' as ReturnType<typeof createClip>['assetId'],
        track.id,
        { timelineIn: 0, timelineOut: 30 },
      );
      store.getState().addClip(track.id, clip);
      store.getState().removeClip(track.id, clip.id);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.clips).toHaveLength(0);
    });

    it('moveClip: updates timelineIn/Out, sourceIn/Out unchanged', () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      const clip = createClip(
        'asset-1' as ReturnType<typeof createClip>['assetId'],
        track.id,
        { timelineIn: 0, timelineOut: 30, sourceIn: 5, sourceOut: 35 },
      );
      store.getState().addClip(track.id, clip);
      store.getState().moveClip(track.id, clip.id, 60);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      const updatedClip = updatedTrack?.clips[0];
      expect(updatedClip?.timelineIn).toBe(60);
      expect(updatedClip?.timelineOut).toBe(90);
      expect(updatedClip?.sourceIn).toBe(5);
      expect(updatedClip?.sourceOut).toBe(35);
    });

    it('moveClipToTrack: clip moves from one track to another', () => {
      const tracks = store.getState().project.composition.tracks;
      const fromTrack = tracks[0];
      const toTrack = tracks[1];
      if (!fromTrack || !toTrack) throw new Error('Need at least 2 tracks');
      const clip = createClip(
        'asset-1' as ReturnType<typeof createClip>['assetId'],
        fromTrack.id,
        { timelineIn: 0, timelineOut: 30 },
      );
      store.getState().addClip(fromTrack.id, clip);
      store.getState().moveClipToTrack(clip.id, fromTrack.id, toTrack.id);
      const updatedTracks = store.getState().project.composition.tracks;
      const updatedFromTrack = updatedTracks.find((t) => t.id === fromTrack.id);
      const updatedToTrack = updatedTracks.find((t) => t.id === toTrack.id);
      expect(updatedFromTrack?.clips).toHaveLength(0);
      expect(updatedToTrack?.clips).toHaveLength(1);
      expect(updatedToTrack?.clips[0]?.trackId).toBe(toTrack.id);
    });
  });

  describe('asset actions', () => {
    it('addAsset: asset appears in project.assets', () => {
      const asset = createAsset('video', '/path/to/video.mp4');
      store.getState().addAsset(asset);
      expect(store.getState().project.assets).toHaveLength(1);
      expect(store.getState().project.assets[0]?.id).toBe(asset.id);
    });

    it('removeAsset: asset removed from project.assets', () => {
      const asset = createAsset('video', '/path/to/video.mp4');
      store.getState().addAsset(asset);
      store.getState().removeAsset(asset.id);
      expect(store.getState().project.assets).toHaveLength(0);
    });
  });

  describe('track actions', () => {
    it("setTrackName: track's name updated", () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      store.getState().setTrackName(track.id, 'My Track');
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.name).toBe('My Track');
    });

    it("setTrackLocked: track's locked flag updated", () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      store.getState().setTrackLocked(track.id, true);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.locked).toBe(true);
    });

    it("setTrackVisible: track's visible flag updated", () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      store.getState().setTrackVisible(track.id, false);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.visible).toBe(false);
    });

    it("setTrackVolume: track's volume updated", () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      store.getState().setTrackVolume(track.id, 0.5);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.volume).toBe(0.5);
    });

    it('setTrackVolume: clamps to 0', () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      store.getState().setTrackVolume(track.id, -0.5);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.volume).toBe(0);
    });

    it('setTrackVolume: clamps to 1', () => {
      const track = store.getState().project.composition.tracks[0];
      if (!track) throw new Error('No track found');
      store.getState().setTrackVolume(track.id, 1.5);
      const updatedTrack = store
        .getState()
        .project.composition.tracks.find((t) => t.id === track.id);
      expect(updatedTrack?.volume).toBe(1);
    });
  });

  describe('undo/redo', () => {
    it('undo: after mutation, undo() restores previous state', () => {
      const originalName = store.getState().project.name;
      store.getState().updateProject((doc) => ({ ...doc, name: 'Mutated' }));
      expect(store.getState().project.name).toBe('Mutated');

      store.temporal.getState().undo();
      expect(store.getState().project.name).toBe(originalName);
    });

    it('redo: after undo, redo() re-applies the mutation', () => {
      store.getState().updateProject((doc) => ({ ...doc, name: 'Mutated' }));
      store.temporal.getState().undo();
      store.temporal.getState().redo();
      expect(store.getState().project.name).toBe('Mutated');
    });

    it('multiple undos: 3 mutations → undo 3 times → back to initial', () => {
      const originalName = store.getState().project.name;
      store.getState().updateProject((doc) => ({ ...doc, name: 'Step1' }));
      store.getState().updateProject((doc) => ({ ...doc, name: 'Step2' }));
      store.getState().updateProject((doc) => ({ ...doc, name: 'Step3' }));
      expect(store.getState().project.name).toBe('Step3');

      store.temporal.getState().undo();
      store.temporal.getState().undo();
      store.temporal.getState().undo();
      expect(store.getState().project.name).toBe(originalName);
    });

    it('undo after new mutation clears redo stack', () => {
      store.getState().updateProject((doc) => ({ ...doc, name: 'A' }));
      store.getState().updateProject((doc) => ({ ...doc, name: 'B' }));
      store.temporal.getState().undo();
      // now at A, redo stack has B
      store.getState().updateProject((doc) => ({ ...doc, name: 'C' }));
      // redo stack should be cleared
      store.temporal.getState().redo();
      // redo should do nothing since stack was cleared
      expect(store.getState().project.name).toBe('C');
    });

    it('setProject is undoable', () => {
      const originalProject = store.getState().project;
      const newProject = createProject({ name: 'Replacement' });
      store.getState().setProject(newProject);
      expect(store.getState().project.name).toBe('Replacement');

      store.temporal.getState().undo();
      expect(store.getState().project.id).toBe(originalProject.id);
    });

    it('transport store changes do NOT affect project history', () => {
      const projectStore = createProjectStore();
      const transportStore = createTransportStore();

      // Mutate project once to establish a baseline
      projectStore.getState().updateProject((doc) => ({ ...doc, name: 'ProjectMutation' }));
      const pastCountAfterProjectMutation =
        projectStore.temporal.getState().pastStates.length;

      // Mutate transport many times
      transportStore.getState().setPlayheadFrame(100);
      transportStore.getState().play();
      transportStore.getState().setPlaybackRate(2);

      // Project temporal should have no new entries
      expect(projectStore.temporal.getState().pastStates.length).toBe(
        pastCountAfterProjectMutation,
      );
    });
  });
});
