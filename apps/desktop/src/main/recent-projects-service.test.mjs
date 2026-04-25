import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRecentProjectsService,
  DEFAULT_RECORDING_CONFIG,
} from './recent-projects-service.mjs';

function createFakeStore(initial = {}) {
  const state = {
    recentProjects: [],
    recordingLocation: '',
    favoriteLocations: [],
    recordingConfig: DEFAULT_RECORDING_CONFIG,
    ...initial,
  };

  return {
    get(key) {
      return state[key];
    },
    set(key, value) {
      state[key] = value;
    },
    snapshot() {
      return structuredClone(state);
    },
  };
}

test('getRecentProjects prunes stale entries and persists the filtered list', () => {
  const root = mkdtempSync(join(tmpdir(), 'rough-cut-recents-'));
  const existingPath = join(root, 'existing.roughcut');
  writeFileSync(existingPath, '{}');

  const store = createFakeStore({
    recentProjects: [
      { filePath: existingPath, name: 'Existing', modifiedAt: '2026-04-20T10:00:00.000Z' },
      { filePath: join(root, 'missing.roughcut'), name: 'Missing', modifiedAt: '2026-04-20T11:00:00.000Z' },
    ],
  });
  const service = createRecentProjectsService(store);

  const projects = service.getRecentProjects();

  assert.equal(projects.length, 1);
  assert.equal(projects[0].filePath, existingPath);
  assert.deepEqual(store.snapshot().recentProjects, projects);
});

test('getRecordingLocation clears missing paths back to the default empty value', () => {
  const missingPath = join(tmpdir(), 'rough-cut-missing-location');
  const store = createFakeStore({ recordingLocation: missingPath });
  const service = createRecentProjectsService(store);

  assert.equal(service.getRecordingLocation(), '');
  assert.equal(store.snapshot().recordingLocation, '');
});

test('favorite locations stay unique and auto-zoom intensity round-trips', () => {
  const store = createFakeStore();
  const service = createRecentProjectsService(store);

  service.addFavoriteLocation('/tmp/projects');
  service.addFavoriteLocation('/tmp/projects');
  service.addFavoriteLocation('/tmp/archive');
  service.removeFavoriteLocation('/tmp/projects');
  service.setAutoZoomIntensity(0.75);

  assert.deepEqual(service.getFavoriteLocations(), ['/tmp/archive']);
  assert.equal(service.getAutoZoomIntensity(), 0.75);

  store.set('autoZoomIntensity', 2);
  assert.equal(service.getAutoZoomIntensity(), 0.5);
});

test('recording config normalization keeps only supported values', () => {
  const root = mkdtempSync(join(tmpdir(), 'rough-cut-recording-config-'));
  const validDir = join(root, 'captures');
  mkdirSync(validDir, { recursive: true });

  const store = createFakeStore();
  const service = createRecentProjectsService(store);

  service.setRecordingConfig({
    recordMode: 'side-by-side',
    selectedSourceId: 123,
    micEnabled: 'yes',
    sysAudioEnabled: false,
    cameraEnabled: 'sometimes',
    countdownSeconds: 9,
    selectedMicDeviceId: 'mic-1',
    selectedCameraDeviceId: undefined,
    selectedSystemAudioSourceId: 'sys-1',
    micInputGainPercent: 12.7,
    systemAudioGainPercent: 101,
  });
  service.setRecordingLocation(validDir);

  assert.deepEqual(service.getRecordingConfig(), {
    recordMode: 'fullscreen',
    selectedSourceId: null,
    micEnabled: true,
    sysAudioEnabled: false,
    cameraEnabled: true,
    countdownSeconds: 3,
    selectedMicDeviceId: 'mic-1',
    selectedCameraDeviceId: null,
    selectedSystemAudioSourceId: 'sys-1',
    micInputGainPercent: 13,
    systemAudioGainPercent: 100,
  });
  assert.equal(service.getRecordingLocation(), validDir);
});
