import { existsSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';

// The media tools shipped under <resources>/bin. Windows needs only ffmpeg/ffprobe: cursor and click
// telemetry come from Electron and a native hook there, not from xdotool/xinput/pactl.
const TOOLS = {
  linux: ['ffmpeg', 'ffprobe', 'xdotool', 'xinput', 'pactl'],
  win32: ['ffmpeg.exe', 'ffprobe.exe'],
  // The Mac takes cursor, clicks and devices from Electron, the native hook and AVFoundation: only FFmpeg is shipped.
  darwin: ['ffmpeg', 'ffprobe'],
};

export function configureBundledTools({ resourcesPath, env = process.env, platform = process.platform } = {}) {
  if (typeof resourcesPath !== 'string') return { bundled: false };
  const tools = TOOLS[platform] ?? TOOLS.linux;
  const path = platform === 'win32' ? win32 : posix;
  const bin = join(resourcesPath, 'bin');
  if (!tools.every((tool) => existsSync(join(bin, tool)))) return { bundled: false };
  // Windows keeps the variable as `Path`; process.env is case-insensitive there but a plain object is not.
  const key = platform === 'win32' ? (Object.keys(env).find((name) => name.toLowerCase() === 'path') ?? 'Path') : 'PATH';
  env[key] = [bin, env[key]].filter(Boolean).join(path.delimiter);
  // Each media-tool wrapper sets its private library path. Electron keeps its own libraries.
  return { bundled: true, tools };
}
