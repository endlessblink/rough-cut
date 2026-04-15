import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import type { Page } from '@playwright/test';

export const ZOOM_FIXTURE_PROJECT_PATH =
  process.env.ROUGH_CUT_SESSION_PATH ??
  '/home/endlessblink/Documents/Rough Cut/Recording Apr 14 2026 - 1825.roughcut';

type FixtureProject = Record<string, any>;

interface LoadZoomFixtureOptions {
  preserveCursorEvents?: boolean;
  preserveMarkers?: boolean;
}

export async function loadZoomFixture(
  page: Page,
  options: LoadZoomFixtureOptions = {},
): Promise<string> {
  const project = JSON.parse(await readFile(ZOOM_FIXTURE_PROJECT_PATH, 'utf-8')) as FixtureProject;
  const recording = project.assets.find((asset: any) => asset.type === 'recording') ?? null;

  if (!recording?.filePath) {
    throw new Error(`Zoom fixture has no recording asset: ${ZOOM_FIXTURE_PROJECT_PATH}`);
  }

  const sidecarPath = recording.filePath.replace(/\.(webm|mp4)$/i, '.zoom.json');
  if (existsSync(sidecarPath)) {
    await unlink(sidecarPath).catch(() => {});
  }

  const sanitizedProject = {
    ...project,
    assets: project.assets.map((asset: any) => {
      if (asset.id !== recording.id) return asset;
      return {
        ...asset,
        metadata: {
          ...asset.metadata,
          cursorEventsPath: options.preserveCursorEvents
            ? (asset.metadata?.cursorEventsPath ?? null)
            : null,
        },
        presentation: {
          ...asset.presentation,
          zoom: {
            ...(asset.presentation?.zoom ?? {}),
            autoIntensity: 0,
            markers: options.preserveMarkers ? (asset.presentation?.zoom?.markers ?? []) : [],
          },
        },
      };
    }),
  };

  await page.evaluate(
    ({ nextProject, projectPath, activeAssetId }) => {
      const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
      stores?.project.getState().setProject(nextProject);
      stores?.project.getState().setProjectFilePath(projectPath);
      stores?.project.getState().setActiveAssetId(activeAssetId);
      stores?.transport.getState().seekToFrame(0);
    },
    {
      nextProject: sanitizedProject,
      projectPath: ZOOM_FIXTURE_PROJECT_PATH,
      activeAssetId: recording.id,
    },
  );

  await page.waitForSelector('[data-testid="zoom-host"]', { timeout: 10_000 });
  return recording.filePath as string;
}
