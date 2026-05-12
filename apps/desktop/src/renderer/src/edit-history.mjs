export const EMPTY_EDIT_HISTORY = Object.freeze({ undo: [], redo: [] });

export function recordEdit(history, snapshot, limit = 50) {
  return {
    undo: [...history.undo.slice(Math.max(0, history.undo.length - limit + 1)), snapshot],
    redo: [],
  };
}

export function undoEdit(history, current) {
  if (history.undo.length === 0) return { snapshot: null, history };
  const snapshot = history.undo[history.undo.length - 1];
  return {
    snapshot,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [current, ...history.redo],
    },
  };
}

export function redoEdit(history, current) {
  if (history.redo.length === 0) return { snapshot: null, history };
  const snapshot = history.redo[0];
  return {
    snapshot,
    history: {
      undo: [...history.undo, current],
      redo: history.redo.slice(1),
    },
  };
}
