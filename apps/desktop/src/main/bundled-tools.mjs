import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export function configureBundledTools({ resourcesPath, env = process.env } = {}) {
  if (typeof resourcesPath !== 'string') return { bundled: false };
  const bin = join(resourcesPath, 'bin');
  const tools = ['ffmpeg', 'ffprobe', 'xdotool', 'xinput', 'pactl'];
  if (!tools.every((tool) => existsSync(join(bin, tool)))) return { bundled: false };
  env.PATH = [bin, env.PATH].filter(Boolean).join(delimiter);
  // Each media-tool wrapper sets its private library path. Electron keeps its own libraries.
  return { bundled: true, tools };
}
