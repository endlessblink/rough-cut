import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';

test('edit timeline can add and remove empty channels', async ({ appPage }) => {
  test.setTimeout(45_000);

  await navigateToTab(appPage, 'record');

  const project = (await appPage.evaluate(
    (projectPath) =>
      (
        window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
      ).roughcut.projectOpenPath(projectPath),
    RECORDED_PROJECT_PATH,
  )) as Record<string, any>;

  const recording = project.assets.find((asset: any) => asset.type === 'recording') ?? null;

  await appPage.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: project,
      projectPath: RECORDED_PROJECT_PATH,
      activeAssetId: recording?.id ?? null,
    },
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
