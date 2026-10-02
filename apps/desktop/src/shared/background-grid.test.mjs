import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildBackgroundGridFilter, drawBackgroundGrid, isBackgroundGridOn } from './background-grid.mjs';

test('grid defaults: on for a plain colour, off for wallpapers and gradients, explicit choice wins', () => {
  assert.equal(isBackgroundGridOn({ bgColor: '#050505', bgGradient: null }), true);
  assert.equal(isBackgroundGridOn({ bgColor: '#050505', bgGradient: null, bgImage: null }), true);
  assert.equal(isBackgroundGridOn({ bgGradient: 'linear-gradient(red, blue)' }), false);
  assert.equal(isBackgroundGridOn({ bgImage: '/wall.jpg' }), false);
  assert.equal(isBackgroundGridOn({ bgImage: '/wall.jpg', bgGrid: true }), true);
  assert.equal(isBackgroundGridOn({ bgColor: '#050505', bgGrid: false }), false);
  assert.equal(isBackgroundGridOn(undefined), true);
});

test('the canvas grid draws 11 interior lines each way and none on the outer edge', () => {
  const moves = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, stroke() {},
    set lineWidth(_) {}, set strokeStyle(value) { this.style = value; },
    moveTo(x, y) { moves.push([x, y]); }, lineTo() {},
  };
  drawBackgroundGrid(ctx, 1200, 600);
  assert.equal(moves.length, 22);
  assert.deepEqual(moves[0], [100, 0]);
  assert.deepEqual(moves[10], [1100, 0]);
  assert.deepEqual(moves[11], [0, 50]);
  assert.equal(ctx.style, 'rgba(148, 163, 184, 0.18)');
});

const ffmpegAvailable = spawnSync('ffmpeg', ['-version']).status === 0;

test('the export filter puts the same faint lines on the same pixels (one real 480x270 frame)', { skip: !ffmpegAvailable && 'ffmpeg not installed' }, () => {
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=480x270:r=1:d=1',
    '-vf', buildBackgroundGridFilter(), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: 1 << 24 });
  assert.equal(result.status, 0, String(result.stderr));
  const px = (x, y) => result.stdout[(y * 480 + x) * 3];
  // 480/12 = 40: the line at x=40 straddles columns 39 and 40 at half strength: 148 * 0.18 * 0.5 ≈ 13.
  assert.ok(Math.abs(px(39, 10) - 13) <= 1 && Math.abs(px(40, 10) - 13) <= 1, `line columns: ${px(39, 10)} ${px(40, 10)}`);
  assert.equal(px(20, 10), 0, 'between lines stays background');
  assert.equal(px(0, 10), 0, 'no line on the outer edge');
  assert.equal(px(20, 0), 0, 'no line on the top edge');
  // 270/12 = 22.5: the row line at y=135 straddles rows 134 and 135.
  assert.ok(Math.abs(px(20, 134) - 13) <= 1 && Math.abs(px(20, 135) - 13) <= 1, `line rows: ${px(20, 134)} ${px(20, 135)}`);
  // Where a vertical and a horizontal line cross it is not doubled.
  assert.ok(px(40, 135) <= 30);
});
