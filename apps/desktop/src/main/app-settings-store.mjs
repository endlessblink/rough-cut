// Small app-level settings kept in the user-data folder (not in any project).
// Today: where projects (and their recordings) live. Read once at startup.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';

export function defaultAppSettingsPath(userDataDir) {
  return join(userDataDir, 'app-settings.json');
}

export function createAppSettingsStore({ filePath, onLog = () => undefined } = {}) {
  function read() {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error?.code !== 'ENOENT') onLog(`[app-settings] could not read ${filePath}: ${error?.message ?? error}`);
      return {};
    }
  }

  function write(next) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  return {
    /** The chosen projects folder, or null to use the default. A broken value is ignored, never trusted. */
    getProjectsDir() {
      const value = read().projectsDir;
      return typeof value === 'string' && isAbsolute(value) ? normalize(value) : null;
    },
    setProjectsDir(dir) {
      if (typeof dir !== 'string' || !isAbsolute(dir)) throw new Error('The projects folder must be a full path.');
      write({ ...read(), projectsDir: normalize(dir) });
      return normalize(dir);
    },
    resetProjectsDir() {
      const { projectsDir: _removed, ...rest } = read();
      write(rest);
    },
    /** Where exports are offered to be saved. Applies immediately (no restart). */
    getExportsDir() {
      const value = read().exportsDir;
      return typeof value === 'string' && isAbsolute(value) ? normalize(value) : null;
    },
    setExportsDir(dir) {
      if (typeof dir !== 'string' || !isAbsolute(dir)) throw new Error('The exports folder must be a full path.');
      write({ ...read(), exportsDir: normalize(dir) });
      return normalize(dir);
    },
    resetExportsDir() {
      const { exportsDir: _removed, ...rest } = read();
      write(rest);
    },
  };
}
