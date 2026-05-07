import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listV4l2CameraSources, parseV4l2DeviceInfo } from './camera-sources.mjs';

const captureInfo = `Driver Info:
    Driver name      : uvcvideo
    Card type        : Lenovo FHD Webcam
Device Caps     : 0x04200001
    Video Capture
    Streaming
    Extended Pix Format
`;

const metadataInfo = `Driver Info:
    Driver name      : uvcvideo
    Card type        : Lenovo FHD Webcam: Lenovo FHD Webcam
Device Caps     : 0x04a00000
    Metadata Capture
    Streaming
    Extended Pix Format
`;

test('parseV4l2DeviceInfo detects usable video capture devices', () => {
  assert.deepEqual(parseV4l2DeviceInfo(captureInfo), {
    name: 'Lenovo FHD Webcam',
    videoCapture: true,
  });
  assert.deepEqual(parseV4l2DeviceInfo(metadataInfo), {
    name: 'Lenovo FHD Webcam: Lenovo FHD Webcam',
    videoCapture: false,
  });
});

test('listV4l2CameraSources filters metadata-only video nodes', async () => {
  const devRoot = await mkdtemp(join(tmpdir(), 'rough-cut-v4l2-'));
  await writeFile(join(devRoot, 'video0'), '');
  await writeFile(join(devRoot, 'video1'), '');

  const sources = await listV4l2CameraSources({
    devRoot,
    readDeviceInfo: (devicePath) => parseV4l2DeviceInfo(devicePath.endsWith('video0') ? captureInfo : metadataInfo),
  });

  assert.deepEqual(sources, [
    {
      id: join(devRoot, 'video0'),
      name: join(devRoot, 'video0'),
      label: `Lenovo FHD Webcam (${join(devRoot, 'video0')})`,
    },
  ]);
});
