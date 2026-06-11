// App-level View system, modeled on DaVinci Resolve's Page tabs (Media / Cut /
// Edit / Color / Deliver). Each app view is a full-screen workspace. The
// bottom tab strip switches between them at any time.
//
// Adding a new view = appending one entry to APP_VIEWS. The shell does not
// branch on view id; it consults the registry to render the strip and
// dispatches to view-specific render blocks in main.tsx via the active id.

export type AppViewId = 'recording' | 'projects' | 'editor' | 'nle' | 'ai';

export type AppView = {
  id: AppViewId;
  label: string;
  iconName: 'folder' | 'record' | 'timeline' | 'sliders' | 'export' | 'frame' | 'cursor' | 'sparkle';
  // When true, the view is omitted from the bottom strip but is still a real
  // app view (reachable programmatically). Currently unused; kept on the type
  // so future views can opt out of the strip without re-plumbing.
  hiddenFromStrip?: boolean;
};

export const APP_VIEWS: ReadonlyArray<AppView> = [
  { id: 'recording', label: 'Recording', iconName: 'record' },
  { id: 'projects', label: 'Projects', iconName: 'folder' },
  { id: 'editor', label: 'Recording edit', iconName: 'timeline' },
  { id: 'nle', label: 'Editor', iconName: 'sliders' },
  { id: 'ai', label: 'AI', iconName: 'sparkle' },
];

export const DEFAULT_APP_VIEW_ID: AppViewId = 'recording';
