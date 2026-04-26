import { readFile } from 'node:fs/promises';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const PROJECTS = [
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 25 2026 - 1719.roughcut',
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 24 2026 - 0959.roughcut',
];

test.describe('legacy tmp project migration', () => {
  test('reopens real old projects, rewrites stale /tmp paths, and resolves media', async ({ appPage }) => {
    test.setTimeout(120_000);

    for (const projectPath of PROJECTS) {
      const reopenedProject = await appPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, projectPath);

      const recordingAsset = reopenedProject.assets.find((asset: any) => asset.type === 'recording') ?? null;
      expect(recordingAsset).toBeTruthy();
      expect(recordingAsset.filePath.startsWith('/home/endlessblink/Documents/Rough Cut/recordings/')).toBe(true);
      expect(recordingAsset.thumbnailPath.startsWith('/home/endlessblink/Documents/Rough Cut/recordings/')).toBe(true);

      const cameraAsset = reopenedProject.assets.find(
        (asset: any) => asset.metadata?.isCamera || asset.id === recordingAsset.cameraAssetId,
      );
      if (cameraAsset?.filePath) {
        expect(cameraAsset.filePath.startsWith('/home/endlessblink/Documents/Rough Cut/recordings/')).toBe(true);
      }

      const rewrittenProject = await readFile(projectPath, 'utf-8');
      expect(rewrittenProject.includes('/tmp/rough-cut/recordings')).toBe(false);
      expect(rewrittenProject.includes('recordings/')).toBe(true);

      const thumbnailLoads = await appPage.evaluate(async (thumbnailPath) => {
        const img = new Image();
        img.src = `media://${thumbnailPath}`;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('thumbnail-load-failed'));
        });
        return img.naturalWidth > 0 && img.naturalHeight > 0;
      }, recordingAsset.thumbnailPath);
      expect(thumbnailLoads).toBe(true);

      await navigateToTab(appPage, 'record');
      await appPage.evaluate(
        ({ nextProject, filePath, activeAssetId }) => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          stores?.project.getState().setProject(nextProject);
          stores?.project.getState().setProjectFilePath(filePath);
          stores?.project.getState().setActiveAssetId(activeAssetId);
          stores?.transport.getState().seekToFrame(0);
          stores?.transport.getState().pause();
        },
        {
          nextProject: reopenedProject,
          filePath: projectPath,
          activeAssetId: recordingAsset.id,
        },
      );

      await appPage.waitForFunction(() => {
        const video = document.querySelector('[data-testid="recording-playback-video"]') as HTMLElement | null;
        return video?.getAttribute('data-ready') === 'true';
      });
    }
  });
});
