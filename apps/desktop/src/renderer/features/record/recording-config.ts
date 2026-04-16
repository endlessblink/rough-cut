import { useEffect, useSyncExternalStore } from 'react';
import {
  createRecordingConfigStore,
  type RecordingConfigPatch,
  type RecordingConfigStore,
} from '@rough-cut/store';

const recordingConfigStore = createRecordingConfigStore();

let recordingConfigInitialized = false;

function hydrateRecordingConfig(config: RecordingConfigPatch) {
  recordingConfigStore.getState().hydrate(config);
}

function ensureRecordingConfigSync() {
  if (recordingConfigInitialized || typeof window === 'undefined') return;
  recordingConfigInitialized = true;

  void window.roughcut
    .recordingConfigGet()
    .then((config) => {
      hydrateRecordingConfig(config);
    })
    .catch((error: unknown) => {
      console.error('[recording-config] Failed to load config:', error);
    });

  window.roughcut.onRecordingConfigChanged((config) => {
    hydrateRecordingConfig(config);
  });
}

export function updateRecordingConfig(patch: RecordingConfigPatch) {
  if (Object.keys(patch).length === 0) return;

  recordingConfigStore.getState().updateConfig(patch);

  if (typeof window === 'undefined') return;

  void window.roughcut.recordingConfigUpdate(patch).catch((error: unknown) => {
    console.error('[recording-config] Failed to persist config patch:', error);
    void window.roughcut
      .recordingConfigGet()
      .then((config) => {
        hydrateRecordingConfig(config);
      })
      .catch((refreshError: unknown) => {
        console.error(
          '[recording-config] Failed to refresh config after update error:',
          refreshError,
        );
      });
  });
}

export function useRecordingConfig<T>(selector: (state: RecordingConfigStore) => T): T {
  useEffect(() => {
    ensureRecordingConfigSync();
  }, []);

  return useSyncExternalStore(recordingConfigStore.subscribe, () =>
    selector(recordingConfigStore.getState()),
  );
}

if (typeof window !== 'undefined') {
  const currentStores = (window as unknown as { __roughcutStores?: Record<string, unknown> })
    .__roughcutStores;
  (window as unknown as { __roughcutStores?: Record<string, unknown> }).__roughcutStores = {
    ...(currentStores ?? {}),
    recordingConfig: recordingConfigStore,
  };
}
