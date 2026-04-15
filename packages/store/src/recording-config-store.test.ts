import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createRecordingConfigStore,
  DEFAULT_RECORDING_CONFIG_STATE,
} from './recording-config-store.js';
import type { RecordingConfigStore } from './recording-config-store.js';

describe('recordingConfigStore', () => {
  let store: StoreApi<RecordingConfigStore>;

  beforeEach(() => {
    store = createRecordingConfigStore();
  });

  it('has the expected defaults', () => {
    const state = store.getState();
    expect(state.recordMode).toBe('fullscreen');
    expect(state.selectedSourceId).toBeNull();
    expect(state.micEnabled).toBe(true);
    expect(state.sysAudioEnabled).toBe(true);
    expect(state.cameraEnabled).toBe(true);
    expect(state.hydrated).toBe(false);
  });

  it('matches DEFAULT_RECORDING_CONFIG_STATE', () => {
    const state = store.getState();
    expect(state.recordMode).toBe(DEFAULT_RECORDING_CONFIG_STATE.recordMode);
    expect(state.selectedSourceId).toBe(DEFAULT_RECORDING_CONFIG_STATE.selectedSourceId);
    expect(state.micEnabled).toBe(DEFAULT_RECORDING_CONFIG_STATE.micEnabled);
    expect(state.sysAudioEnabled).toBe(DEFAULT_RECORDING_CONFIG_STATE.sysAudioEnabled);
    expect(state.cameraEnabled).toBe(DEFAULT_RECORDING_CONFIG_STATE.cameraEnabled);
  });

  it('updateConfig merges partial patches', () => {
    store.getState().updateConfig({
      recordMode: 'window',
      selectedSourceId: 'window:123',
      sysAudioEnabled: false,
    });

    const state = store.getState();
    expect(state.recordMode).toBe('window');
    expect(state.selectedSourceId).toBe('window:123');
    expect(state.sysAudioEnabled).toBe(false);
    expect(state.micEnabled).toBe(true);
  });

  it('hydrate marks the store hydrated', () => {
    store.getState().hydrate({ selectedSourceId: 'screen:0:0', cameraEnabled: false });

    const state = store.getState();
    expect(state.hydrated).toBe(true);
    expect(state.selectedSourceId).toBe('screen:0:0');
    expect(state.cameraEnabled).toBe(false);
  });

  it('reset restores defaults', () => {
    store.getState().hydrate({ selectedSourceId: 'screen:0:0', micEnabled: false });
    store.getState().reset();

    const state = store.getState();
    expect(state.recordMode).toBe('fullscreen');
    expect(state.selectedSourceId).toBeNull();
    expect(state.micEnabled).toBe(true);
    expect(state.hydrated).toBe(false);
  });
});
