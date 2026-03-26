import { useReducer, useCallback } from 'react';
import type { CaptureSource } from '../../env.js';

export type RecordingStatus =
  | 'idle'
  | 'loading-sources'
  | 'ready'
  | 'countdown'
  | 'recording'
  | 'stopping'
  | 'error';

export interface RecordState {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  status: RecordingStatus;
  error: string | null;
  elapsedMs: number;
}

type RecordAction =
  | { type: 'SET_SOURCES'; sources: CaptureSource[] }
  | { type: 'SELECT_SOURCE'; id: string }
  | { type: 'SET_STATUS'; status: RecordingStatus }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_ELAPSED'; ms: number }
  | { type: 'RESET' };

const initialState: RecordState = {
  sources: [],
  selectedSourceId: null,
  status: 'idle',
  error: null,
  elapsedMs: 0,
};

function recordReducer(state: RecordState, action: RecordAction): RecordState {
  switch (action.type) {
    case 'SET_SOURCES':
      return { ...state, sources: action.sources, status: 'ready', error: null };
    case 'SELECT_SOURCE':
      return { ...state, selectedSourceId: action.id };
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_ERROR':
      return { ...state, error: action.error, status: 'error' };
    case 'SET_ELAPSED':
      return { ...state, elapsedMs: action.ms };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

export function useRecordState() {
  const [state, dispatch] = useReducer(recordReducer, initialState);

  const setSources = useCallback(
    (sources: CaptureSource[]) => dispatch({ type: 'SET_SOURCES', sources }),
    [],
  );
  const selectSource = useCallback(
    (id: string) => dispatch({ type: 'SELECT_SOURCE', id }),
    [],
  );
  const setStatus = useCallback(
    (status: RecordingStatus) => dispatch({ type: 'SET_STATUS', status }),
    [],
  );
  const setError = useCallback(
    (error: string) => dispatch({ type: 'SET_ERROR', error }),
    [],
  );
  const setElapsedMs = useCallback(
    (ms: number) => dispatch({ type: 'SET_ELAPSED', ms }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, setSources, selectSource, setStatus, setError, setElapsedMs, reset };
}
