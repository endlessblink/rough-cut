import { test, expect, navigateToTab } from './fixtures/electron-app.js';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe('Record project-open duration repair', () => {
  test('opening a saved project re-probes stale recording duration and repairs clip length', async ({
    appPage,
  }) => {
    const workingDir = await mkdtemp(join(tmpdir(), 'rough-cut-duration-repair-'));
    const recordingsDir = join(workingDir, 'recordings');
    const recordingPath = join(recordingsDir, 'repair-target.webm');
    const projectPath = join(workingDir, 'duration-repair.roughcut');

    try {
      await mkdir(recordingsDir, { recursive: true });
      await createFixtureRecording(recordingPath, 5);

      await navigateToTab(appPage, 'record');

      await appPage.evaluate(
        async ({ recordingPath, projectPath }) => {
          const stores = (window as unknown as { __roughcutStores?: any }).__roughcutStores;
          const projectStore = stores?.project;
          const current = projectStore?.getState().project;
          if (!current) throw new Error('Project store unavailable');

          const videoTrack = current.composition.tracks.find((track: any) => track.type === 'video');
          if (!videoTrack) throw new Error('Video track unavailable');

          const assetId = 'recording-duration-repair';
          const clipId = 'clip-duration-repair';
          const staleDuration = 90;

          const nextProject = {
            ...current,
            assets: [
              {
                id: assetId,
                type: 'recording',
                filePath: recordingPath,
                duration: staleDuration,
                metadata: {
                  width: 1920,
                  height: 1080,
                  fps: 30,
                  hasAudio: false,
                },
              },
            ],
            composition: {
              ...current.composition,
              duration: staleDuration,
              tracks: current.composition.tracks.map((track: any) =>
                track.id === videoTrack.id
                  ? {
                      ...track,
                      clips: [
                        {
                          id: clipId,
                          assetId,
                          trackId: track.id,
                          enabled: true,
                          timelineIn: 0,
                          timelineOut: staleDuration,
                          sourceIn: 0,
                          sourceOut: staleDuration,
                          transform: {
                            x: 0,
                            y: 0,
                            scaleX: 1,
                            scaleY: 1,
                            rotation: 0,
                            anchorX: 0.5,
                            anchorY: 0.5,
                            opacity: 1,
                          },
                          effects: [],
                          keyframes: [],
                        },
                      ],
                    }
                  : { ...track, clips: [] },
              ),
            },
            aiAnnotations: { captionSegments: [] },
          };

          projectStore.getState().setProject(nextProject);
          projectStore.getState().setProjectFilePath(projectPath);
          await (window as unknown as { roughcut: { projectAutoSave: (project: unknown, filePath?: string) => Promise<string> } }).roughcut.projectAutoSave(
            nextProject,
            projectPath,
          );
        },
        { recordingPath, projectPath },
      );

      const openedProject = await appPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, projectPath);

      const snapshot = summarizeRecordingProject(openedProject);
      expect(snapshot.assetDuration).toBe(150);
      expect(snapshot.clipSourceOut).toBe(150);
      expect(snapshot.clipTimelineOut).toBe(150);
      expect(snapshot.compositionDuration).toBe(150);
    } finally {
      await rm(workingDir, { recursive: true, force: true });
    }
  });
});

function execFileAsync(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve();
    });
  });
}

async function createFixtureRecording(filePath: string, durationSeconds: number): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=320x240:d=${durationSeconds}:r=30`,
    '-an',
    '-c:v',
    'libvpx',
    filePath,
  ]);
}

function summarizeRecordingProject(project: any) {
  const asset = project.assets.find((entry: any) => entry.type === 'recording');
  const videoTrack = project.composition.tracks.find((track: any) => track.type === 'video');
  const clip = videoTrack?.clips?.find((entry: any) => entry.assetId === asset?.id) ?? null;

  return {
    assetDuration: asset?.duration ?? null,
    clipSourceOut: clip?.sourceOut ?? null,
    clipTimelineOut: clip?.timelineOut ?? null,
    compositionDuration: project.composition.duration ?? null,
  };
}
