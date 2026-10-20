// End-to-end gate for the rough-cut MCP's export_styled tool, called the way an agent
// calls it (JSON-RPC over stdio to the real MCP server, which runs the app's own
// export without a window). A small generated project: blue screen with a 440 Hz
// tone, a green camera bubble and one caption line. Three exports:
//  1. as laid out: captions burned in, camera bubble present
//  2. captions: false - no caption box, camera still there
//  3. camera: false, start_sec 2, end_sec 4 - no bubble, 2 s long, picture and sound present
// Usage: node scripts/e2e-mcp-export-styled.mjs   (needs a display or xvfb-run)
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { addCaption } from '../apps/desktop/src/shared/captions.mjs';

const FFMPEG = process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe';
const root = await mkdtemp(join(tmpdir(), 'rough-cut-mcp-export-'));
const fps = 30;
const screenPath = join(root, 'screen.mp4');
const cameraPath = join(root, 'screen-camera.mp4');
fixture(screenPath, 'color=c=blue:s=1280x720:r=30', 6, 'sine=frequency=440:sample_rate=48000');
fixture(cameraPath, 'color=c=green:s=640x480:r=30', 6, null);

const saved = await saveProjectForRecording({
  startedAt: '2026-01-01T00:00:00.000Z',
  stoppedAt: '2026-01-01T00:00:06.000Z',
  rawPath: screenPath,
  outputPath: screenPath,
  width: 1280,
  height: 720,
  fps,
  audio: { micSource: 'test' },
  camera: { outputPath: cameraPath, rawPath: cameraPath, width: 640, height: 480 },
  cursorEvents: [],
});
const captioned = addCaption(saved.document, 0, { lengthFrames: 150, text: 'THE BEST VIDEO EDITOR EVER' });
const projectPath = saved.path;
await saveProjectFile(projectPath, { ...captioned.document, captions: { ...(captioned.document.captions ?? {}), enabled: true } });

const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

const server = spawn(process.execPath, ['scripts/mcp/rough-cut-mcp.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buffer = '';
const pending = new Map();
server.stdout.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  }
});
let nextId = 1;
const rpc = (method, params) => new Promise((resolve) => {
  const id = nextId++;
  pending.set(id, resolve);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
});
const exportStyled = async (args) => {
  const reply = await rpc('tools/call', { name: 'export_styled', arguments: { project_path: projectPath, ...args } });
  if (reply.error || reply.result?.isError) throw new Error(JSON.stringify(reply.error ?? reply.result));
  return JSON.parse(reply.result.content.find((item) => item.type === 'text').text);
};

try {
  await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  const tools = await rpc('tools/list', {});
  check(tools.result.tools.some((tool) => tool.name === 'export_styled'), 'the MCP lists export_styled');

  const full = await exportStyled({ out_path: join(root, 'as-laid-out.mp4') });
  const withCaptions = frameAt(full.export, 1.0);
  check(withCaptions.count('white', 0, 1080 * 0.7, 1920, 1080) > 300, `captions burned in as laid out (${withCaptions.count('white', 0, 1080 * 0.7, 1920, 1080)} caption pixels)`);
  check(withCaptions.count('green', 0, 0, 1920, 1080) > 2000, 'camera bubble present as laid out');

  const clean = await exportStyled({ out_path: join(root, 'no-captions.mp4'), captions: false });
  const noCaptions = frameAt(clean.export, 1.0);
  check(noCaptions.count('white', 0, 1080 * 0.7, 1920, 1080) < 20, `captions: false leaves them out (${noCaptions.count('white', 0, 1080 * 0.7, 1920, 1080)} caption pixels)`);
  check(noCaptions.count('green', 0, 0, 1920, 1080) > 2000, 'camera bubble still there with captions off');

  const ranged = await exportStyled({ out_path: join(root, 'range-no-camera.mp4'), camera: false, start_sec: 2, end_sec: 4 });
  const duration = Number(ranged.durationSeconds ?? ranged.duration ?? probeDuration(ranged.export));
  check(Math.abs(probeDuration(ranged.export) - 2) < 0.1, `start_sec 2 to end_sec 4 gives 2 s (${probeDuration(ranged.export)} s; tool said ${duration})`);
  const noCamera = frameAt(ranged.export, 1.0);
  check(noCamera.count('green', 0, 0, 1920, 1080) === 0, 'camera: false leaves the bubble out');
  check(noCamera.count('blue', 0, 0, 1920, 1080) > 20000, 'the screen is there in the range');
  check(meanVolume(ranged.export) > -35, `sound kept in the range (${meanVolume(ranged.export)} dB)`);
} finally {
  server.stdin.end();
  server.kill();
}

if (failures.length) { console.error(`FAILED (${failures.length}); files: ${root}`); process.exit(1); }
console.log(`PASS MCP export_styled e2e (${root})`);

function fixture(path, video, seconds, audio) {
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', video];
  if (audio) args.push('-f', 'lavfi', '-i', audio);
  args.push('-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15');
  if (audio) args.push('-c:a', 'aac', '-shortest');
  args.push('-threads', '2', path);
  const result = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function frameAt(path, sec) {
  const W = 1920;
  const raw = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(sec), '-i', path, '-frames:v', '1', '-vf', 'scale=1920:1080', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '2', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  if (raw.status !== 0) throw new Error(`frame grab failed: ${raw.stderr}`);
  const data = raw.stdout;
  const pixel = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const is = ([r, g, b], name) => (name === 'white' ? r > 215 && g > 215 && b > 215
    : name === 'green' ? g > 90 && r < 60 && b < 60
      : name === 'blue' ? b > 180 && r < 70 && g < 70 : false);
  const count = (color, x0, y0, x1, y1) => {
    let n = 0;
    for (let y = Math.round(y0); y < y1; y += 2) for (let x = Math.round(x0); x < x1; x += 2) if (is(pixel(x, y), color)) n += 1;
    return n;
  };
  return { count };
}

function probeDuration(path) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}

function meanVolume(path) {
  const r = spawnSync(FFMPEG, ['-v', 'info', '-i', path, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const match = String(r.stderr).match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
  return !match || match[1] === '-inf' ? -Infinity : Number(match[1]);
}
