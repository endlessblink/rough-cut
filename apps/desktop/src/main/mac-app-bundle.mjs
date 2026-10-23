import { join } from 'node:path';

// The Mac app keeps Electron's executable name (Contents/MacOS/Electron) so its helper apps are still found, which makes
// Electron report app.isPackaged = false. Without a launcher script (Linux sets these in run.sh) a double-clicked Mac app
// then took the dev path and loaded the Vite server: a black window (2026-10-23). The app inside the bundle's own
// Resources/app is the release; a dev run on a Mac loads apps/desktop instead.
export function isMacReleaseBundle({ platform = process.platform, appPath, resourcesPath = process.resourcesPath } = {}) {
  if (platform !== 'darwin' || typeof appPath !== 'string' || typeof resourcesPath !== 'string') return false;
  return appPath === join(resourcesPath, 'app');
}

// Gives the Mac release the same start as the Linux launcher: the built renderer, opening in the editor.
export function applyMacReleaseLaunchEnv(env = process.env, options = {}) {
  if (!isMacReleaseBundle(options)) return false;
  env.ROUGH_CUT_LOAD_BUILT_RENDERER ??= '1';
  env.ROUGH_CUT_STARTUP_MODE ??= 'editor';
  return true;
}
