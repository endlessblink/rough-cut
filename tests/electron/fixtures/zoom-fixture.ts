import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { navigateToTab } from './electron-app.js';

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

  const recordingBaseName = basename(recording.filePath).replace(/\.(webm|mp4)$/i, '');
  const inferredCursorEventsPath = [
    recording.metadata?.cursorEventsPath,
    `${recording.filePath.replace(/\.(webm|mp4)$/i, '.cursor.ndjson')}`,
    join(dirname(recording.filePath), `${recordingBaseName}.cursor.ndjson`),
    join('/home/endlessblink/Documents/Rough Cut/recordings', `${recordingBaseName}.cursor.ndjson`),
  ].find((candidate): candidate is string => Boolean(candidate) && existsSync(candidate));

  let cursorEventsPath = inferredCursorEventsPath ?? null;
  if (options.preserveCursorEvents) {
    cursorEventsPath = join(tmpdir(), `rough-cut-e2e-cursor-fixture-${randomUUID()}.ndjson`);
    await writeFile(cursorEventsPath, buildSyntheticCursorSidecar(recording.duration ?? 180), 'utf-8');
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
            ? cursorEventsPath
            : null,
        },
        presentation: {
          ...asset.presentation,
          camera: {
            ...(asset.presentation?.camera ?? {}),
            visible: true,
          },
          cameraLayouts: [],
          visibilitySegments: [],
          screenCrop: {
            ...(asset.presentation?.screenCrop ?? {}),
            enabled: false,
          },
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
      stores?.transport.setState({
        playheadFrame: 0,
        isPlaying: false,
        selectedClipIds: [],
      });
    },
    {
      nextProject: sanitizedProject,
      projectPath: ZOOM_FIXTURE_PROJECT_PATH,
      activeAssetId: recording.id,
    },
  );

  await navigateToTab(page, 'record');

  await page.waitForFunction(
    () =>
      Boolean(
        document.querySelector('[data-testid="zoom-host"]') ||
          document.querySelector('[data-testid="recording-playback-video"]'),
      ),
    { timeout: 30_000 },
  );
  return recording.filePath as string;
}

function buildSyntheticCursorSidecar(durationFrames: number): string {
  const frameCount = Math.max(90, Math.min(Number(durationFrames) || 180, 240));
  const lines: string[] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const phase = frame % 24;
    const x = Math.round(180 + phase * 58);
    const y = Math.round(180 + ((frame * 37) % 620));
    lines.push(JSON.stringify({ frame, x, y, type: 'move', button: 0 }));
    if (frame === 24 || frame === 72) {
      lines.push(JSON.stringify({ frame, x, y, type: 'down', button: 1 }));
    }
  }

  return `${lines.join('\n')}\n`;
}
