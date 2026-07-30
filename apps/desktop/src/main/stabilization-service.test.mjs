import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STABILIZATION_METHOD_VERSION,
  buildDetectionArgs,
  buildTransformArgs,
  createStabilizationService,
  parseFfmpegProgress,
  probeStabilizationSupport,
  stabilizationCacheKeys,
  stabilizationSettings,
} from './stabilization-service.mjs';

const SOURCE_METADATA = {
  durationSeconds: 10,
  width: 1920,
  height: 1080,
  fps: 30,
  hasAudio: true,
};

function artifactPathFromArgs(args) {
  const filter = args[args.indexOf('-vf') + 1] ?? '';
  const match = filter.match(/vidstabdetect=.*result='([^']+)'/);
  return match?.[1] ?? args.at(-1);
}

test('probeStabilizationSupport requires both vidstab filters', async () => {
  const supported = await probeStabilizationSupport({
    runner: async () => ({
      code: 0,
      stdout: '... vidstabdetect ...\n... vidstabtransform ...',
      stderr: '',
    }),
  });
  assert.deepEqual(supported, {
    supported: true,
    filters: { vidstabdetect: true, vidstabtransform: true },
    reason: null,
  });

  const unsupported = await probeStabilizationSupport({
    runner: async () => ({ code: 0, stdout: '... vidstabdetect ...', stderr: '' }),
  });
  assert.equal(unsupported.supported, false);
  assert.match(unsupported.reason, /vidstabtransform/);
});

test('stabilization settings clamp strength and increase smoothing monotonically', () => {
  assert.equal(stabilizationSettings(-20).strength, 0);
  assert.equal(stabilizationSettings(500).strength, 100);
  assert.ok(stabilizationSettings(80).smoothing > stabilizationSettings(20).smoothing);
  assert.equal(stabilizationSettings(50).optzoom, 2);
});

test('cache keys reuse detection across strengths and invalidate on source stat changes', () => {
  const source = { size: 1234, mtimeMs: 5678 };
  const low = stabilizationCacheKeys('/video.mp4', source, 20);
  const high = stabilizationCacheKeys('/video.mp4', source, 80);
  assert.equal(low.analysisKey, high.analysisKey, 'motion analysis is reusable');
  assert.notEqual(low.proxyKey, high.proxyKey, 'strength gets its own preview');
  assert.notEqual(
    low.analysisKey,
    stabilizationCacheKeys('/video.mp4', { ...source, size: 1235 }, 20).analysisKey,
  );
  assert.notEqual(
    low.analysisKey,
    stabilizationCacheKeys('/video.mp4', { ...source, mtimeMs: 5679 }, 20).analysisKey,
  );
  assert.equal(STABILIZATION_METHOD_VERSION, 1);
});

test('ffmpeg arguments use fast detection, automatic zoom, original audio, and progress output', () => {
  const detection = buildDetectionArgs('/input.mp4', '/cache/motion.trf');
  assert.equal(detection[detection.indexOf('-an')], '-an');
  assert.match(detection[detection.indexOf('-vf') + 1], /vidstabdetect=/);
  assert.match(detection[detection.indexOf('-vf') + 1], /result='\/cache\/motion\.trf'/);
  assert.equal(detection[detection.indexOf('-f') + 1], 'null');
  assert.equal(detection.at(-1), '-');

  const transform = buildTransformArgs({
    sourcePath: '/input.mp4',
    transformPath: '/cache/motion.trf',
    outputPath: '/cache/preview.mp4',
    strength: 70,
    encoder: 'h264_nvenc',
  });
  assert.match(transform[transform.indexOf('-vf') + 1], /vidstabtransform=/);
  assert.match(transform[transform.indexOf('-vf') + 1], /optzoom=2/);
  assert.equal(transform[transform.indexOf('-map') + 1], '0:v:0');
  assert.equal(transform[transform.lastIndexOf('-map') + 1], '0:a?');
  assert.ok(transform.includes('aac'), 'preview keeps audio in a portable MP4 codec');
  assert.ok(transform.includes('h264_nvenc'));
  assert.equal(transform[transform.indexOf('-progress') + 1], 'pipe:2');
});

test('parseFfmpegProgress handles microseconds and clamps progress', () => {
  assert.equal(parseFfmpegProgress('out_time_us=2500000\n', 10), 0.25);
  assert.equal(parseFfmpegProgress('out_time_ms=5000000\n', 10), 0.5);
  assert.equal(parseFfmpegProgress('out_time_us=15000000\n', 10), 1);
  assert.equal(parseFfmpegProgress('frame=10\n', 10), null);
});

test('service caches analysis, publishes strength-specific proxies atomically, and returns metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-stabilization-'));
  const sourcePath = join(root, 'source.mp4');
  const cacheRoot = join(root, 'cache');
  await writeFile(sourcePath, 'source');
  const calls = [];
  const progress = [];
  const runner = async (_command, args, { onStderr } = {}) => {
    calls.push(args);
    const outputPath = artifactPathFromArgs(args);
    await writeFile(outputPath, args.some((arg) => String(arg).includes('vidstabdetect')) ? 'motion' : 'proxy');
    onStderr?.('out_time_us=5000000\n');
    return { code: 0, stdout: '', stderr: '' };
  };
  const service = createStabilizationService({
    cacheRoot,
    runner,
    sourceStat: async () => ({ size: 6, mtimeMs: 1234 }),
    probeMetadata: async () => SOURCE_METADATA,
  });

  const first = await service.prepare({
    sourceId: 'camera',
    sourcePath,
    strength: 25,
    onProgress: (event) => progress.push(event),
  });
  assert.equal(first.reused, false);
  assert.equal(first.encoder, 'h264_nvenc');
  assert.equal(first.sourceId, 'camera');
  assert.equal(first.metadata.width, 1920);
  assert.equal(await readFile(first.transformPath, 'utf8'), 'motion');
  assert.equal(await readFile(first.proxyPath, 'utf8'), 'proxy');
  assert.ok(progress.some((event) => event.phase === 'analyzing' && event.progress === 0.5));
  assert.ok(progress.some((event) => event.phase === 'encoding' && event.progress === 0.5));
  assert.ok(progress.some((event) => event.phase === 'ready' && event.progress === 1));
  assert.equal(calls.length, 2);

  const second = await service.prepare({ sourceId: 'camera', sourcePath, strength: 75 });
  assert.equal(second.reused, false);
  assert.equal(calls.length, 3, 'analysis reused while a new strength proxy is encoded');
  assert.equal(second.transformPath, first.transformPath);
  assert.notEqual(second.proxyPath, first.proxyPath);

  const cached = await service.prepare({ sourceId: 'camera', sourcePath, strength: 75 });
  assert.equal(cached.reused, true);
  assert.equal(calls.length, 3);
  await rm(root, { recursive: true, force: true });
});

test('service falls back from NVENC to CPU and removes failed partial output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-stabilization-fallback-'));
  const sourcePath = join(root, 'source.mp4');
  await writeFile(sourcePath, 'source');
  const encoders = [];
  const runner = async (_command, args) => {
    const outputPath = artifactPathFromArgs(args);
    if (args.some((arg) => String(arg).includes('vidstabdetect'))) {
      await writeFile(outputPath, 'motion');
      return { code: 0, stdout: '', stderr: '' };
    }
    const encoder = args[args.indexOf('-c:v') + 1];
    encoders.push(encoder);
    await writeFile(outputPath, `partial-${encoder}`);
    if (encoder === 'h264_nvenc') return { code: 1, stdout: '', stderr: 'No capable devices found' };
    await writeFile(outputPath, 'cpu-proxy');
    return { code: 0, stdout: '', stderr: '' };
  };
  const service = createStabilizationService({
    cacheRoot: join(root, 'cache'),
    runner,
    sourceStat: async () => ({ size: 6, mtimeMs: 1234 }),
    probeMetadata: async () => SOURCE_METADATA,
  });

  const result = await service.prepare({ sourceId: 'camera', sourcePath, strength: 50 });
  assert.deepEqual(encoders, ['h264_nvenc', 'libx264']);
  assert.equal(result.encoder, 'libx264');
  assert.equal(await readFile(result.proxyPath, 'utf8'), 'cpu-proxy');
  const files = await import('node:fs/promises').then(({ readdir }) => readdir(join(root, 'cache', 'proxies')));
  assert.equal(files.some((file) => file.includes('.part-')), false);
  await rm(root, { recursive: true, force: true });
});

test('service cancellation aborts work and leaves no published or partial proxy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-stabilization-cancel-'));
  const sourcePath = join(root, 'source.mp4');
  await writeFile(sourcePath, 'source');
  let release;
  const runner = async (_command, args, { signal } = {}) => {
    const outputPath = artifactPathFromArgs(args);
    if (args.some((arg) => String(arg).includes('vidstabdetect'))) {
      await writeFile(outputPath, 'motion');
      return { code: 0, stdout: '', stderr: '' };
    }
    await writeFile(outputPath, 'partial');
    await new Promise((resolve, reject) => {
      release = resolve;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    return { code: 0, stdout: '', stderr: '' };
  };
  const service = createStabilizationService({
    cacheRoot: join(root, 'cache'),
    runner,
    sourceStat: async () => ({ size: 6, mtimeMs: 1234 }),
    probeMetadata: async () => SOURCE_METADATA,
  });

  const prepared = service.prepare({ sourceId: 'camera', sourcePath, strength: 50 });
  while (typeof release !== 'function') await new Promise((resolve) => setImmediate(resolve));
  const [job] = service.listJobs();
  assert.equal(service.cancel(job.jobId), true);
  await assert.rejects(prepared, (error) => error?.name === 'AbortError');
  const cache = stabilizationCacheKeys(sourcePath, { size: 6, mtimeMs: 1234 }, 50);
  const expectedProxy = join(root, 'cache', 'proxies', `${cache.proxyKey}.mp4`);
  await assert.rejects(stat(expectedProxy));
  const files = await import('node:fs/promises').then(({ readdir }) => readdir(join(root, 'cache', 'proxies')));
  assert.equal(files.some((file) => file.includes('.part-')), false);
  await rm(root, { recursive: true, force: true });
});
