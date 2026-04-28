import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startFfmpegCapture } from './recording/ffmpeg-capture.mjs';
import { assertReadableMp4 } from './media-probe.mjs';
import { remuxMkvToMp4 } from './remux-service.mjs';

test('remuxes a short mkv recording to readable mp4', { timeout: 30_000 }, async () => {
  if (!process.env.DISPLAY) return;

  const root = await mkdtemp(join(tmpdir(), 'rough-cut-remux-'));
  const rawPath = join(root, 'capture.mkv');
  const outputPath = join(root, 'capture.mp4');
  const capture = startFfmpegCapture({
    outputPath: rawPath,
    fps: 30,
    display: ':0+0,0',
    width: 320,
    height: 240,
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));
  await capture.stop();
  await remuxMkvToMp4({ rawPath, outputPath });
  await assertReadableMp4(outputPath);

  await rm(root, { recursive: true, force: true });
});
