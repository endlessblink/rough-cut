import { useSyncExternalStore } from 'react';
import { createProjectStore, createTransportStore } from '@rough-cut/store';
import type { ProjectStore, TransportStore } from '@rough-cut/store';

// Singleton stores — created once, used everywhere
export const projectStore = createProjectStore();
export const transportStore = createTransportStore();

// Test hook — expose stores on window for Playwright specs (dev only).
if (typeof window !== 'undefined') {
  (window as unknown as { __roughcutStores?: unknown }).__roughcutStores = {
    project: projectStore,
    transport: transportStore,
  };
}

/**
 * React hook that subscribes to the vanilla Zustand project store.
 * Uses useSyncExternalStore for tear-free reads.
 */
export function useProjectStore<T>(selector: (state: ProjectStore) => T): T {
  return useSyncExternalStore(
    projectStore.subscribe,
    () => selector(projectStore.getState()),
  );
}

/**
 * React hook that subscribes to the vanilla Zustand transport store.
 */
export function useTransportStore<T>(selector: (state: TransportStore) => T): T {
  return useSyncExternalStore(
    transportStore.subscribe,
    () => selector(transportStore.getState()),
  );
}
