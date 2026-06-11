import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FILMSTRIP_HEIGHT,
  FILMSTRIP_INTERVAL_SEC,
  FILMSTRIP_MAX_TILES,
  WAVEFORM_WIDTH,
  buildFilmstripArgs,
  buildWaveformArgs,
  ensureClipVisual,
  filmstripPlan,
  visualCacheKey,
  visualsCacheDir,
} from './clip-visuals.mjs';

test('filmstripPlan covers short and very long sources with bounded tiles', () => {
  const short = filmstripPlan(60);
  assert.equal(short.tiles, Math.ceil(60 / FILMSTRIP_INTERVAL_SEC));
  assert.ok(Math.abs(short.stripSeconds - 60) < 0.01, 'strip covers the source duration');

  const long = filmstripPlan(3 * 60 * 60); // 3h
  assert.equal(long.tiles, FILMSTRIP_MAX_TILES, 'tiles capped');
  assert.ok(long.intervalSec > FILMSTRIP_INTERVAL_SEC, 'interval stretches instead');
});

test('filmstripPlan honors the requested zoom bucket within bounds', () => {
  assert.equal(filmstripPlan(600, 32).tiles, 32);
  assert.equal(filmstripPlan(600, 1).tiles, 6, 'floor');
  assert.equal(filmstripPlan(600, 4096).tiles, FILMSTRIP_MAX_TILES, 'ceiling');
});

test('buildFilmstripArgs tiles one row of cover-cropped uniform tiles', () => {
  const args = buildFilmstripArgs('/tmp/in.mp4', '/tmp/out.png', 25, 8);
  assert.equal(args[args.indexOf('-skip_frame') + 1], 'nokey', 'keyframe-only decode keeps long sources fast');
  const vf = args[args.indexOf('-vf') + 1];
  assert.match(vf, /force_original_aspect_ratio=increase/);
  assert.match(vf, new RegExp(`crop=\\d+:${FILMSTRIP_HEIGHT}`), 'tiles are cover-cropped, never squashed');
  assert.match(vf, /tile=8x1/);
  assert.equal(args[args.indexOf('-frames:v') + 1], '1');
});

test('buildWaveformArgs renders a single mono waveform at the bucketed width', () => {
  const filter = (args) => args[args.indexOf('-filter_complex') + 1];
  assert.match(filter(buildWaveformArgs('/tmp/in.mp4', '/tmp/wave.png')), new RegExp(`showwavespic=s=${WAVEFORM_WIDTH}x\\d+`));
  assert.match(filter(buildWaveformArgs('/tmp/in.mp4', '/tmp/wave.png', 4096)), /showwavespic=s=4096x\d+/);
  assert.match(filter(buildWaveformArgs('/tmp/in.mp4', '/tmp/wave.png', 99999)), /showwavespic=s=8192x\d+/, 'width capped');
  assert.match(filter(buildWaveformArgs('/tmp/in.mp4', '/tmp/wave.png')), /channel_layouts=mono/);
});

test('visualCacheKey changes with mtime, kind, and zoom variant', () => {
  const a = visualCacheKey('/a.mp4', 1000, 'filmstrip', 16);
  assert.notEqual(a, visualCacheKey('/a.mp4', 2000, 'filmstrip', 16));
  assert.notEqual(a, visualCacheKey('/a.mp4', 1000, 'waveform', 16));
  assert.notEqual(a, visualCacheKey('/a.mp4', 1000, 'filmstrip', 32), 'zoom buckets cache separately');
  assert.equal(a, visualCacheKey('/a.mp4', 1000.4, 'filmstrip', 16), 'sub-ms noise ignored');
});

test('ensureClipVisual short-circuits on cache hit and runs ffmpeg once otherwise', async () => {
  const runs = [];
  const existing = new Set();
  const statImpl = async (path) => {
    if (path === '/src.mp4') return { mtimeMs: 1234 };
    if (existing.has(path)) return { mtimeMs: 1 };
    throw new Error('missing');
  };
  const runner = async (args) => {
    runs.push(args);
    existing.add(args[args.length - 1]);
  };

  const first = await ensureClipVisual({ projectPath: '/tmp/p/x.roughcut', sourcePath: '/src.mp4', kind: 'filmstrip', durationSec: 30, runner, statImpl });
  assert.equal(runs.length, 1, 'generated on miss');
  assert.ok(first.path.startsWith(visualsCacheDir('/tmp/p/x.roughcut')));
  assert.ok(first.tiles >= 1 && typeof first.intervalSec === 'number');

  const second = await ensureClipVisual({ projectPath: '/tmp/p/x.roughcut', sourcePath: '/src.mp4', kind: 'filmstrip', durationSec: 30, runner, statImpl });
  assert.equal(runs.length, 1, 'cache hit skips ffmpeg');
  assert.equal(second.path, first.path);

  await assert.rejects(
    () => ensureClipVisual({ projectPath: '/p.roughcut', sourcePath: '/src.mp4', kind: 'nope', durationSec: 1, runner, statImpl }),
    /Unknown clip visual kind/,
  );
});
