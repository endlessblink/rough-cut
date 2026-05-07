import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export async function listV4l2CameraSources({ devRoot = '/dev', readDeviceInfo = readV4l2DeviceInfo } = {}) {
  let entries = [];
  try {
    entries = await readdir(devRoot);
  } catch {
    return [];
  }

  const devices = entries
    .filter((entry) => /^video\d+$/.test(entry))
    .sort((left, right) => Number(left.slice(5)) - Number(right.slice(5)))
    .map((entry) => join(devRoot, entry));

  return devices
    .map((devicePath) => {
      const info = readDeviceInfo(devicePath);
      if (info && !info.videoCapture) return null;
      const name = info?.name ?? devicePath;
      return {
        id: devicePath,
        name: devicePath,
        label: name === devicePath ? devicePath : `${name} (${devicePath})`,
      };
    })
    .filter(Boolean);
}

function readV4l2DeviceInfo(devicePath) {
  const result = spawnSync('v4l2-ctl', ['--device', devicePath, '--info'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return parseV4l2DeviceInfo(result.stdout);
}

export function parseV4l2DeviceInfo(stdout) {
  const cardLine = stdout.split('\n').find((line) => line.trim().startsWith('Card type'));
  const name = cardLine?.split(':').slice(1).join(':').trim();
  const deviceCapsSection = stdout.split(/\n\s*Device Caps\s*:/u)[1] ?? stdout;
  return {
    name: name || null,
    videoCapture: /\n\s*Video Capture\b/u.test(deviceCapsSection),
  };
}
