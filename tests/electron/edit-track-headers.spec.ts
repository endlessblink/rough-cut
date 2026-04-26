import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { existsSync } from 'node:fs';
import { PLAYBACK_PROJECT_PATH } from './fixtures/playback-fixture.js';

const RECORDED_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  (existsSync('/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut')
    ? '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut'
    : PLAYBACK_PROJECT_PATH);

test('edit timeline exposes track header controls and updates track state', async ({ appPage }) => {
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

  const tracks = await appPage.evaluate(() => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return stores?.project.getState().project.composition.tracks.map((track: any) => ({
      id: track.id,
      type: track.type,
    }));
  });

  const videoTrack = tracks.find((track: any) => track.type === 'video');
  const audioTrack = tracks.find((track: any) => track.type === 'audio');
  expect(videoTrack).toBeTruthy();
  expect(audioTrack).toBeTruthy();

  await expect(appPage.getByTestId(`btn-mute-${videoTrack.id}`)).toBeVisible();
  await expect(appPage.getByTestId(`btn-solo-${videoTrack.id}`)).toBeVisible();
  await expect(appPage.getByTestId(`btn-lock-${videoTrack.id}`)).toBeVisible();
  await expect(appPage.getByTestId(`track-volume-${audioTrack.id}`)).toBeVisible();

  await appPage.getByTestId(`btn-mute-${videoTrack.id}`).click();
  await appPage.waitForFunction((trackId) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return (
      stores?.project
        .getState()
        .project.composition.tracks.find((track: any) => track.id === trackId)?.visible === false
    );
  }, videoTrack.id);

  await appPage.getByTestId(`btn-lock-${videoTrack.id}`).click();
  await appPage.waitForFunction((trackId) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    return (
      stores?.project
        .getState()
        .project.composition.tracks.find((track: any) => track.id === trackId)?.locked === true
    );
  }, videoTrack.id);

  await appPage.getByTestId(`btn-solo-${videoTrack.id}`).click();
  await expect(appPage.getByTestId(`track-row-${audioTrack.id}`)).toHaveCSS('opacity', '0.45');

  await appPage.getByTestId(`track-volume-${audioTrack.id}`).fill('0.5');
  await appPage.waitForFunction((trackId) => {
    const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
    const volume = stores?.project
      .getState()
      .project.composition.tracks.find((track: any) => track.id === trackId)?.volume;
    return Math.abs((volume ?? 0) - 0.5) < 0.001;
  }, audioTrack.id);
});
