import { createProject } from '../../packages/project-model/src/index.js';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test('edit timeline can add and remove empty channels', async ({ appPage }) => {
  test.setTimeout(45_000);

  const project = createProject({ name: 'Track Management E2E Fixture' });

  await appPage.evaluate(
    (nextProject) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(null);
      stores?.project.getState().setActiveAssetId(null);
      stores?.transport.getState().seekToFrame(0);
    },
    project,
  );

  await navigateToTab(appPage, 'edit');

  const initialTracks = await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.project.getState().project.composition.tracks.map((track: any) => ({
      id: track.id,
      name: track.name,
      type: track.type,
      clipCount: track.clips.length,
    }));
  });

  expect(initialTracks.length).toBeGreaterThanOrEqual(2);

  const initialVideoCount = initialTracks.filter((track: any) => track.type === 'video').length;
  const initialAudioCount = initialTracks.filter((track: any) => track.type === 'audio').length;
  const nextVideoName = `Video ${initialVideoCount + 1}`;
  const nextAudioName = `Audio ${initialAudioCount + 1}`;

  await appPage.getByTestId('btn-add-video-track').click();
  await appPage.getByTestId('btn-add-audio-track').click();

  await appPage.waitForFunction((trackCount) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return (stores?.project.getState().project.composition.tracks.length ?? 0) === trackCount + 2;
  }, initialTracks.length);

  const afterAdd = await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.project.getState().project.composition.tracks.map((track: any) => ({
      id: track.id,
      name: track.name,
      type: track.type,
      clipCount: track.clips.length,
    }));
  });

  expect(afterAdd).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: nextVideoName, type: 'video', clipCount: 0 }),
      expect.objectContaining({ name: nextAudioName, type: 'audio', clipCount: 0 }),
    ]),
  );

  const removableAudioTrack = afterAdd.find((track: any) => track.name === nextAudioName);
  expect(removableAudioTrack?.clipCount).toBe(0);

  await appPage.getByTestId(`remove-track-${removableAudioTrack.id}`).click();

  await appPage.waitForFunction((trackId) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const tracks = stores?.project.getState().project.composition.tracks ?? [];
    return !tracks.some((track: any) => track.id === trackId);
  }, removableAudioTrack.id);

  const afterRemove = await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.project.getState().project.composition.tracks.map((track: any) => track.name);
  });

  expect(afterRemove).toEqual([
    ...initialTracks.filter((track: any) => track.type === 'video').map((track: any) => track.name),
    nextVideoName,
    ...initialTracks.filter((track: any) => track.type === 'audio').map((track: any) => track.name),
  ]);
});
