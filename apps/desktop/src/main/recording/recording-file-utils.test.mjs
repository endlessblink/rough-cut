import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mergeRecordingResultWithFinalProbe,
  muxAudioIntoRecording,
  probeRecordingFile,
} from './recording-file-utils.mjs';

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

test('post-mux probe refresh reports final hasAudio truth', async () => {
  const workdir = await mkdtemp(join(tmpdir(), 'rough-cut-audio-truth-'));
  const videoPath = join(workdir, 'video.webm');
  const audioPath = join(workdir, 'audio.webm');

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=320x240:d=1:r=30',
      '-an',
      '-c:v',
      'libvpx',
      videoPath,
    ]);

    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=1',
      '-c:a',
      'libopus',
      audioPath,
    ]);

    assert.equal(probeRecordingFile(videoPath).hasAudio, false);

    const muxed = await muxAudioIntoRecording(videoPath, audioPath);
    assert.equal(muxed, true);

    const refreshed = mergeRecordingResultWithFinalProbe(
      {
        filePath: videoPath,
        durationFrames: 0,
        durationMs: 0,
        width: 0,
        height: 0,
        fps: 0,
        codec: 'unknown',
        fileSize: 0,
        hasAudio: false,
      },
      { fps: 30, durationMs: 1000, timelineFps: 30 },
    );

    assert.equal(refreshed.hasAudio, true);
    assert.ok(refreshed.fileSize > 0);
    assert.ok(refreshed.durationFrames > 0);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});
