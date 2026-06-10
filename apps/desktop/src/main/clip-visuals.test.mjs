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
  const short = filmstripPlan(12);
  assert.equal(short.tiles, Math.ceil(12 / FILMSTRIP_INTERVAL_SEC));
  assert.ok(Math.abs(short.stripSeconds - 12) < 0.01, 'strip covers the source duration');

  const long = filmstripPlan(3 * 60 * 60); // 3h
  assert.equal(long.tiles, FILMSTRIP_MAX_TILES, 'tiles capped');
  assert.ok(long.intervalSec > FILMSTRIP_INTERVAL_SEC, 'interval stretches instead');
});

test('buildFilmstripArgs tiles one row at the strip height', () => {
  const args = buildFilmstripArgs('/tmp/in.mp4', '/tmp/out.png', 25);
  const vf = args[args.indexOf('-vf') + 1];
  assert.match(vf, new RegExp(`scale=-2:${FILMSTRIP_HEIGHT}`));
  assert.match(vf, /tile=\d+x1/);
  assert.equal(args[args.indexOf('-frames:v') + 1], '1');
});

test('buildWaveformArgs renders a single mono waveform image', () => {
  const args = buildWaveformArgs('/tmp/in.mp4', '/tmp/wave.png');
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, new RegExp(`showwavespic=s=${WAVEFORM_WIDTH}x\\d+`));
  assert.match(filter, /channel_layouts=mono/);
});

test('visualCacheKey changes with mtime and kind', () => {
  const a = visualCacheKey('/a.mp4', 1000, 'filmstrip');
  assert.notEqual(a, visualCacheKey('/a.mp4', 2000, 'filmstrip'));
  assert.notEqual(a, visualCacheKey('/a.mp4', 1000, 'waveform'));
  assert.equal(a, visualCacheKey('/a.mp4', 1000.4, 'filmstrip'), 'sub-ms noise ignored');
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
