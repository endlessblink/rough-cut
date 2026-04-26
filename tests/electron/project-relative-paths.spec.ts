import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAsset,
  createLibrary,
  createProject,
  createProjectLibraryReference,
} from '../../packages/project-model/src/index.js';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';

const THUMBNAIL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=';

async function createPortableProjectFixture(projectName: string) {
  const tempRoot = await mkdtemp(join(tmpdir(), 'rough-cut-relative-paths-'));
  const initialDir = join(tempRoot, 'initial');
  const movedDir = join(tempRoot, 'moved');
  const mediaDir = join(initialDir, 'media');
  const librariesDir = join(initialDir, 'libraries');
  const projectPath = join(initialDir, 'portable-project.roughcut');

  await mkdir(mediaDir, { recursive: true });
  await mkdir(librariesDir, { recursive: true });

  const recordingPath = join(mediaDir, 'recording.webm');
  const thumbnailPath = join(mediaDir, 'recording.png');
  const cursorEventsPath = join(mediaDir, 'recording.ndjson');
  const libraryPath = join(librariesDir, 'portable-library.roughcutlib');

  await writeFile(recordingPath, 'video');
  await writeFile(thumbnailPath, Buffer.from(THUMBNAIL_PNG_BASE64, 'base64'));
  await writeFile(cursorEventsPath, '{"frame":0}\n');
  await writeFile(libraryPath, JSON.stringify({ version: 1, name: 'Portable Library' }), 'utf-8');

  const library = createLibrary('Portable Library');
  const asset = createAsset('recording', recordingPath, {
    thumbnailPath,
    metadata: {
      cursorEventsPath,
    },
  });
  const project = createProject({
    name: projectName,
    assets: [asset],
    libraryReferences: [createProjectLibraryReference(library, libraryPath)],
  });

  return {
    tempRoot,
    initialDir,
    movedDir,
    projectPath,
    project,
  };
}

test.describe('project relative paths', () => {
  test('saves portable media paths and resolves them after moving the project folder', async ({
    appPage,
  }) => {
    const { tempRoot, initialDir, movedDir, projectPath, project } =
      await createPortableProjectFixture('Portable Project');

    try {
      const saved = await appPage.evaluate(
        async ({ project, projectPath }) => {
          return (
            window as unknown as {
              roughcut: { projectSave: (project: unknown, filePath: string) => Promise<boolean> };
            }
          ).roughcut.projectSave(project, projectPath);
        },
        { project, projectPath },
      );

      expect(saved).toBe(true);

      const savedProject = JSON.parse(await readFile(projectPath, 'utf-8'));
      expect(savedProject.assets[0]?.filePath).toBe('media/recording.webm');
      expect(savedProject.assets[0]?.thumbnailPath).toBe('media/recording.png');
      expect(savedProject.assets[0]?.metadata?.cursorEventsPath).toBe('media/recording.ndjson');
      expect(savedProject.libraryReferences[0]?.filePath).toBe(
        'libraries/portable-library.roughcutlib',
      );

      await rename(initialDir, movedDir);

      const reopenedProjectPath = join(movedDir, 'portable-project.roughcut');
      const reopenedProject = await appPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, reopenedProjectPath);

      expect(reopenedProject.assets[0]?.filePath).toBe(join(movedDir, 'media', 'recording.webm'));
      expect(reopenedProject.assets[0]?.thumbnailPath).toBe(
        join(movedDir, 'media', 'recording.png'),
      );
      expect(reopenedProject.assets[0]?.metadata?.cursorEventsPath).toBe(
        join(movedDir, 'media', 'recording.ndjson'),
      );
      expect(reopenedProject.libraryReferences[0]?.filePath).toBe(
        join(movedDir, 'libraries', 'portable-library.roughcutlib'),
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('moved project is visible in the Projects UI with a loaded thumbnail', async ({
    appPage,
  }) => {
    const projectName = `Portable Project UI ${Date.now()}`;
    const { tempRoot, initialDir, movedDir, projectPath, project } =
      await createPortableProjectFixture(projectName);

    try {
      const saved = await appPage.evaluate(
        async ({ project, projectPath }) => {
          return (
            window as unknown as {
              roughcut: { projectSave: (project: unknown, filePath: string) => Promise<boolean> };
            }
          ).roughcut.projectSave(project, projectPath);
        },
        { project, projectPath },
      );

      expect(saved).toBe(true);

      await rename(initialDir, movedDir);

      const reopenedProjectPath = join(movedDir, 'portable-project.roughcut');
      const reopenedProject = await appPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, reopenedProjectPath);

      const refreshedRecentEntry = await appPage.evaluate(
        async ({ project, projectPath }) => {
          await (
            window as unknown as {
              roughcut: { projectSave: (project: unknown, filePath: string) => Promise<boolean> };
            }
          ).roughcut.projectSave(project, projectPath);

          return (
            window as unknown as {
              roughcut: {
                recentProjectsGet: () => Promise<Array<{ name: string; filePath: string }>>;
              };
            }
          ).roughcut.recentProjectsGet();
        },
        { project: reopenedProject, projectPath: reopenedProjectPath },
      );

      expect(refreshedRecentEntry.some((entry) => entry.filePath === reopenedProjectPath)).toBe(
        true,
      );

      await appPage.reload();
      await expect(appPage.locator('text=Recent Projects')).toBeVisible();
      await appPage.locator(`text=${projectName}`).first().click();

      await expect(appPage.locator('h2', { hasText: projectName })).toBeVisible();
      await expect(appPage.getByText('recording', { exact: true })).toBeVisible();

      await appPage.waitForFunction(() => {
        return Array.from(document.querySelectorAll('img')).some((img) => {
          const element = img as HTMLImageElement;
          return (
            element.src.includes('recording.png') &&
            element.complete &&
            element.naturalWidth > 0 &&
            getComputedStyle(element).display !== 'none'
          );
        });
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('reopened moved project hydrates zoom sidecar next to the recording file', async ({
    appPage,
  }) => {
    const { tempRoot, initialDir, movedDir, projectPath, project } =
      await createPortableProjectFixture('Portable Project Zoom Sidecar');

    try {
      const recordingZoomPath = join(initialDir, 'media', 'recording.zoom.json');
      const projectWithStaleZoom = {
        ...project,
        assets: project.assets.map((asset) => ({
          ...asset,
          presentation: {
            ...(asset.presentation ?? {}),
            zoom: { autoIntensity: 0, markers: [] },
          },
        })),
      };

      await writeFile(
        recordingZoomPath,
        JSON.stringify(
          {
            version: 1,
            autoIntensity: 0.75,
            markers: [
              {
                id: 'zoom-1',
                startFrame: 10,
                endFrame: 30,
                focalPoint: { x: 0.5, y: 0.5 },
                scale: 1.4,
              },
            ],
          },
          null,
          2,
        ),
        'utf-8',
      );

      const saved = await appPage.evaluate(
        async ({ project, projectPath }) => {
          return (
            window as unknown as {
              roughcut: { projectSave: (project: unknown, filePath: string) => Promise<boolean> };
            }
          ).roughcut.projectSave(project, projectPath);
        },
        { project: projectWithStaleZoom, projectPath },
      );

      expect(saved).toBe(true);

      await rename(initialDir, movedDir);

      const reopenedProjectPath = join(movedDir, 'portable-project.roughcut');
      const reopenedProject = await appPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, reopenedProjectPath);

      expect(reopenedProject.assets[0]?.presentation?.zoom?.autoIntensity).toBe(0.75);
      expect(reopenedProject.assets[0]?.presentation?.zoom?.markers).toHaveLength(1);
      expect(reopenedProject.assets[0]?.presentation?.zoom?.markers[0]?.startFrame).toBe(10);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('moved project preserves Record template/frame state and sidecar writes', async ({
    appPage,
  }) => {
    const { tempRoot, initialDir, movedDir, projectPath, project } =
      await createPortableProjectFixture('Portable Project Reopen Fidelity');

    try {
      const sidecarPayload = {
        version: 1,
        autoIntensity: 0.6,
        followCursor: true,
        followAnimation: 'focused',
        followPadding: 0.18,
        markers: [
          {
            id: 'zoom-1',
            startFrame: 12,
            endFrame: 28,
            focalPoint: { x: 0.5, y: 0.5 },
            scale: 1.35,
          },
        ],
      };
      const projectWithPresentation = {
        ...project,
        assets: project.assets.map((asset) => ({
          ...asset,
          presentation: {
            ...(asset.presentation ?? {}),
            templateId: 'presentation-16x9',
            cameraFrame: { x: 0.12, y: 0.08, w: 0.42, h: 0.64 },
            zoom: { autoIntensity: 0, markers: [] },
          },
        })),
      };

      await writeFile(
        join(initialDir, 'media', 'recording.zoom.json'),
        JSON.stringify(sidecarPayload, null, 2),
        'utf-8',
      );

      const saved = await appPage.evaluate(
        async ({ project, projectPath }) => {
          return (
            window as unknown as {
              roughcut: { projectSave: (project: unknown, filePath: string) => Promise<boolean> };
            }
          ).roughcut.projectSave(project, projectPath);
        },
        { project: projectWithPresentation, projectPath },
      );

      expect(saved).toBe(true);

      await rename(initialDir, movedDir);

      const reopenedProjectPath = join(movedDir, 'portable-project.roughcut');
      const reopenedProject = await appPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, reopenedProjectPath);

      expect(reopenedProject.assets[0]?.presentation?.templateId).toBe('presentation-16x9');
      expect(reopenedProject.assets[0]?.presentation?.cameraFrame).toEqual({
        x: 0.12,
        y: 0.08,
        w: 0.42,
        h: 0.64,
      });
      expect(reopenedProject.assets[0]?.presentation?.zoom?.markers).toHaveLength(1);

      await navigateToTab(appPage, 'record');
      await appPage.evaluate(
        ({ nextProject, projectPath, activeAssetId }) => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          stores?.project.getState().setProject(nextProject);
          stores?.project.getState().setProjectFilePath(projectPath);
          stores?.project.getState().setActiveAssetId(activeAssetId);
          stores?.transport.getState().seekToFrame(0);
        },
        {
          nextProject: reopenedProject,
          projectPath: reopenedProjectPath,
          activeAssetId: reopenedProject.assets[0]?.id ?? null,
        },
      );

      await appPage.waitForFunction(() => {
        const root = document.querySelector('[data-testid="template-preview-root"]') as HTMLElement | null;
        return root?.getAttribute('data-template-id') === 'presentation-16x9';
      });

      const cameraMetrics = await appPage.evaluate(() => {
        const root = document.querySelector('[data-testid="template-preview-root"]') as HTMLElement | null;
        return {
          templateId: root?.getAttribute('data-template-id'),
          frameX: Number(root?.getAttribute('data-camera-frame-x') ?? '0'),
          frameY: Number(root?.getAttribute('data-camera-frame-y') ?? '0'),
          frameW: Number(root?.getAttribute('data-camera-frame-w') ?? '0'),
          frameH: Number(root?.getAttribute('data-camera-frame-h') ?? '0'),
        };
      });

      expect(cameraMetrics.templateId).toBe('presentation-16x9');
      expect(cameraMetrics.frameX).toBeCloseTo(0.12, 2);
      expect(cameraMetrics.frameY).toBeCloseTo(0.08, 2);
      expect(cameraMetrics.frameW).toBeCloseTo(0.42, 2);
      expect(cameraMetrics.frameH).toBeCloseTo(0.64, 2);

      const sidecarSaved = await appPage.evaluate(
        async ({ recordingFilePath, currentProjectPath, presentation }) => {
          return (
            window as unknown as {
              roughcut: {
                zoomSaveSidecar: (
                  path: string,
                  projectPathArg: string | null,
                  payload: Record<string, unknown>,
                ) => Promise<boolean>;
              };
            }
          ).roughcut.zoomSaveSidecar(recordingFilePath, currentProjectPath, presentation);
        },
        {
          recordingFilePath: reopenedProject.assets[0]?.filePath,
          currentProjectPath: reopenedProjectPath,
          presentation: {
            autoIntensity: 0.9,
            followCursor: true,
            followAnimation: 'smooth',
            followPadding: 0.22,
            markers: sidecarPayload.markers,
          },
        },
      );

      expect(sidecarSaved).toBe(true);

      const savedMovedSidecar = JSON.parse(
        await readFile(join(movedDir, 'media', 'recording.zoom.json'), 'utf-8'),
      );
      expect(savedMovedSidecar.autoIntensity).toBe(0.9);
      expect(savedMovedSidecar.followAnimation).toBe('smooth');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
