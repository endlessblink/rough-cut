import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import {
  PLAYBACK_PROJECT_PATH,
  PLAYBACK_RECORDING_BASENAME,
} from './fixtures/playback-fixture.js';

test.describe('export smoke', () => {
  test('exports a playable mp4 file with audio', async ({ appPage }, testInfo) => {
    test.setTimeout(240_000);
    expect(existsSync(PLAYBACK_PROJECT_PATH), 'Recorded project fixture is not available').toBe(
      true,
    );

    const outputPath = join(tmpdir(), `rough-cut-export-${Date.now()}.mp4`);

    const project = await appPage.evaluate(
      (projectPath) =>
        (
          window as unknown as {
            roughcut: { projectOpenPath: (filePath: string) => Promise<Record<string, unknown>> };
          }
        ).roughcut.projectOpenPath(projectPath),
      PLAYBACK_PROJECT_PATH,
    );

    const recording = (project.assets as Array<Record<string, unknown>>).find(
      (asset) =>
        asset.type === 'recording' &&
        typeof asset.filePath === 'string' &&
        asset.filePath.includes(PLAYBACK_RECORDING_BASENAME),
    );
    const recordingPath = typeof recording?.filePath === 'string' ? recording.filePath : null;

    await appPage.evaluate(
      ({ nextProject, projectPath, activeAssetId, exportPath }) => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        stores?.project.getState().setProject(nextProject);
        stores?.project.getState().setProjectFilePath(projectPath);
        stores?.project.getState().setActiveAssetId(activeAssetId ?? null);
        stores?.transport.getState().seekToFrame(0);
        (
          window as unknown as {
            __roughcutTestOverrides?: {
              exportOutputPath?: string;
              runDesktopExport?: (
                project: Record<string, unknown>,
                range: { startFrame: number; endFrame: number },
                outputPath: string,
                signal: AbortSignal,
              ) => Promise<unknown>;
            };
            roughcut: {
              exportStart: (
                project: Record<string, unknown>,
                settings: unknown,
                outputPath: string,
              ) => Promise<unknown>;
            };
          }
        ).__roughcutTestOverrides = {
          exportOutputPath: exportPath,
          runDesktopExport: async (project, _range, outputPath) => {
            return window.roughcut.exportStart(project, (project as any).exportSettings, outputPath);
          },
        };
      },
      {
        nextProject: project,
        projectPath: PLAYBACK_PROJECT_PATH,
        activeAssetId: recording?.id ?? null,
        exportPath: outputPath,
      },
    );

    await navigateToTab(appPage, 'export');
    await appPage.locator('[data-testid="btn-export"]').click();

    await expect
      .poll(() => (existsSync(outputPath) ? statSync(outputPath).size : 0), {
        timeout: 240_000,
      })
      .toBeGreaterThan(1024);

    const header = await readFile(outputPath, { encoding: null });
    expect(header.subarray(4, 8).toString('ascii')).toBe('ftyp');

    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_streams', outputPath],
        {
          encoding: 'utf-8',
        },
      ),
    ) as {
      streams?: Array<{ codec_type?: string }>;
    };

    const absoluteRecordingPath = recordingPath
      ? isAbsolute(recordingPath)
        ? recordingPath
        : resolve(dirname(PLAYBACK_PROJECT_PATH), recordingPath)
      : null;

    const sourceHasAudio = absoluteRecordingPath
      ? (() => {
          const sourceProbe = JSON.parse(
            execFileSync(
              'ffprobe',
              ['-v', 'quiet', '-print_format', 'json', '-show_streams', absoluteRecordingPath],
              { encoding: 'utf-8' },
            ),
          ) as { streams?: Array<{ codec_type?: string }> };
          return sourceProbe.streams?.some((stream) => stream.codec_type === 'audio') ?? false;
        })()
      : false;

    expect(probe.streams?.some((stream) => stream.codec_type === 'video')).toBe(true);
    expect(probe.streams?.some((stream) => stream.codec_type === 'audio') ?? false).toBe(
      sourceHasAudio,
    );

    testInfo.attachments.push({
      name: 'export-path',
      contentType: 'text/plain',
      body: Buffer.from(outputPath, 'utf-8'),
    });
  });
});
