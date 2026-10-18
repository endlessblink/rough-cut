import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ICON_SIZES, makeIcon } from './make-icon.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = join(root, 'apps', 'desktop', 'assets', 'rough-cut-mvp-icon.png');
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

function pixel(ico, streamIndex, size, x, y) {
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', ico, '-map', `0:v:${streamIndex}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(raw.status, 0, String(raw.stderr));
  const offset = (y * size + x) * 4;
  return { r: raw.stdout[offset], g: raw.stdout[offset + 1], b: raw.stdout[offset + 2], a: raw.stdout[offset + 3] };
}

// The artwork is a near-black rounded square. On the dark Windows taskbar it was effectively invisible, so the icon
// carries a light rim around it.
test('the Windows icon has every size and a light rim around the dark artwork', { skip: !hasFfmpeg && 'ffmpeg is not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'rough-cut-icon-'));
  try {
    const ico = join(dir, 'rough-cut.ico');
    makeIcon(source, ico);

    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', ico], { encoding: 'utf8' });
    assert.deepEqual(probe.stdout.trim().split(/\s+/).map(Number), ICON_SIZES);

    const big = ICON_SIZES.length - 1;
    const size = ICON_SIZES[big];
    const rim = pixel(ico, big, size, 4, size / 2);
    assert.ok(rim.a > 200, `the rim is opaque (alpha ${rim.a})`);
    assert.ok(Math.min(rim.r, rim.g, rim.b) > 190, `the rim is light (rgb ${rim.r},${rim.g},${rim.b})`);

    const body = pixel(ico, big, size, size / 2, size / 2);
    assert.ok(Math.max(body.r, body.g, body.b) < 110, `the artwork itself stays dark (rgb ${body.r},${body.g},${body.b})`);

    const corner = pixel(ico, big, size, 0, 0);
    assert.equal(corner.a, 0, 'the corner outside the rounded shape stays transparent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
