import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, expect, navigateToTab } from './fixtures/electron-app.js';

test.describe('adhoc fresh-record export', () => {
  test('exports an audio-muxed mp4 from a freshly-created webm project', async (
    { appPage },
    testInfo,
  ) => {
    test.setTimeout(240_000);

    const workDir = join(tmpdir(), `rough-cut-adhoc-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });
    const webmPath = join(workDir, 'source.webm');
    const projectPath = join(workDir, 'adhoc.roughcut');
    const outputPath = join(workDir, 'out.mp4');

    // Generate a 5-second 1920x1080 webm with a 440Hz sine tone audio track.
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi', '-i', 'color=c=blue:s=1920x1080:r=30:d=5',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=5',
        '-c:v', 'libvpx', '-b:v', '2M',
        '-c:a', 'libopus', '-b:a', '128k',
        '-shortest',
        webmPath,
      ],
      { stdio: 'pipe' },
    );

    // Sanity check — the generated webm has both streams.
    const sourceProbe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_streams', webmPath],
        { encoding: 'utf-8' },
      ),
    ) as { streams?: Array<{ codec_type?: string }> };
    expect(sourceProbe.streams?.some((s) => s.codec_type === 'video')).toBe(true);
    expect(sourceProbe.streams?.some((s) => s.codec_type === 'audio')).toBe(true);

    const frameCount = 150; // 5s @ 30fps
    const assetId = randomUUID();
    const videoTrackId = randomUUID();
    const audioTrackId = randomUUID();
    const clipId = randomUUID();
    const audioClipId = randomUUID();

    const project = {
      version: 4,
      id: randomUUID(),
      name: 'adhoc',
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      settings: {
        resolution: { width: 1920, height: 1080 },
        frameRate: 30,
        backgroundColor: '#000000',
        sampleRate: 48000,
      },
      assets: [
        {
          id: assetId,
          type: 'recording',
          filePath: webmPath,
          duration: frameCount,
          metadata: {
            width: 1920,
            height: 1080,
            fps: 30,
            codec: 'vp8',
            fileSize: statSync(webmPath).size,
            hasAudio: true,
            cursorEventsPath: null,
          },
        },
      ],
      composition: {
        duration: frameCount,
        tracks: [
          {
            id: videoTrackId,
            type: 'video',
            name: 'Video 1',
            index: 0,
            locked: false,
            visible: true,
            volume: 1,
            clips: [
              {
                id: clipId,
                assetId,
                trackId: videoTrackId,
                enabled: true,
                timelineIn: 0,
                timelineOut: frameCount,
                sourceIn: 0,
                sourceOut: frameCount,
                transform: {
                  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
                  anchorX: 0.5, anchorY: 0.5, opacity: 1,
                },
                effects: [],
                keyframes: [],
              },
            ],
          },
          {
            id: audioTrackId,
            type: 'audio',
            name: 'Audio 1',
            index: 1,
            locked: false,
            visible: true,
            volume: 1,
            clips: [
              {
                id: audioClipId,
                assetId,
                trackId: audioTrackId,
                enabled: true,
                timelineIn: 0,
                timelineOut: frameCount,
                sourceIn: 0,
                sourceOut: frameCount,
                transform: {
                  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
                  anchorX: 0.5, anchorY: 0.5, opacity: 1,
                },
                effects: [],
                keyframes: [],
              },
            ],
          },
        ],
        transitions: [],
      },
      motionPresets: [],
      exportSettings: {
        format: 'mp4',
        resolution: { width: 1920, height: 1080 },
        frameRate: 30,
        videoBitrate: 8_000_000,
        audioBitrate: 128_000,
        codec: 'h264',
        crf: 23,
        preset: 'balanced',
      },
    };

    writeFileSync(projectPath, JSON.stringify(project, null, 2));

    // Hand the project to the renderer and set up the export output override.
    await appPage.evaluate(
      ({ nextProject, projectPath: ppath, activeAssetId, exportPath }) => {
        const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
        stores?.project.getState().setProject(nextProject);
        stores?.project.getState().setProjectFilePath(ppath);
        stores?.project.getState().setActiveAssetId(activeAssetId);
        stores?.transport.getState().seekToFrame(0);
        (window as unknown as { __roughcutTestOverrides?: { exportOutputPath?: string } })
          .__roughcutTestOverrides = { exportOutputPath: exportPath };
      },
      { nextProject: project, projectPath, activeAssetId: assetId, exportPath: outputPath },
    );

    await navigateToTab(appPage, 'export');
    await appPage.evaluate(() => {
      const button = document.querySelector('[data-testid="btn-export"]') as HTMLButtonElement | null;
      button?.click();
    });

    await expect
      .poll(() => (existsSync(outputPath) ? statSync(outputPath).size : 0), { timeout: 210_000 })
      .toBeGreaterThan(1024);

    const header = await readFile(outputPath);
    expect(header.subarray(4, 8).toString('ascii')).toBe('ftyp');

    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_streams', outputPath],
        { encoding: 'utf-8' },
      ),
    ) as { streams?: Array<{ codec_type?: string; codec_name?: string }> };

    const streams = probe.streams ?? [];
    const hasVideo = streams.some((s) => s.codec_type === 'video');
    const hasAudio = streams.some((s) => s.codec_type === 'audio');

    testInfo.attachments.push({
      name: 'output-probe',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ outputPath, size: statSync(outputPath).size, streams }, null, 2)),
    });

    expect(hasVideo).toBe(true);
    expect(hasAudio).toBe(true);

    // Cleanup on success
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});
