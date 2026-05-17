// Resolve "what does the right-click menu act on?" given the current
// selection state + the right-clicked card. Finder pattern (sans
// auto-replace-selection): if the right-clicked card is in the active
// selection, the action operates on the whole selection; otherwise it
// operates on just that one card.
//
// Pure function — owns no React state. Lives in a .mjs so it can be
// imported in tests without a bundler.
export function resolveContextTargets({ summaries, selection, targetPath }) {
  const list = Array.isArray(summaries) ? summaries : [];
  const sel = selection instanceof Set ? selection : new Set(selection ?? []);
  if (sel.has(targetPath)) {
    return list.filter((summary) => sel.has(summary?.path));
  }
  const single = list.find((summary) => summary?.path === targetPath);
  return single ? [single] : [];
}
