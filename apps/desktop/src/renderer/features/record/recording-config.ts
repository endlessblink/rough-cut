import { useEffect, useSyncExternalStore } from 'react';
import {
  createRecordingConfigStore,
  type RecordingConfigPatch,
  type RecordingConfigStore,
} from '@rough-cut/store';

const recordingConfigStore = createRecordingConfigStore();

let recordingConfigInitPromise: Promise<void> | null = null;
let recordingConfigUnsubscribe: (() => void) | null = null;

function hydrateRecordingConfig(config: RecordingConfigPatch) {
  recordingConfigStore.getState().hydrate(config);
}

function ensureRecordingConfigSync() {
  if (recordingConfigInitPromise || typeof window === 'undefined' || !window.roughcut) return;

  if (!recordingConfigUnsubscribe) {
    recordingConfigUnsubscribe = window.roughcut.onRecordingConfigChanged((config) => {
      hydrateRecordingConfig(config);
    });
  }

  recordingConfigInitPromise = window.roughcut
    .recordingConfigGet()
    .then((config) => {
      hydrateRecordingConfig(config);
    })
    .catch((error: unknown) => {
      console.error('[recording-config] Failed to load config:', error);
      recordingConfigInitPromise = null;
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

export function subscribeRecordingConfig(
  listener: (state: RecordingConfigStore, previousState: RecordingConfigStore) => void,
) {
  ensureRecordingConfigSync();
  return recordingConfigStore.subscribe(listener);
}

if (typeof window !== 'undefined') {
  ensureRecordingConfigSync();
  const currentStores = (window as unknown as { __roughcutStores?: Record<string, unknown> })
    .__roughcutStores;
  (window as unknown as { __roughcutStores?: Record<string, unknown> }).__roughcutStores = {
    ...(currentStores ?? {}),
    recordingConfig: recordingConfigStore,
  };
}
