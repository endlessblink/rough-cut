// Pure helpers for the gallery's multi-select state. The state is a
// Set<string> of project paths plus a "last clicked" anchor used for
// Shift+click range selection.
//
// The functions here are intentionally side-effect free so they can be unit
// tested without React.

export function toggleSelection(selection, path) {
  const next = new Set(selection);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

// Shift+click range: select every path from anchor..target (inclusive), in
// the order they appear in `orderedPaths`. Existing selection is unioned with
// the range (Finder behavior); pass an explicit clear if you want replace.
export function selectRange(selection, orderedPaths, anchor, target) {
  if (!anchor || anchor === target) return toggleSelection(selection, target);
  const a = orderedPaths.indexOf(anchor);
  const b = orderedPaths.indexOf(target);
  if (a < 0 || b < 0) return toggleSelection(selection, target);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const next = new Set(selection);
  for (let i = lo; i <= hi; i += 1) next.add(orderedPaths[i]);
  return next;
}

export function selectAll(orderedPaths) {
  return new Set(orderedPaths);
}

export function clearSelection() {
  return new Set();
}

// Click intent given a modifier set + current selection state + select-mode.
// The renderer reads this and either updates selection, opens the project,
// or both.
export function resolveClickIntent({ selection, summaryPath, metaKey, ctrlKey, shiftKey, selectMode = false }) {
  const mod = metaKey || ctrlKey;
  if (mod) return { kind: 'toggle' };
  if (shiftKey) return { kind: 'range' };
  // In select-mode a plain click toggles, never opens. Esc exits the mode.
  if (selectMode) return { kind: 'toggle' };
  if (selection.size > 0) {
    // Plain click during an active selection: clear it and open. Finder pattern.
    return { kind: 'clear-and-open' };
  }
  return { kind: 'open' };
}
