// App-level View system, modeled on DaVinci Resolve's Page tabs (Media / Cut /
// Edit / Color / Deliver). Each app view is a full-screen workspace. The
// bottom tab strip switches between them at any time.
//
// Adding a new view = appending one entry to APP_VIEWS. The shell does not
// branch on view id; it consults the registry to render the strip and
// dispatches to view-specific render blocks in main.tsx via the active id.

export type AppViewId = 'projects' | 'editor';

export type AppView = {
  id: AppViewId;
  label: string;
  iconName: 'folder' | 'record' | 'timeline' | 'sliders' | 'export' | 'frame' | 'cursor';
  // When true, the view is omitted from the bottom strip but is still a real
  // app view (reachable programmatically). Currently unused; kept on the type
  // so future views can opt out of the strip without re-plumbing.
  hiddenFromStrip?: boolean;
};

// The main window has exactly two views. Recording is a SEPARATE Electron
// BrowserWindow (recordingLauncherShell, opened by the top-right Record button),
// not a tab in here.
export const APP_VIEWS: ReadonlyArray<AppView> = [
  { id: 'projects', label: 'Projects', iconName: 'folder' },
  { id: 'editor', label: 'Recording edit', iconName: 'timeline' },
];

export const DEFAULT_APP_VIEW_ID: AppViewId = 'projects';
