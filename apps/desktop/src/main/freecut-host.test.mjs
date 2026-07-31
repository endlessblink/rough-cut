import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAsset, createClip, createProject, createTrack } from '../../../../packages/project-model/dist/index.js';
import { createFreecutHost, fromFreecutProject, toFreecutProject } from './freecut-host.mjs';
import { saveProjectFile } from './project-files.mjs';

test('FreeCut host exposes Rough Cut projects, tracks, clips, and media URLs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-freecut-host-'));
  const mediaPath = join(root, 'recording.mp4');
  await writeFile(mediaPath, 'fixture');
  const projectPath = join(root, 'demo.roughcut');
  const asset = createAsset('recording', mediaPath, {
    duration: 90,
    metadata: { width: 1920, height: 1080, fps: 30 },
  });
  const track = createTrack('video', { name: 'Screen Recording', index: 0 });
  const clip = createClip(asset.id, track.id, {
    timelineIn: 0,
    timelineOut: 90,
    sourceIn: 0,
    sourceOut: 90,
  });
  const document = createProject({
    id: 'rough-cut-demo',
    name: 'Demo project',
    assets: [asset],
    composition: { duration: 90, tracks: [{ ...track, clips: [clip] }], transitions: [] },
  });
  await saveProjectFile(projectPath, document);

  const host = createFreecutHost({ recordingsDir: root, allowedRoots: [root] });
  const snapshot = await host.getSnapshot();
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.projects[0].id, document.id);
  assert.equal(snapshot.projects[0].timeline.items[0].mediaId, asset.id);
  assert.match(snapshot.projects[0].media[0].roughCutUrl, /__rough_cut__\/media/);
  assert.deepEqual(await host.resolveMedia(document.id, asset.id), {
    path: mediaPath,
    size: 7,
    mimeType: 'video/mp4',
  });
});

test('FreeCut host saves timeline edits back without dropping Rough Cut fields', () => {
  const original = {
    id: 'project',
    name: 'Original',
    assets: [{ id: 'asset', filePath: '/tmp/video.mp4', duration: 100 }],
    composition: {
      duration: 100,
      tracks: [{ id: 'track', type: 'video', name: 'Video', clips: [], customField: true }],
      transitions: [],
    },
    settings: { resolution: { width: 1920, height: 1080 }, frameRate: 30 },
    customProjectField: 'preserved',
  };
  const edited = toFreecutProject(original, '/tmp/project.roughcut');
  edited.timeline.items = [{
    id: 'clip', trackId: 'track', from: 10, durationInFrames: 20,
    label: 'edited', mediaId: 'asset', type: 'video', sourceStart: 2, sourceEnd: 22,
  }];
  const saved = fromFreecutProject(edited, original);
  assert.equal(saved.customProjectField, 'preserved');
  assert.equal(saved.composition.tracks[0].customField, true);
  assert.equal(saved.composition.tracks[0].clips[0].timelineIn, 10);
  assert.equal(saved.composition.tracks[0].clips[0].sourceOut, 22);
});
