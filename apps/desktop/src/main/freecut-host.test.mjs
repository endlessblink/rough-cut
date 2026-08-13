import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAsset, createClip, createProject, createTrack } from '../../../../packages/project-model/dist/index.js';
import { createFreecutHost, fromFreecutProject, freecutCanvasResolution, toFreecutProject } from './freecut-host.mjs';
import { saveProjectFile } from './project-files.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-freecut-host-'));
  const screenPath = join(root, 'recording.mp4');
  const micPath = join(root, 'mic.wav');
  await writeFile(screenPath, 'screen');
  await writeFile(micPath, 'audio');
  const screen = createAsset('recording', screenPath, { duration: 90, metadata: { width: 1920, height: 1080, fps: 30 } });
  const mic = createAsset('audio', micPath, { duration: 90, metadata: { fps: 30 } });
  const screenTrack = createTrack('video', { name: 'Screen Recording', index: 0 });
  const audioTrack = createTrack('audio', { name: 'Recording Audio', index: 1 });
  const screenClip = createClip(screen.id, screenTrack.id, { timelineIn: 0, timelineOut: 90, sourceIn: 0, sourceOut: 90 });
  const audioClip = createClip(mic.id, audioTrack.id, { timelineIn: 0, timelineOut: 90, sourceIn: 0, sourceOut: 90 });
  const document = createProject({
    id: 'rough-cut-demo',
    name: 'Demo project',
    assets: [screen, mic],
    composition: { duration: 90, tracks: [{ ...screenTrack, clips: [screenClip] }, { ...audioTrack, clips: [audioClip] }], transitions: [] },
  });
  const projectPath = join(root, 'demo.roughcut');
  await saveProjectFile(projectPath, document);
  return { root, screenPath, micPath, document, projectPath };
}

test('FreeCut host exposes the real shared screen and audio timeline', async () => {
  const { root, screenPath, micPath, document } = await fixture();
  const host = createFreecutHost({ recordingsDir: root, allowedRoots: [root] });
  const snapshot = await host.getSnapshot();
  const project = snapshot.projects[0];
  assert.equal(project.id, document.id);
  assert.deepEqual(project.timeline.items.map((item) => item.mediaId), [document.assets[0].id, document.assets[1].id]);
  assert.equal(project.timeline.tracks.find((track) => track.kind === 'audio')?.name, 'Recording Audio');
  assert.equal(project.timeline.items.find((item) => item.trackId === project.timeline.tracks.find((track) => track.kind === 'audio')?.id)?.type, 'audio');
  assert.deepEqual(project.media.map((item) => item.id), document.assets.map((asset) => asset.id));
  assert.deepEqual(await host.resolveMedia(document.id, document.assets[0].id), { path: screenPath, size: 6, mimeType: 'video/mp4' });
  assert.deepEqual(await host.resolveMedia(document.id, document.assets[1].id), { path: micPath, size: 5, mimeType: 'audio/wav' });
});

test('FreeCut round-trip preserves shared timeline edits and original project fields', async () => {
  const { document } = await fixture();
  const freecut = toFreecutProject(document, '/tmp/demo.roughcut');
  const edited = {
    ...freecut,
    timeline: {
      ...freecut.timeline,
      items: freecut.timeline.items.map((item, index) => index === 0 ? { ...item, from: 12, durationInFrames: 60 } : item),
    },
  };
  const restored = fromFreecutProject(edited, document);
  assert.equal(restored.name, document.name);
  assert.equal(restored.composition.tracks[0].clips[0].timelineIn, 12);
  assert.equal(restored.composition.tracks[0].clips[0].timelineOut, 72);
  assert.equal(restored.composition.tracks[1].clips[0].assetId, document.assets[1].id);
});

test('legacy flattened timeline is reseeded from the canonical recording tracks', async () => {
  const { root, document, projectPath } = await fixture();
  const legacy = {
    ...document,
    freecutTimeline: {
      tracks: [{ id: 'legacy-track' }],
      items: [{ id: 'legacy-item', trackId: 'legacy-track', mediaId: `${document.assets[0].id}__program` }],
    },
  };
  await saveProjectFile(projectPath, legacy);
  const host = createFreecutHost({ recordingsDir: root, allowedRoots: [root] });
  const project = (await host.getSnapshot()).projects[0];
  assert.deepEqual(project.timeline.items.map((item) => item.mediaId), document.assets.map((asset) => asset.id));
});

test('legacy recording without an audio lane is repaired when opened', async () => {
  const { root, document, projectPath } = await fixture();
  const legacy = {
    ...document,
    composition: {
      ...document.composition,
      tracks: [document.composition.tracks[0]],
    },
    freecutTimeline: null,
  };
  await saveProjectFile(projectPath, legacy);
  const host = createFreecutHost({ recordingsDir: root, allowedRoots: [root] });
  const project = (await host.getSnapshot()).projects[0];
  const audioTrack = project.timeline.tracks.find((track) => track.kind === 'audio');
  assert.equal(audioTrack?.name, 'Recording Audio');
  assert.equal(project.timeline.items.find((item) => item.trackId === audioTrack.id)?.mediaId, document.assets[0].id);
});

test('FreeCut uses the project canvas resolution', () => {
  assert.deepEqual(freecutCanvasResolution({ settings: { aspectRatio: '1:1', resolution: { width: 1920, height: 1080 } } }), { width: 1920, height: 1920 });
});
