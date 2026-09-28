/**
 * Which view the shell lands on at boot.
 *
 * A deep link carries two independent instructions: which project to open
 * (`projectPath`) and which view to show (`view`). They are separate answers
 * and must not overwrite one another. The main process already encodes the
 * default — `rendererInitialView` returns `editor` for a plain project launch
 * and only returns something else when the launch explicitly asked for it —
 * so once a view reaches the renderer in the URL it is a decision, not a
 * suggestion, and opening the project must leave it alone.
 *
 * Keep the id list in step with the AppViewId union in app-views.ts; the test
 * beside this file asserts they match.
 */

export const APP_VIEW_IDS = ['recording', 'projects', 'editor', 'ai'];

/** The view the URL explicitly asked for, or null when it asked for nothing. */
export function resolveRequestedAppView(rawView) {
  const value = typeof rawView === 'string' ? rawView.trim() : '';
  return APP_VIEW_IDS.includes(value) ? value : null;
}

/**
 * The view to show once a deep-linked project has finished opening. Recording
 * edit is the canonical compositor and stays the default, but an explicit
 * request outranks it.
 */
export function resolveProjectOpenAppView(rawView) {
  return resolveRequestedAppView(rawView) ?? 'editor';
}
