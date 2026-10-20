// Notices when the open project's file is changed by someone else (an agent,
// another tool) and stops the app from saving its older copy over that change.
//
// Every write this app makes goes through saveProjectFile, which calls
// noteOwnProjectWrite; anything else that changes the file is "outside". The
// file's identity is its inode, size and change time: saves replace the file
// (atomic rename), so a new inode alone already tells a replaced file apart.
import { watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

export const PROJECT_CHANGED_ON_DISK = 'PROJECT_CHANGED_ON_DISK';

export function stampOf(info) {
  if (!info?.isFile?.()) return null;
  return `${info.ino}:${info.size}:${Math.round(info.mtimeMs)}`;
}

export function createProjectDiskWatch({ statFile = stat, watchDir = watch, onOutsideChange, debounceMs = 250 } = {}) {
  const known = new Map(); // path -> stamp of the last version this app read or wrote
  let watched = null; // { path, watcher, timer }

  async function currentStamp(path) {
    return stampOf(await statFile(path).catch(() => null));
  }

  async function remember(path) {
    known.set(path, await currentStamp(path));
  }

  async function check(path) {
    if (!known.has(path)) return false;
    const now = await currentStamp(path);
    if (now === null || now === known.get(path)) return false;
    return true;
  }

  function stopWatching() {
    if (!watched) return;
    clearTimeout(watched.timer);
    try { watched.watcher.close(); } catch { /* already closed */ }
    watched = null;
  }

  return {
    /** The app opened this project: remember its version and watch for outside changes. */
    async opened(path) {
      await remember(path);
      if (watched?.path === path) return;
      stopWatching();
      let watcher;
      try {
        // Watch the folder: a replaced file (atomic save) ends a watch on the file itself.
        watcher = watchDir(dirname(path), (_event, name) => {
          if (name && String(name) !== basename(path)) return;
          clearTimeout(watched?.timer);
          if (!watched) return;
          watched.timer = setTimeout(async () => {
            if (await check(path)) onOutsideChange?.(path);
          }, debounceMs);
        });
      } catch {
        return;
      }
      watched = { path, watcher, timer: null };
    },
    /** This app just wrote the file itself. */
    noteOwnWrite: remember,
    /** True when the file on disk is newer than what this app last read or wrote. */
    changedOutside: check,
    /** The app reloaded or chose to keep its own copy: the disk version is now the known one. */
    accept: remember,
    stop: stopWatching,
  };
}
