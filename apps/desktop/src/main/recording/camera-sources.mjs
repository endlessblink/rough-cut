import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export async function listV4l2CameraSources({ devRoot = '/dev' } = {}) {
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

  return devices.map((devicePath) => {
    const name = readV4l2DeviceName(devicePath) ?? devicePath;
    return {
      id: devicePath,
      name: devicePath,
      label: name === devicePath ? devicePath : `${name} (${devicePath})`,
    };
  });
}

function readV4l2DeviceName(devicePath) {
  const result = spawnSync('v4l2-ctl', ['--device', devicePath, '--info'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  const cardLine = result.stdout.split('\n').find((line) => line.trim().startsWith('Card type'));
  const name = cardLine?.split(':').slice(1).join(':').trim();
  return name || null;
}
