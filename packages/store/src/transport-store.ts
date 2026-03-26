import { createStore } from 'zustand/vanilla';

export interface TransportState {
  playheadFrame: number;
  isPlaying: boolean;
  playbackRate: number;
  loopEnabled: boolean;
  loopStartFrame: number;
  loopEndFrame: number;
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
}

export type TransportStore = TransportState & TransportActions;

export const DEFAULT_TRANSPORT_STATE: TransportState = {
  playheadFrame: 0,
  isPlaying: false,
  playbackRate: 1,
  loopEnabled: false,
  loopStartFrame: 0,
  loopEndFrame: 0,
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
  }));
}
