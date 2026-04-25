import { createStore } from 'zustand/vanilla';

export interface TransportState {
  playheadFrame: number;
  isPlaying: boolean;
  playbackRate: number;
  loopEnabled: boolean;
  loopStartFrame: number;
  loopEndFrame: number;
  /** Clip IDs currently selected in the Edit timeline. Transient (non-undoable). */
  selectedClipIds: readonly string[];
}

export interface TransportActions {
  setPlayheadFrame: (frame: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setPlaybackRate: (rate: number) => void;
  seekToFrame: (frame: number) => void;
  stepForward: (frames?: number) => void;
  stepBackward: (frames?: number) => void;
  setLoop: (enabled: boolean, startFrame?: number, endFrame?: number) => void;
  setSelectedClipIds: (clipIds: readonly string[]) => void;
  addToSelection: (clipIds: readonly string[]) => void;
  removeFromSelection: (clipIds: readonly string[]) => void;
  clearSelection: () => void;
}

export type TransportStore = TransportState & TransportActions;

export const DEFAULT_TRANSPORT_STATE: TransportState = {
  playheadFrame: 0,
  isPlaying: false,
  playbackRate: 1,
  loopEnabled: false,
  loopStartFrame: 0,
  loopEndFrame: 0,
  selectedClipIds: [],
};

export function createTransportStore() {
  return createStore<TransportStore>((set, get) => ({
    ...DEFAULT_TRANSPORT_STATE,

    setPlayheadFrame: (frame: number) => {
      set({ playheadFrame: Math.max(0, Math.round(frame)) });
    },

    play: () => {
      set({ isPlaying: true });
    },

    pause: () => {
      set({ isPlaying: false });
    },

    togglePlay: () => {
      set((state) => ({ isPlaying: !state.isPlaying }));
    },

    setPlaybackRate: (rate: number) => {
      set({ playbackRate: rate });
    },

    seekToFrame: (frame: number) => {
      set({ playheadFrame: Math.max(0, Math.round(frame)), isPlaying: false });
    },

    stepForward: (frames = 1) => {
      set((state) => ({
        playheadFrame: state.playheadFrame + Math.max(1, Math.round(frames)),
      }));
    },

    stepBackward: (frames = 1) => {
      set((state) => ({
        playheadFrame: Math.max(0, state.playheadFrame - Math.max(1, Math.round(frames))),
      }));
    },

    setLoop: (enabled: boolean, startFrame?: number, endFrame?: number) => {
      const current = get();
      set({
        loopEnabled: enabled,
        loopStartFrame: startFrame !== undefined ? startFrame : current.loopStartFrame,
        loopEndFrame: endFrame !== undefined ? endFrame : current.loopEndFrame,
      });
    },

    setSelectedClipIds: (clipIds: readonly string[]) => {
      set({ selectedClipIds: Array.from(new Set(clipIds)) });
    },

    addToSelection: (clipIds: readonly string[]) => {
      set((state) => ({
        selectedClipIds: Array.from(new Set([...state.selectedClipIds, ...clipIds])),
      }));
    },

    removeFromSelection: (clipIds: readonly string[]) => {
      const remove = new Set(clipIds);
      set((state) => ({
        selectedClipIds: state.selectedClipIds.filter((id) => !remove.has(id)),
      }));
    },

    clearSelection: () => {
      set((state) => (state.selectedClipIds.length === 0 ? state : { selectedClipIds: [] }));
    },
  }));
}
