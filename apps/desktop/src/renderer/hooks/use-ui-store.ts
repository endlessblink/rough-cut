import { useSyncExternalStore } from 'react';

export interface UiState {
  isRightSidebarCollapsed: boolean;
}

export interface UiActions {
  toggleRightSidebar: () => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
}

export type UiStore = UiState & UiActions;

// Minimal vanilla store — no external dependency needed.
function createUiStore(): UiStore & {
  subscribe: (listener: () => void) => () => void;
  getState: () => UiStore;
} {
  let state: UiState = { isRightSidebarCollapsed: false };
  const listeners = new Set<() => void>();

  function setState(patch: Partial<UiState>): void {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  }

  const actions: UiActions = {
    toggleRightSidebar: () => setState({ isRightSidebarCollapsed: !state.isRightSidebarCollapsed }),
    setRightSidebarCollapsed: (collapsed: boolean) => setState({ isRightSidebarCollapsed: collapsed }),
  };

  function getState(): UiStore {
    return { ...state, ...actions };
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { ...getState(), subscribe, getState };
}

const _store = createUiStore();

export const uiStore = {
  subscribe: _store.subscribe,
  getState: _store.getState,
};

export function useUiStore<T>(selector: (state: UiStore) => T): T {
  return useSyncExternalStore(uiStore.subscribe, () => selector(uiStore.getState()));
}
