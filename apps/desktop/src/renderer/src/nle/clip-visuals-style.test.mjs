import test from 'node:test';
import assert from 'node:assert/strict';
import { clipSourceFilePath, filmstripBackground, waveformBackground } from './clip-visuals-style.mjs';

const project = {
  document: {
    assets: [{ id: 'a1', filePath: 'media/take.mp4' }],
    timeline: {
      sources: [
        { id: 'source:a1:screen', assetId: 'a1' },
        { id: 'source:gen', aiAssetId: 'g1' },
      ],
    },
  },
};

test('clipSourceFilePath resolves through source → asset, skips AI sources', () => {
  assert.equal(clipSourceFilePath(project, 'source:a1:screen'), 'media/take.mp4');
  assert.equal(clipSourceFilePath(project, 'source:gen'), null);
  assert.equal(clipSourceFilePath(project, 'missing'), null);
});

test('filmstripBackground slices the strip by sourceIn at the timeline scale', () => {
  // 30fps, 0.5 px/frame → 15 px per source-second. 100s strip → 1500px wide.
  const style = filmstripBackground(
    { url: 'media://file/strip.png', stripSeconds: 100 },
    { sourceInFrames: 90, fps: 30, pixelsPerFrame: 0.5 },
  );
  assert.equal(style.backgroundSize, '1500.00px 100%');
  assert.equal(style.backgroundPosition, '-45.00px 0'); // 3s in → 45px
  assert.match(style.backgroundImage, /strip\.png/);
});

test('waveformBackground uses the full asset duration as coverage', () => {
  const style = waveformBackground(
    { url: 'media://file/wave.png', durationSec: 60 },
    { sourceInFrames: 0, fps: 30, pixelsPerFrame: 1 },
  );
  assert.equal(style.backgroundSize, '1800.00px 100%');
  assert.equal(style.backgroundPosition, '0.00px 0');
});

test('background helpers return null on degenerate input', () => {
  assert.equal(filmstripBackground(null, { sourceInFrames: 0, fps: 30, pixelsPerFrame: 1 }), null);
  assert.equal(filmstripBackground({ url: 'x', stripSeconds: 0 }, { sourceInFrames: 0, fps: 30, pixelsPerFrame: 1 }), null);
  assert.equal(waveformBackground({ url: 'x', durationSec: 10 }, { sourceInFrames: 0, fps: 30, pixelsPerFrame: 0 }), null);
});

test('zoom buckets quantize to powers of two within bounds', async () => {
  const { filmstripTileBucket, waveformWidthBucket, pickVisual } = await import('./clip-visuals-style.mjs');
  // 355s * 30fps * 0.156 ppf ≈ 1662px → ~19 tiles desired → bucket 32.
  assert.equal(filmstripTileBucket(355, 30, 0.156), 32);
  assert.equal(filmstripTileBucket(355, 30, 4), 128, 'deep zoom caps');
  assert.equal(waveformWidthBucket(10, 30, 0.1), 512, 'floor');
  assert.equal(waveformWidthBucket(3600, 30, 4), 8192, 'cap');

  const visuals = {
    'filmstrip:/a.mp4:16': { url: 'u16' },
    'filmstrip:/a.mp4:64': { url: 'u64' },
  };
  assert.equal(pickVisual(visuals, 'filmstrip', '/a.mp4', 64).url, 'u64', 'exact bucket');
  assert.equal(pickVisual(visuals, 'filmstrip', '/a.mp4', 32).url, 'u16', 'nearest while regenerating');
  assert.equal(pickVisual(visuals, 'filmstrip', '/b.mp4', 32), null);
});
