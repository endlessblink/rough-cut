import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertReadableMp4, computeSyncedRecordingTiming, probeImportedMedia, probeVideoStreamsTiming, probeVideoTiming } from './media-probe.mjs';

test('rejects invalid mp4 files before project save', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-invalid-mp4-'));
  const filePath = join(root, 'broken.mp4');
  await writeFile(filePath, Buffer.from('not an mp4'));

  await assert.rejects(() => assertReadableMp4(filePath), /Recording did not finalize/);

  await rm(root, { recursive: true, force: true });
});

test('computeSyncedRecordingTiming trims to camera overlap after preroll', () => {
  const sync = computeSyncedRecordingTiming({
    screen: { durationFrames: 120 },
    camera: { durationFrames: 180 },
    cameraSourceInFrames: 75,
    fps: 30,
  });

  assert.equal(sync.screenFrames, 120);
  assert.equal(sync.cameraFrames, 180);
  assert.equal(sync.syncedDurationFrames, 105);
  assert.match(sync.syncWarning, /shorter than screen capture/);
});

test('computeSyncedRecordingTiming prefers media seconds over decoded camera frames', () => {
  const sync = computeSyncedRecordingTiming({
    screen: { durationFrames: 201, durationSeconds: 6.7 },
    camera: { durationFrames: 225, durationSeconds: 9.233 },
    cameraSourceInFrames: 75,
    fps: 30,
  });

  assert.equal(sync.screenFrames, 201);
  assert.equal(sync.cameraFrames, 225);
  assert.equal(sync.syncedDurationFrames, 201);
  assert.equal(sync.syncWarning, null);
});

test('computeSyncedRecordingTiming ignores tiny tail gaps', () => {
  const sync = computeSyncedRecordingTiming({
    screen: { durationFrames: 120, durationSeconds: 4 },
    camera: { durationFrames: 116, durationSeconds: 3.8667 },
    cameraSourceInFrames: 0,
    fps: 30,
  });

  assert.equal(sync.syncedDurationFrames, 116);
  assert.equal(sync.syncWarning, null);
});

test('computeSyncedRecordingTiming never extends beyond available screen frames', () => {
  const sync = computeSyncedRecordingTiming({
    screen: { durationFrames: 114, durationSeconds: 4.3 },
    camera: { durationFrames: 84, durationSeconds: 4.2 },
    cameraSourceInFrames: 0,
    fps: 30,
  });

  assert.equal(sync.screenFrames, 114);
  assert.equal(sync.cameraFrames, 84);
  assert.equal(sync.syncedDurationFrames, 114);
  assert.equal(sync.syncWarning, null);
});

test('probeVideoTiming derives frame count from ffprobe JSON', async () => {
  const timing = await probeVideoTiming('/tmp/capture.mp4', {
    fps: 30,
    runner: async () => ({
      code: 0,
      stderr: '',
      stdout: JSON.stringify({
        streams: [{ start_time: '0.033000', duration: '2.333000', nb_read_frames: '70', avg_frame_rate: '30/1' }],
        format: { start_time: '0.033000', duration: '2.333000' },
      }),
    }),
  });

  assert.equal(timing.durationFrames, 70);
  assert.equal(timing.frameRate, 30);
  assert.equal(timing.durationSeconds, 2.333);
  assert.equal(timing.startTimeSeconds, 0.033);
});

// P-AI-C/TASK-177 — probeImportedMedia (video) now makes two ffprobe calls:
// first the video stream, then a:0 to detect embedded audio. Tests use a
// queue-based runner so each call gets its own canned response.
function queueRunner(responses) {
  const queue = [...responses];
  return async () => {
    if (queue.length === 0) throw new Error('queueRunner ran out of responses');
    return queue.shift();
  };
}

test('probeImportedMedia (video) returns width/height/fps/duration + hasAudio:false when no audio stream', async () => {
  const probe = await probeImportedMedia('/tmp/clip.mp4', {
    kind: 'video',
    runner: queueRunner([
      {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          streams: [{
            width: 1920,
            height: 1080,
            duration: '12.5',
            avg_frame_rate: '30/1',
            r_frame_rate: '30/1',
          }],
          format: { duration: '12.5' },
        }),
      },
      // Audio probe: ffprobe returns empty streams array for files without audio.
      { code: 0, stderr: '', stdout: JSON.stringify({ streams: [], format: {} }) },
    ]),
  });
  assert.equal(probe.kind, 'video');
  assert.equal(probe.width, 1920);
  assert.equal(probe.height, 1080);
  assert.equal(probe.fps, 30);
  assert.equal(probe.durationSeconds, 12.5);
  assert.equal(probe.durationFrames, 375);
  assert.equal(probe.hasAudio, false);
  assert.equal(probe.audioDurationSeconds, null);
  assert.equal(probe.audioSampleRate, null);
});

test('probeImportedMedia (video) reports hasAudio + sample rate when ffprobe finds a:0', async () => {
  const probe = await probeImportedMedia('/tmp/clip.mp4', {
    kind: 'video',
    runner: queueRunner([
      {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          streams: [{
            width: 1920, height: 1080, duration: '8',
            avg_frame_rate: '30/1', r_frame_rate: '30/1',
          }],
          format: { duration: '8' },
        }),
      },
      {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          streams: [{ codec_name: 'aac', duration: '8.02', sample_rate: '48000' }],
          format: { duration: '8' },
        }),
      },
    ]),
  });
  assert.equal(probe.hasAudio, true);
  assert.equal(probe.audioDurationSeconds, 8.02);
  assert.equal(probe.audioSampleRate, 48000);
});

test('probeImportedMedia (video) treats audio-probe failure as no-audio (silent video import still succeeds)', async () => {
  const probe = await probeImportedMedia('/tmp/clip.mp4', {
    kind: 'video',
    runner: queueRunner([
      {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          streams: [{
            width: 1280, height: 720, duration: '3',
            avg_frame_rate: '30/1', r_frame_rate: '30/1',
          }],
          format: { duration: '3' },
        }),
      },
      { code: 1, stderr: 'audio probe blew up', stdout: '' },
    ]),
  });
  assert.equal(probe.width, 1280);
  assert.equal(probe.hasAudio, false);
});

test('probeImportedMedia (audio) returns duration only', async () => {
  const probe = await probeImportedMedia('/tmp/voice.mp3', {
    kind: 'audio',
    runner: async () => ({
      code: 0,
      stderr: '',
      stdout: JSON.stringify({
        streams: [{ duration: '4.2' }],
        format: { duration: '4.2' },
      }),
    }),
  });
  assert.equal(probe.kind, 'audio');
  assert.equal(probe.durationSeconds, 4.2);
  assert.equal(probe.width, null);
  assert.equal(probe.height, null);
});

test('probeImportedMedia (image) returns dimensions and null duration', async () => {
  const probe = await probeImportedMedia('/tmp/photo.png', {
    kind: 'image',
    runner: async () => ({
      code: 0,
      stderr: '',
      stdout: JSON.stringify({ streams: [{ width: 800, height: 600 }] }),
    }),
  });
  assert.equal(probe.kind, 'image');
  assert.equal(probe.width, 800);
  assert.equal(probe.height, 600);
  assert.equal(probe.durationSeconds, null);
});

test('probeImportedMedia rejects when ffprobe exits non-zero', async () => {
  await assert.rejects(
    () => probeImportedMedia('/tmp/missing.mp4', {
      kind: 'video',
      runner: async () => ({ code: 1, stderr: 'No such file', stdout: '' }),
    }),
    /ffprobe failed/,
  );
});

test('probeVideoStreamsTiming returns per-stream timing and prefers duration seconds', async () => {
  const streams = await probeVideoStreamsTiming('/tmp/unified.mkv', {
    fps: 30,
    runner: async () => ({
      code: 0,
      stderr: '',
      stdout: JSON.stringify({
        streams: [
          { index: 0, start_time: '0.000000', duration: '6.700000', nb_read_frames: '190', avg_frame_rate: '30/1', time_base: '1/1000' },
          { index: 1, start_time: '0.066000', duration: '6.800000', nb_read_frames: '225', avg_frame_rate: '30/1', time_base: '1/1000' },
        ],
        format: { start_time: '0.000000', duration: '6.800000' },
      }),
    }),
  });

  assert.equal(streams.length, 2);
  assert.equal(streams[0].index, 0);
  assert.equal(streams[0].durationFrames, 201);
  assert.equal(streams[0].decodedFrames, 190);
  assert.equal(streams[1].startTimeSeconds, 0.066);
  assert.equal(streams[1].timeBase, '1/1000');
});
