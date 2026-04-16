import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { ZOOM_FIXTURE_PROJECT_PATH } from './fixtures/zoom-fixture.js';

test.describe('export smoke', () => {
  test('exports a playable mp4 file with audio', async ({ appPage }, testInfo) => {
    test.setTimeout(240_000);
    expect(existsSync(ZOOM_FIXTURE_PROJECT_PATH), 'Recorded project fixture is not available').toBe(
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
      ZOOM_FIXTURE_PROJECT_PATH,
    );

    const recording = (project.assets as Array<Record<string, unknown>>).find(
      (asset) => asset.type === 'recording',
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
          window as unknown as { __roughcutTestOverrides?: { exportOutputPath?: string } }
        ).__roughcutTestOverrides = {
          exportOutputPath: exportPath,
        };
      },
      {
        nextProject: project,
        projectPath: ZOOM_FIXTURE_PROJECT_PATH,
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

    const sourceHasAudio = recordingPath
      ? (() => {
          const sourceProbe = JSON.parse(
            execFileSync(
              'ffprobe',
              ['-v', 'quiet', '-print_format', 'json', '-show_streams', recordingPath],
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
