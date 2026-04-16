import Store from 'electron-store';
import { existsSync } from 'node:fs';

const MAX_RECENT = 20;

const schema = {
  recentProjects: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        name: { type: 'string' },
        modifiedAt: { type: 'string' },
        resolution: { type: 'string' },
        assetCount: { type: 'number' },
        thumbnailPath: { type: 'string' },
      },
      required: ['filePath', 'name', 'modifiedAt'],
    },
    default: [],
  },
  recordingLocation: {
    type: 'string',
    default: '', // empty = use ~/Documents/Rough Cut (the auto-save default)
  },
  favoriteLocations: {
    type: 'array',
    items: { type: 'string' },
    default: [],
  },
  recordingConfig: {
    type: 'object',
    properties: {
      recordMode: { type: ['string', 'null'] },
      selectedSourceId: { type: ['string', 'null'] },
      micEnabled: { type: 'boolean' },
      sysAudioEnabled: { type: 'boolean' },
      cameraEnabled: { type: 'boolean' },
      countdownSeconds: { type: 'number' },
      selectedMicDeviceId: { type: ['string', 'null'] },
      selectedCameraDeviceId: { type: ['string', 'null'] },
      selectedSystemAudioSourceId: { type: ['string', 'null'] },
    },
    default: {
      recordMode: 'fullscreen',
      selectedSourceId: null,
      micEnabled: true,
      sysAudioEnabled: true,
      cameraEnabled: true,
      countdownSeconds: 3,
      selectedMicDeviceId: null,
      selectedCameraDeviceId: null,
      selectedSystemAudioSourceId: null,
    },
  },
};

const store = new Store({ name: 'app-settings', schema });

/**
 * Get the list of recent projects. Stale entries (file no longer on disk) are
 * removed silently and the pruned list is persisted before returning.
 * @returns {Array<{filePath: string, name: string, modifiedAt: string, resolution?: string, assetCount?: number}>}
 */
export function getRecentProjects() {
  const all = store.get('recentProjects');
  const valid = all.filter((entry) => existsSync(entry.filePath));
  if (valid.length !== all.length) {
    store.set('recentProjects', valid);
  }
  return valid;
}

/**
 * Add or update a project in the recents list, moving it to the top.
 * Trims the list to MAX_RECENT entries.
 * @param {{ filePath: string, name: string, modifiedAt: string, resolution?: string, assetCount?: number }} entry
 */
export function addRecentProject({
  filePath,
  name,
  modifiedAt,
  resolution,
  assetCount,
  thumbnailPath,
}) {
  const all = store.get('recentProjects');
  const filtered = all.filter((e) => e.filePath !== filePath);
  const updated = [
    {
      filePath,
      name,
      modifiedAt,
      ...(resolution !== undefined && { resolution }),
      ...(assetCount !== undefined && { assetCount }),
      ...(thumbnailPath !== undefined && { thumbnailPath }),
    },
    ...filtered,
  ].slice(0, MAX_RECENT);
  store.set('recentProjects', updated);
}

/**
 * Remove a project from the recents list by file path.
 * @param {string} filePath
 */
export function removeRecentProject(filePath) {
  const all = store.get('recentProjects');
  store.set(
    'recentProjects',
    all.filter((e) => e.filePath !== filePath),
  );
}

/**
 * Clear all recent projects.
 */
export function clearRecentProjects() {
  store.set('recentProjects', []);
}

/**
 * Get the configured recording location.
 * Returns an empty string if not set or if the stored path no longer exists on disk.
 * Caller should fall back to ~/Documents/Rough Cut when this returns empty string.
 * @returns {string}
 */
export function getRecordingLocation() {
  const location = store.get('recordingLocation') || '';
  // If the stored path doesn't exist, reset to default
  if (location && !existsSync(location)) {
    store.set('recordingLocation', '');
    return '';
  }
  return location;
}

/**
 * Set the recording location path.
 * @param {string} path
 */
export function setRecordingLocation(path) {
  store.set('recordingLocation', path);
}

/**
 * Get all favorite locations.
 * @returns {string[]}
 */
export function getFavoriteLocations() {
  return store.get('favoriteLocations');
}

/**
 * Add a path to favorites if it is not already present.
 * @param {string} path
 */
export function addFavoriteLocation(path) {
  const favs = store.get('favoriteLocations');
  if (!favs.includes(path)) {
    store.set('favoriteLocations', [...favs, path]);
  }
}

/**
 * Remove a path from favorites.
 * @param {string} path
 */
export function removeFavoriteLocation(path) {
  const favs = store.get('favoriteLocations');
  store.set(
    'favoriteLocations',
    favs.filter((f) => f !== path),
  );
}

export function getRecordingConfig() {
  return store.get('recordingConfig');
}

export function setRecordingConfig(config) {
  store.set('recordingConfig', config);
}
