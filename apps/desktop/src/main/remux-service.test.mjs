import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startFfmpegCapture } from './recording/ffmpeg-capture.mjs';
import { assertReadableMp4 } from './media-probe.mjs';
import { remuxMkvSegmentsToMp4, remuxMkvToMp4, RemuxIncompleteError, validateRemuxedMp4 } from './remux-service.mjs';

test('remuxes a short mkv recording to readable mp4', { timeout: 30_000 }, async (t) => {
  const display = ':0+0,0';
  if (!process.env.DISPLAY) {
    t.skip('DISPLAY is not set');
    return;
  }
  if (!(await canReadX11Grab(display))) {
    t.skip(`ffmpeg x11grab cannot open ${display}`);
    return;
  }

  const root = await mkdtemp(join(tmpdir(), 'rough-cut-remux-'));
  const rawPath = join(root, 'capture.mkv');
  const outputPath = join(root, 'capture.mp4');
  const capture = startFfmpegCapture({
    outputPath: rawPath,
    fps: 30,
    display,
    width: 320,
    height: 240,
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));
  await capture.stop();
  const result = await remuxMkvToMp4({ rawPath, outputPath });
  await assertReadableMp4(outputPath);
  // A real short capture should be coherent end-to-end.
  assert.equal(result.warning, null);

  await rm(root, { recursive: true, force: true });
});

function canReadX11Grab(display) {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', [
      '-v', 'error',
      '-f', 'x11grab',
      '-draw_mouse', '0',
      '-framerate', '1',
      '-video_size', '16x16',
      '-i', display,
      '-frames:v', '1',
      '-f', 'null',
      '-',
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

test('validateRemuxedMp4 reports coherent when decoded frames match advertised', async () => {
  const result = await validateRemuxedMp4('/tmp/fake.mp4', {
    probe: async () => ({ advertisedFrames: 300, decodedFrames: 300, durationSeconds: 10 }),
  });
  assert.equal(result.coherent, true);
  assert.equal(result.warning, null);
  assert.equal(result.integrity.decodedFrames, 300);
});

test('validateRemuxedMp4 reports a partial-recovery warning when decoded < advertised - tolerance', async () => {
  const result = await validateRemuxedMp4('/tmp/fake.mp4', {
    probe: async () => ({ advertisedFrames: 300, decodedFrames: 240, durationSeconds: 10 }),
  });
  assert.equal(result.coherent, false);
  assert.match(result.warning ?? '', /Partial recording: 240\/300 frames decoded \(60 missing\)/);
});

test('validateRemuxedMp4 ignores tiny decoded/advertised gaps within tolerance', async () => {
  const result = await validateRemuxedMp4('/tmp/fake.mp4', {
    probe: async () => ({ advertisedFrames: 300, decodedFrames: 298, durationSeconds: 10 }),
  });
  assert.equal(result.coherent, true);
  assert.equal(result.warning, null);
});

test('validateRemuxedMp4 throws RemuxIncompleteError when no frames decode', async () => {
  await assert.rejects(
    () => validateRemuxedMp4('/tmp/fake.mp4', {
      probe: async () => ({ advertisedFrames: 300, decodedFrames: 0, durationSeconds: 10 }),
    }),
    (err) => err instanceof RemuxIncompleteError && err.code === 'REMUX_INCOMPLETE',
  );
});

test('validateRemuxedMp4 stays silent when advertisedFrames is unknown', async () => {
  const result = await validateRemuxedMp4('/tmp/fake.mp4', {
    probe: async () => ({ advertisedFrames: null, decodedFrames: 240, durationSeconds: 10 }),
  });
  assert.equal(result.coherent, true);
  assert.equal(result.warning, null);
});

test('remuxMkvToMp4 returns a clean result when ffmpeg succeeds and the validator reports coherent', async () => {
  const logs = [];
  const result = await remuxMkvToMp4({
    rawPath: '/tmp/in.mkv',
    outputPath: '/tmp/out.mp4',
    onLog: (line) => logs.push(line),
    runner: async () => ({ code: 0, stdout: '', stderr: '' }),
    validate: async () => ({ coherent: true, integrity: { advertisedFrames: 300, decodedFrames: 300 }, warning: null }),
  });
  assert.equal(result.outputPath, '/tmp/out.mp4');
  assert.equal(result.warning, null);
  assert.equal(logs.some((line) => line.startsWith('[remux] Starting:')), true);
  assert.equal(logs.some((line) => line.includes('WARN')), false);
});

test('remuxMkvSegmentsToMp4 uses concat demuxer for multiple raw segments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-remux-segments-'));
  const calls = [];
  const result = await remuxMkvSegmentsToMp4({
    rawPaths: [join(root, 'one.mkv'), join(root, 'two.mkv')],
    outputPath: join(root, 'out.mp4'),
    maps: ['0:v:0', '0:a?'],
    runner: async (command, args) => {
      calls.push({ command, args });
      return { code: 0, stdout: '', stderr: '' };
    },
    validate: async () => ({ coherent: true, integrity: { advertisedFrames: 60, decodedFrames: 60 }, warning: null }),
  });

  assert.equal(result.outputPath, join(root, 'out.mp4'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'ffmpeg');
  assert.deepEqual(calls[0].args.slice(0, 6), ['-y', '-f', 'concat', '-safe', '0', '-i']);
  assert.equal(calls[0].args[7], '-map');
  assert.equal(calls[0].args[8], '0:v:0');
  assert.equal(calls[0].args[9], '-map');
  assert.equal(calls[0].args[10], '0:a?');
  assert.equal(calls[0].args.includes('0:a?'), true);
  await rm(root, { recursive: true, force: true });
});

test('remuxMkvToMp4 surfaces the validator warning to onLog and the return value', async () => {
  const logs = [];
  const result = await remuxMkvToMp4({
    rawPath: '/tmp/in.mkv',
    outputPath: '/tmp/out.mp4',
    onLog: (line) => logs.push(line),
    runner: async () => ({ code: 0, stdout: '', stderr: '' }),
    validate: async () => ({
      coherent: false,
      integrity: { advertisedFrames: 300, decodedFrames: 240 },
      warning: 'Partial recording: 240/300 frames decoded (60 missing).',
    }),
  });
  assert.match(result.warning ?? '', /Partial recording/);
  assert.ok(logs.some((line) => line.includes('WARN Partial recording')), 'warning should be logged');
});

test('remuxMkvToMp4 throws when the ffmpeg runner exits non-zero', async () => {
  await assert.rejects(
    () => remuxMkvToMp4({
      rawPath: '/tmp/in.mkv',
      outputPath: '/tmp/out.mp4',
      runner: async () => ({ code: 1, stdout: '', stderr: 'simulated ffmpeg failure' }),
      validate: async () => ({ coherent: true, integrity: {}, warning: null }),
    }),
    /Failed to remux MKV to MP4: simulated ffmpeg failure/,
  );
});

test('remuxMkvToMp4 propagates RemuxIncompleteError from the validator', async () => {
  await assert.rejects(
    () => remuxMkvToMp4({
      rawPath: '/tmp/in.mkv',
      outputPath: '/tmp/out.mp4',
      runner: async () => ({ code: 0, stdout: '', stderr: '' }),
      validate: async () => { throw new RemuxIncompleteError('no decodable frames', { filePath: '/tmp/out.mp4' }); },
    }),
    (err) => err instanceof RemuxIncompleteError,
  );
});
