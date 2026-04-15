import { createStore } from 'zustand/vanilla';

export type RecordingMode = 'fullscreen' | 'window' | 'region';

export interface RecordingConfigState {
  recordMode: RecordingMode;
  selectedSourceId: string | null;
  micEnabled: boolean;
  sysAudioEnabled: boolean;
  cameraEnabled: boolean;
  selectedMicDeviceId: string | null;
  selectedCameraDeviceId: string | null;
  selectedSystemAudioSourceId: string | null;
  hydrated: boolean;
}

export type RecordingConfigPatch = Partial<Omit<RecordingConfigState, 'hydrated'>>;

export interface RecordingConfigActions {
  hydrate: (patch?: RecordingConfigPatch) => void;
  updateConfig: (patch: RecordingConfigPatch) => void;
  reset: () => void;
}

export type RecordingConfigStore = RecordingConfigState & RecordingConfigActions;

export const DEFAULT_RECORDING_CONFIG_STATE: RecordingConfigState = {
  recordMode: 'fullscreen',
  selectedSourceId: null,
  micEnabled: true,
  sysAudioEnabled: true,
  cameraEnabled: true,
  selectedMicDeviceId: null,
  selectedCameraDeviceId: null,
  selectedSystemAudioSourceId: null,
  hydrated: false,
};

export function createRecordingConfigStore() {
  return createStore<RecordingConfigStore>((set) => ({
    ...DEFAULT_RECORDING_CONFIG_STATE,
    hydrate: (patch = {}) => set((state) => ({ ...state, ...patch, hydrated: true })),
    updateConfig: (patch) => {
      if (Object.keys(patch).length === 0) return;
      set((state) => ({ ...state, ...patch }));
    },
    reset: () => set({ ...DEFAULT_RECORDING_CONFIG_STATE }),
  }));
}
