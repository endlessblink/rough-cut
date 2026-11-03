// End-to-end gate for the rough-cut MCP's edit operations an agent uses to do what
// Noam does in the app, called over JSON-RPC to the real MCP server:
//   make_edit_copy, apply_edit insert_clip / add_voice_over / set_voice_over_mode /
//   move_clip / set_layout, undo_edit, then export_styled of the copy.
// Generated project: 6 s blue screen with a 440 Hz tone and a green camera bubble.
// Checks the saved copy and the exported picture and sound. The original is never changed.
// Usage: node scripts/e2e-mcp-edit-ops.mjs   (needs a display or xvfb-run)
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const FFMPEG = process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe';
const root = await mkdtemp(join(tmpdir(), 'rough-cut-mcp-edit-'));
const screenPath = join(root, 'screen.mp4');
const cameraPath = join(root, 'screen-camera.mp4');
const clipPath = join(root, 'red-clip.mp4');
const voicePath = join(root, 'voice.m4a');
fixture(screenPath, ['-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000'], 6);
fixture(cameraPath, ['-f', 'lavfi', '-i', 'color=c=green:s=640x480:r=30'], 6);
fixture(clipPath, ['-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'], 1);
fixture(voicePath, ['-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000'], 1, true);

const saved = await saveProjectForRecording({
  startedAt: '2026-01-01T00:00:00.000Z', stoppedAt: '2026-01-01T00:00:06.000Z',
  rawPath: screenPath, outputPath: screenPath, width: 1280, height: 720, fps: 30,
  audio: { micSource: 'test' }, camera: { outputPath: cameraPath, rawPath: cameraPath, width: 640, height: 480 }, cursorEvents: [],
});
const projectPath = saved.path;
const originalBytes = await readFile(projectPath, 'utf8');

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
    if (line.trim()) { const message = JSON.parse(line); pending.get(message.id)?.(message); pending.delete(message.id); }
  }
});
let nextId = 1;
const rpc = (method, params) => new Promise((resolve) => {
  const id = nextId++;
  pending.set(id, resolve);
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
});
const call = async (name, args) => {
  const reply = await rpc('tools/call', { name, arguments: args });
  if (reply.error || reply.result?.isError) throw new Error(`${name}: ${JSON.stringify(reply.error ?? reply.result)}`);
  return JSON.parse(reply.result.content.find((item) => item.type === 'text').text);
};
const edit = (args) => call('apply_edit', { project_path: projectPath, ...args });
const copyDoc = async () => JSON.parse(await readFile(projectPath.replace(/\.roughcut$/, '.claude-edit.roughcut'), 'utf8'));
const inserted = (doc) => doc.timeline.tracks.flatMap((track) => track.clips.map((clip) => ({ ...clip, trackId: track.id })))
  .filter((clip) => doc.assets.some((asset) => asset.metadata?.insertedMedia && clip.mediaId === `source:${asset.id}`));

try {
  await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  await call('make_edit_copy', { project_path: projectPath });

  await edit({ op: 'insert_clip', file: clipPath, atSec: 2, mode: 'insert' });
  let doc = await copyDoc();
  const clip = inserted(doc).find((item) => item.trackId !== 'track:voice-over' && item.timelineIn === 60);
  check(Boolean(clip) && clip.timelineOut === 90, `insert_clip lands at 2 s for 1 s (${clip?.timelineIn}-${clip?.timelineOut})`);

  await edit({ op: 'add_voice_over', file: voicePath, atSec: 4, mode: 'over' });
  doc = await copyDoc();
  const voice = inserted(doc).find((item) => item.trackId === 'track:voice-over');
  check(voice?.timelineIn === 120 && voice?.timelineOut === 150, `add_voice_over lands on the Voice lane at 4 s (${voice?.timelineIn}-${voice?.timelineOut})`);

  await edit({ op: 'set_voice_over_mode', clipId: voice.id, mode: 'replace' });
  await edit({ op: 'move_clip', clipId: voice.id, atSec: 5 });
  doc = await copyDoc();
  const moved = inserted(doc).find((item) => item.trackId === 'track:voice-over');
  const voiceAsset = doc.assets.find((asset) => asset.metadata?.insertedMedia?.kind === 'voice');
  check(moved?.timelineIn === 150 && voiceAsset?.metadata.insertedMedia.voiceMode === 'replace', `move_clip to 5 s and set to replace (${moved?.timelineIn}, ${voiceAsset?.metadata.insertedMedia.voiceMode})`);

  await edit({ op: 'set_layout', camera: false });
  await call('undo_edit', { project_path: projectPath });
  doc = await copyDoc();
  check(doc.assets.find((asset) => asset.type === 'recording').presentation?.camera?.visible !== false, 'undo_edit brings the camera back');
  await edit({ op: 'set_layout', camera: false, captions: false });

  const out = await call('export_styled', { project_path: projectPath.replace(/\.roughcut$/, '.claude-edit.roughcut'), out_path: join(root, 'edited.mp4') });
  const duration = probeDuration(out.export);
  check(Math.abs(duration - 7) < 0.15, `export is 7 s (6 s + 1 s clip), got ${duration}`);
  const inClip = frameAt(out.export, 2.5);
  check(inClip.count('red') > 50000, 'the inserted clip is on screen at 2.5 s');
  const later = frameAt(out.export, 3.5);
  check(later.count('blue') > 50000 && later.count('green') === 0, 'recording after the clip, camera bubble off');
  const underVoice = toneLevels(out.export, 5.2, 0.5);
  const beforeVoice = toneLevels(out.export, 4.3, 0.5);
  check(beforeVoice.at440 > -35, `recording sound before the voice-over (${beforeVoice.at440} dB)`);
  // The band filter lets a little of the 1 kHz voice through at 440 Hz, so compare with the level before it.
  check(underVoice.at1000 > -35 && underVoice.at440 < beforeVoice.at440 - 15, `voice-over replaces the recording there (1 kHz ${underVoice.at1000} dB; 440 Hz ${underVoice.at440} dB vs ${beforeVoice.at440} dB before)`);
  check((await readFile(projectPath, 'utf8')) === originalBytes, 'the original project is unchanged');
} finally {
  server.stdin.end();
  server.kill();
}

if (failures.length) { console.error(`FAILED (${failures.length}); files: ${root}`); process.exit(1); }
console.log(`PASS MCP edit ops e2e (${root})`);

function fixture(path, inputs, seconds, audioOnly = false) {
  const args = ['-y', '-v', 'error', ...inputs, '-t', String(seconds)];
  args.push(...(audioOnly ? ['-c:a', 'aac'] : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-shortest']), '-threads', '2', path);
  const result = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function frameAt(path, sec) {
  const W = 1920;
  const raw = spawnSync(FFMPEG, ['-v', 'error', '-ss', String(sec), '-i', path, '-frames:v', '1', '-vf', 'scale=1920:1080', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '2', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  if (raw.status !== 0) throw new Error(`frame grab failed: ${raw.stderr}`);
  const data = raw.stdout;
  const is = (i, name) => {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    return name === 'red' ? r > 180 && g < 70 && b < 70 : name === 'green' ? g > 90 && r < 60 && b < 60 : b > 180 && r < 70 && g < 70;
  };
  return { count: (name) => { let n = 0; for (let y = 0; y < 1080; y += 2) for (let x = 0; x < W; x += 2) if (is((y * W + x) * 3, name)) n += 1; return n; } };
}

function probeDuration(path) {
  return Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], { encoding: 'utf8' }).stdout.trim());
}

function toneLevels(path, from, length) {
  const band = (hz) => {
    const r = spawnSync(FFMPEG, ['-v', 'info', '-ss', String(from), '-t', String(length), '-i', path, '-vn', '-af', `bandpass=f=${hz}:width_type=q:w=8,volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
    const match = String(r.stderr).match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
    return !match || match[1] === '-inf' ? -Infinity : Number(match[1]);
  };
  return { at440: band(440), at1000: band(1000) };
}
