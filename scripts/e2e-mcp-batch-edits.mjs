// Gate for the AI-editing helpers of the rough-cut MCP, over JSON-RPC to the real server:
//   get_transcript (short lines), apply_edit (short receipt), apply_edits (batch, merged, back to front),
//   and no stray 1-3 frame clip left when a cut stops a hair short of the end.
// Generated project: 20 s blue screen with a tone and a transcript injected into the project file.
// Usage: node scripts/e2e-mcp-batch-edits.mjs   (no display needed)
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const FFMPEG = process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe';
const root = await mkdtemp(join(tmpdir(), 'rough-cut-mcp-batch-'));
const screenPath = join(root, 'screen.mp4');
const fx = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-t', '20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-shortest', '-threads', '2', screenPath], { encoding: 'utf8' });
if (fx.status !== 0) throw new Error(fx.stderr);

const saved = await saveProjectForRecording({
  startedAt: '2026-01-01T00:00:00.000Z', stoppedAt: '2026-01-01T00:00:20.000Z',
  rawPath: screenPath, outputPath: screenPath, width: 1280, height: 720, fps: 30,
  audio: { micSource: 'test' }, camera: null, cursorEvents: [],
});
const projectPath = saved.path;
const doc0 = JSON.parse(await readFile(projectPath, 'utf8'));
const w = (word, a, b) => ({ word, startFrame: Math.round(a * 30), endFrame: Math.round(b * 30), confidence: 0.9 });
doc0.transcript = { words: [w('hello', 1, 1.4), w('there', 1.5, 1.9), w('uh', 1.95, 2.2), w('again', 5, 5.4), w('hello', 5.5, 5.9), w('world', 6, 6.4),
  ...'we are going to test this thing today'.split(' ').map((x, i) => w(x, 14 + i * 0.25, 14.2 + i * 0.25)),
  ...'we are going to test this thing today'.split(' ').map((x, i) => w(x, 17 + i * 0.25, 17.2 + i * 0.25))], paragraphs: [], nonSpeech: [] };
await writeFile(projectPath, JSON.stringify(doc0));

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
const callRaw = async (name, args) => {
  const reply = await rpc('tools/call', { name, arguments: args });
  if (reply.error || reply.result?.isError) throw new Error(`${name}: ${JSON.stringify(reply.error ?? reply.result)}`);
  return reply.result.content.find((item) => item.type === 'text').text;
};
const call = async (name, args) => JSON.parse(await callRaw(name, args));
const copyDoc = async () => JSON.parse(await readFile(projectPath.replace(/\.roughcut$/, '.claude-edit.roughcut'), 'utf8'));

try {
  await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });

  const lines = await callRaw('get_transcript', { project_path: projectPath });
  check(lines.split('\n').length === 4 && lines.startsWith('[1.0-2.2] hello there uh'), `get_transcript gives short lines split at pauses (${JSON.stringify(lines)})`);
  const part = await callRaw('get_transcript', { project_path: projectPath, from: 4, to: 10 });
  check(part === '[5.0-6.4] again hello world', `get_transcript from/to reads one stretch (${part})`);

  const sug = await call('suggest_cuts', { project_path: projectPath, kinds: ['retake'] });
  const rt = sug.cuts.find((c) => c.kind === 'retake');
  check(sug.suggestions === 1 && rt && rt.startSec === 14 && rt.keepFrom === 17, `suggest_cuts finds the earlier of two identical takes (${JSON.stringify(sug.cuts)})`);
  const fil = await call('suggest_cuts', { project_path: projectPath, kinds: ['filler'] });
  check(fil.suggestions === 1 && fil.cuts[0].kind === 'filler' && Math.abs(fil.cuts[0].startSec - 1.95) < 0.1, `suggest_cuts finds a filler word (${JSON.stringify(fil.cuts)})`);

  await call('make_edit_copy', { project_path: projectPath });
  const one = await call('apply_edit', { project_path: projectPath, op: 'cut_range', startSec: 18, endSec: 19.95 });
  check(one.ok === true && !one.summary && JSON.stringify(one).length < 300, `apply_edit returns a short receipt (${JSON.stringify(one).length} chars)`);
  check(Math.abs(one.durationSec - 18) < 0.01, `a cut that stops 0.05 s short of the end is widened to the end (duration ${one.durationSec})`);
  let doc = await copyDoc();
  const minClip = Math.min(...doc.timeline.tracks.flatMap((t) => t.clips.map((c) => c.timelineOut - c.timelineIn)));
  check(minClip > 3, `no stray 1-3 frame clip left (smallest clip ${minClip} frames)`);

  const batch = await call('apply_edits', { project_path: projectPath, ops: [
    { op: 'cut_range', startSec: 10, endSec: 12, gate: 'silence' },
    { op: 'cut_range', startSec: 2, endSec: 4, gate: 'silence' },
    { op: 'cut_range', startSec: 11.5, endSec: 13, gate: 'silence' },
    { op: 'cut_range', startSec: 0, endSec: 0.05, gate: 'silence' },
  ] });
  check(batch.cuts === 3 && Math.abs(batch.removedSec - (0.05 + 2 + 3)) < 0.01, `batch merges overlapping cuts (${batch.cuts} cuts, ${batch.removedSec} s removed)`);
  check(Math.abs(batch.durationAfterSec - (18 - 5.05)) < 0.02, `batch result is the right length (${batch.durationAfterSec} s)`);
  doc = await copyDoc();
  const minAfter = Math.min(...doc.timeline.tracks.flatMap((t) => t.clips.map((c) => c.timelineOut - c.timelineIn)));
  check(minAfter > 3, `no stray clip after the batch (smallest ${minAfter} frames)`);
  check(JSON.stringify(batch).length < 300, 'batch reply is short');

  const rev = await call('review_edit', { project_path: projectPath, render: true });
  check(rev.pass === true && rev.joins.length === 2 && rev.draftChecked === true, `review_edit passes a clean edit and lists the joins (${JSON.stringify(rev)})`);

  // The takes gate: repeats cannot be cut until a takes table passes.
  const fail = async (name, args) => { try { await callRaw(name, args); return null; } catch (error) { return String(error.message); } };
  const noGate = await fail('apply_edits', { project_path: projectPath, ops: [{ op: 'cut_range', startSec: 14, endSec: 16.1 }] });
  check(Boolean(noGate) && noGate.includes('Takes gate'), 'a repeat cut is refused without a passed takes table');
  const unit = (id, startSec, endSec, gist, group, keep, reason = '') => ({ id, startSec, endSec, gist, group, keep, reason });
  const bad = await call('takes_gate', { project_path: projectPath, stage: 'plan', units: [
    unit('u1', 1, 2, 'a greeting to the viewer', 'A', true), unit('u2', 5, 6.5, 'again hello world words', 'B', true),
    unit('u3', 14, 16.1, 'announce we will test the thing today', 'C', false, 'earlier take, stumbles') ] });
  check(bad.pass === false && bad.problems.some((p) => p.includes('kept takes')) && bad.problems.some((p) => p.includes('not in any unit')), `gate fails: a group with no kept take and uncovered words (${bad.problems.length} problems)`);
  const good = await call('takes_gate', { project_path: projectPath, stage: 'plan', units: [
    unit('u1', 1, 2, 'a greeting to the viewer', 'A', true), unit('u2', 5, 6.5, 'again hello world words', 'B', true),
    unit('u3', 14, 16.1, 'announce we will test the thing today', 'C', false, 'earlier take, stumbles'),
    unit('u4', 17, 19.1, 'announce we will test the thing today', 'C', true),
    unit('u5', 8, 9, 'a quiet pause with nothing said', 'E', false, 'dead air, no words'), unit('u6', 9, 10, 'a quiet pause with nothing said', 'E', true) ] });
  check(good.pass === true && good.cuts.length === 2 && good.cuts[0].startSec === 8 && good.cuts[1].startSec === 14, `gate passes a complete table and returns the cut (${JSON.stringify(good.cuts)})`);
  const outside = await fail('apply_edits', { project_path: projectPath, ops: [{ op: 'cut_range', startSec: 5, endSec: 6.5 }] });
  check(Boolean(outside) && outside.includes('not part of the passed takes table'), 'a cut outside the passed table is refused');
  const okCut = await call('apply_edits', { project_path: projectPath, ops: [{ op: 'cut_range', startSec: 8, endSec: 9 }] });
  check(okCut.ok === true, 'the cut from the passed table is accepted');
  const dup = await call('takes_gate', { project_path: projectPath, stage: 'final', units: [
    unit('f1', 0, 3, 'announce we will test the thing today', 'C', true), unit('f2', 3, 6, 'announce we will test the thing today', 'D', true) ] });
  check(dup.pass === false && dup.problems.some((p) => p.includes('REPEAT')), 'final stage flags the same idea twice in the finished cut');
} finally {
  server.kill();
}
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
