#!/usr/bin/env node
// Rough Cut MCP server (phase 1: watch and cut). Dependency-free stdio JSON-RPC.
// Edits only ever touch a COPY of a project (`<name>.claude-edit.roughcut`).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL_URL = pathToFileURL(resolve(HERE, '../../packages/project-model/dist/index.js')).href;
const DEFAULT_DIRS = (process.env.ROUGH_CUT_PROJECT_DIRS ?? join(homedir(), 'Documents', 'Rough Cut MVP'))
  .split(':').filter(Boolean);
const MAX_FRAMES = 24;

let modelPromise;
const model = () => (modelPromise ??= import(MODEL_URL));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${String(r.stderr).slice(-600)}`);
  return r.stdout;
}

function findProjects(dir, depth = 0, out = []) {
  if (depth > 4 || !existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.')) findProjects(p, depth + 1, out);
    else if (e.isFile() && e.name.endsWith('.roughcut')) out.push(p);
  }
  return out;
}

const loadProject = (path) => JSON.parse(readFileSync(path, 'utf8'));
const assetPath = (projectPath, asset) =>
  asset.pathMode === 'relative' || !asset.filePath.startsWith('/')
    ? resolve(dirname(projectPath), asset.filePath)
    : asset.filePath;

function ffprobe(file) {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]));
  const v = j.streams.find((s) => s.codec_type === 'video');
  return {
    duration: Number(j.format.duration),
    width: v?.width, height: v?.height,
    hasAudio: j.streams.some((s) => s.codec_type === 'audio'),
  };
}

function summarise(path) {
  const d = loadProject(path);
  const fps = d.settings?.frameRate ?? 30;
  const tracks = d.timeline.tracks.map((t) => ({
    id: t.id, name: t.name, type: t.type, locked: !!t.locked,
    clips: t.clips.map((c) => ({
      id: c.id, mediaId: c.mediaId, timelineIn: c.timelineIn, timelineOut: c.timelineOut,
      sourceIn: c.sourceIn, sourceOut: c.sourceOut,
      startSec: +(c.timelineIn / fps).toFixed(2), endSec: +(c.timelineOut / fps).toFixed(2),
    })),
  }));
  const end = Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.timelineOut)));
  return {
    path, name: d.name, fps, resolution: d.settings?.resolution, durationFrames: end,
    durationSec: +(end / fps).toFixed(2),
    assets: d.assets.map((a) => ({ id: a.id, type: a.type, file: assetPath(path, a) })),
    tracks,
  };
}

function videoFileFor(args) {
  if (args.video_path) return resolve(args.video_path);
  if (!args.project_path) throw new Error('Give project_path or video_path');
  const path = resolve(args.project_path);
  const d = loadProject(path);
  const a = d.assets.find((x) => x.type === 'recording') ?? d.assets[0];
  if (!a) throw new Error('Project has no media');
  return assetPath(path, a);
}

function extractFrame(file, sec, width) {
  return run('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, sec)), '-i', file, '-frames:v', '1',
    '-vf', `scale=${width}:-2`, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '4', '-'], { binary: true });
}

function silenceMap(file) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.7', '-vn', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = [];
  let start = null;
  for (const line of String(r.stderr).split('\n')) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start !== null) { out.push({ from: +start.toFixed(2), to: +Number(e[1]).toFixed(2) }); start = null; }
  }
  return out;
}

// ---- "seeing": scene digest, OCR, cached on disk --------------------------

const CACHE_DIR = process.env.ROUGH_CUT_MCP_CACHE ?? join(homedir(), '.cache', 'rough-cut-mcp');
let ocrLangs;
function ocrLang() {
  if (ocrLangs === undefined) {
    const r = spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8' });
    if (r.error) ocrLangs = '';
    else {
      const have = String(r.stdout).split('\n').map((s) => s.trim());
      ocrLangs = ['eng', 'heb'].filter((l) => have.includes(l)).join('+') || 'eng';
    }
  }
  return ocrLangs;
}

function ocrImage(file) {
  const lang = ocrLang();
  if (!lang) return '';
  const r = spawnSync('tesseract', [file, 'stdout', '-l', lang, '--psm', '11'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return '';
  return String(r.stdout).split('\n').map((l) => l.trim()).filter((l) => l.length > 2).join(' | ').slice(0, 600);
}

function digestKey(file) {
  const st = statSync(file);
  return Buffer.from(`${file}:${st.size}:${Math.floor(st.mtimeMs)}`).toString('base64url').slice(-60);
}

function sceneCuts(file, threshold) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-vf', `select='gt(scene,${threshold})',showinfo`, '-an', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  return [...String(r.stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

function buildDigest(file, { threshold = 0.2, force = false } = {}) {
  const dir = join(CACHE_DIR, digestKey(file));
  const jsonPath = join(dir, 'digest.json');
  if (!force && existsSync(jsonPath)) return { ...JSON.parse(readFileSync(jsonPath, 'utf8')), cached: true };
  mkdirSync(dir, { recursive: true });
  const info = ffprobe(file);
  const maxSeg = Math.max(5, info.duration / 24);
  let bounds = [0, ...sceneCuts(file, threshold), info.duration].sort((a, b) => a - b);
  bounds = bounds.filter((t, i) => i === 0 || t - bounds[i - 1] > 0.5);
  // Long quiet stretches get extra samples so nothing is skipped.
  const segs = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const a = bounds[i], b = bounds[i + 1];
    const parts = Math.max(1, Math.ceil((b - a) / maxSeg));
    for (let p = 0; p < parts; p += 1) segs.push([a + ((b - a) * p) / parts, a + ((b - a) * (p + 1)) / parts]);
  }
  const scenes = segs.slice(0, 60).map(([from, to], i) => {
    const mid = (from + to) / 2;
    const img = join(dir, `s${String(i).padStart(2, '0')}.jpg`);
    writeFileSync(img, extractFrame(file, mid, 1280));
    return { index: i, from: +from.toFixed(2), to: +to.toFixed(2), frameAt: +mid.toFixed(2), image: img, onScreenText: ocrImage(img) };
  });
  const digest = {
    file, ...info, silentStretches: info.hasAudio ? silenceMap(file) : [],
    sceneCount: scenes.length, scenes, builtAt: new Date().toISOString(),
  };
  writeFileSync(jsonPath, JSON.stringify(digest));
  return { ...digest, cached: false };
}

function montage(images, cols = 3, tileWidth = 480) {
  if (!images.length) return null;
  const tileH = Math.round(tileWidth * 0.5625);
  const args = ['-v', 'error', '-y'];
  for (const im of images) args.push('-i', im);
  const scaled = images.map((_, i) => `[${i}:v]scale=${tileWidth}:${tileH}:force_original_aspect_ratio=decrease,pad=${tileWidth}:${tileH}:(ow-iw)/2:(oh-ih)/2[v${i}]`).join(';');
  const stack = images.map((_, i) => `[v${i}]`).join('');
  const layout = images.map((_, i) => `${(i % cols) * tileWidth}_${Math.floor(i / cols) * tileH}`).join('|');
  const graph = images.length === 1 ? `${scaled.replace('[v0]', '[o]')}` : `${scaled};${stack}xstack=inputs=${images.length}:layout=${layout}[o]`;
  args.push('-filter_complex', graph, '-map', '[o]', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', '-');
  return run('ffmpeg', args, { binary: true });
}

function cachedTranscript(args, file) {
  if (args.project_path) {
    const d = loadProject(resolve(args.project_path));
    const fps = d.settings?.frameRate ?? 30;
    const words = d.transcript?.words;
    if (words?.length) return { source: 'project', words: words.map((w) => ({ t: +(w.startFrame / fps).toFixed(2), w: w.text ?? w.word })) };
  }
  const cache = join(CACHE_DIR, digestKey(file), 'transcript.json');
  if (existsSync(cache)) return { source: 'cache', ...JSON.parse(readFileSync(cache, 'utf8')) };
  return null;
}

function editCopyPath(projectPath) {
  return projectPath.endsWith('.claude-edit.roughcut')
    ? projectPath
    : projectPath.replace(/\.roughcut$/, '.claude-edit.roughcut');
}

// ---- tools ---------------------------------------------------------------

const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });

const TOOLS = {
  list_projects: {
    description: 'List Rough Cut project files (.roughcut) with modified time, newest first.',
    inputSchema: { type: 'object', properties: { dir: { type: 'string', description: 'Folder to search (default: the Rough Cut projects folder)' } } },
    async handler({ dir }) {
      const dirs = dir ? [resolve(dir)] : DEFAULT_DIRS;
      const files = dirs.flatMap((d) => findProjects(d)).map((p) => ({ path: p, modified: statSync(p).mtime.toISOString() }));
      files.sort((a, b) => b.modified.localeCompare(a.modified));
      return text(files.slice(0, 50));
    },
  },
  open_project: {
    description: 'Summarise a project: frame rate, length, media files and every clip on every track (ids and frame/second ranges).',
    inputSchema: { type: 'object', properties: { project_path: { type: 'string' } }, required: ['project_path'] },
    async handler({ project_path }) { return text(summarise(resolve(project_path))); },
  },
  view_video: {
    description: 'Look at a video: returns evenly spaced frames (or frames at given seconds) as images, plus basic facts and silent stretches. Give project_path OR video_path.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' }, video_path: { type: 'string' },
        times: { type: 'array', items: { type: 'number' }, description: 'Seconds to grab. If omitted, `count` evenly spaced frames.' },
        count: { type: 'number', description: `Number of frames (default 8, max ${MAX_FRAMES})` },
        start: { type: 'number' }, end: { type: 'number' },
        width: { type: 'number', description: 'Frame width in px (default 640)' },
        include_silence: { type: 'boolean', description: 'Also report silent stretches (default true)' },
      },
    },
    async handler(args) {
      const file = videoFileFor(args);
      const info = ffprobe(file);
      const width = Math.min(1280, Math.max(160, args.width ?? 640));
      const start = Math.max(0, args.start ?? 0);
      const end = Math.min(info.duration, args.end ?? info.duration);
      let times = args.times;
      if (!times?.length) {
        const n = Math.min(MAX_FRAMES, Math.max(1, Math.round(args.count ?? 8)));
        times = Array.from({ length: n }, (_, i) => start + ((end - start) * (i + 0.5)) / n);
      }
      times = times.slice(0, MAX_FRAMES);
      const content = [];
      const silence = info.hasAudio && args.include_silence !== false ? silenceMap(file) : [];
      content.push({ type: 'text', text: JSON.stringify({ file, ...info, silentStretches: silence, frameTimes: times.map((t) => +t.toFixed(2)) }) });
      for (const t of times) {
        content.push({ type: 'text', text: `t=${t.toFixed(2)}s` });
        content.push({ type: 'image', data: extractFrame(file, t, width).toString('base64'), mimeType: 'image/jpeg' });
      }
      return { content };
    },
  },
  video_digest: {
    description: 'START HERE to understand a video. Builds (and caches) a scene-by-scene digest: scene boundaries, the text visible on screen in each scene (OCR), silent stretches, and a contact-sheet image of all scenes. Lets an agent follow the whole video and answer questions about it. Give project_path OR video_path.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' }, video_path: { type: 'string' },
        sensitivity: { type: 'number', description: 'Scene-change threshold 0.05-0.6 (default 0.2; lower finds more scenes)' },
        rebuild: { type: 'boolean' }, sheet: { type: 'boolean', description: 'Include the contact sheet image (default true)' },
      },
    },
    async handler(args) {
      const file = videoFileFor(args);
      const d = buildDigest(file, { threshold: args.sensitivity ?? 0.2, force: !!args.rebuild });
      const tr = cachedTranscript(args, file);
      const lines = d.scenes.map((s) => `#${s.index} ${s.from}s–${s.to}s${s.onScreenText ? `  screen: ${s.onScreenText}` : ''}`);
      const content = [{ type: 'text', text: JSON.stringify({
        file: d.file, duration: d.duration, width: d.width, height: d.height, hasAudio: d.hasAudio,
        cached: d.cached, sceneCount: d.sceneCount, silentStretches: d.silentStretches,
        transcript: tr ? `${tr.source} (${tr.words?.length ?? 0} words, use get_transcript)` : 'none yet (see transcribe)',
      }) + `\n\nScenes:\n${lines.join('\n')}` }];
      if (args.sheet !== false) {
        const imgs = d.scenes.map((s) => s.image);
        for (let i = 0; i < imgs.length; i += 12) {
          const jpg = montage(imgs.slice(i, i + 12));
          if (jpg) {
            content.push({ type: 'text', text: `Contact sheet, scenes #${i}–#${Math.min(i + 11, imgs.length - 1)} (left to right, top to bottom)` });
            content.push({ type: 'image', data: jpg.toString('base64'), mimeType: 'image/jpeg' });
          }
        }
      }
      return { content };
    },
  },
  look_at: {
    description: 'Look closely at one moment: full-size frames around a time, optionally cropped to a region (fractions 0-1 of the picture), with the text read from that frame. Use it to answer detail questions ("what does the button say at 12s?").',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' }, video_path: { type: 'string' },
        time: { type: 'number', description: 'Seconds' },
        around: { type: 'number', description: 'Also grab frames this many seconds before and after (default 0)' },
        crop: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, description: 'Region as fractions of the frame' },
        width: { type: 'number', description: 'Output width px (default 1280)' },
      },
      required: ['time'],
    },
    async handler(args) {
      const file = videoFileFor(args);
      const info = ffprobe(file);
      const width = Math.min(1920, Math.max(320, args.width ?? 1280));
      const times = args.around ? [args.time - args.around, args.time, args.time + args.around] : [args.time];
      const tmp = mkdtempSync(join(tmpdir(), 'rc-look-'));
      const content = [];
      try {
        for (const t0 of times) {
          const t = Math.min(Math.max(0, t0), Math.max(0, info.duration - 0.05));
          const vf = [];
          if (args.crop) {
            const c = args.crop;
            vf.push(`crop=iw*${c.w}:ih*${c.h}:iw*${c.x}:ih*${c.y}`);
          }
          vf.push(`scale=${width}:-2`);
          const img = run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', vf.join(','),
            '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '3', '-'], { binary: true });
          const p = join(tmp, `f${t}.jpg`);
          writeFileSync(p, img);
          content.push({ type: 'text', text: `t=${t.toFixed(2)}s  text on screen: ${ocrImage(p) || '(none read)'}` });
          content.push({ type: 'image', data: img.toString('base64'), mimeType: 'image/jpeg' });
        }
      } finally { rmSync(tmp, { recursive: true, force: true }); }
      return { content };
    },
  },
  find_moment: {
    description: 'Find when something happens: searches the on-screen text of every scene (from video_digest) and the transcript (if any) for a word or phrase and returns the times plus frames.',
    inputSchema: {
      type: 'object',
      properties: { project_path: { type: 'string' }, video_path: { type: 'string' }, query: { type: 'string' }, max_results: { type: 'number' } },
      required: ['query'],
    },
    async handler(args) {
      const file = videoFileFor(args);
      const d = buildDigest(file);
      const q = args.query.toLowerCase();
      const hits = d.scenes.filter((s) => s.onScreenText.toLowerCase().includes(q))
        .map((s) => ({ kind: 'screen-text', from: s.from, to: s.to, text: s.onScreenText, image: s.image }));
      const tr = cachedTranscript(args, file);
      if (tr?.words) {
        const words = tr.words;
        const parts = q.split(/\s+/);
        for (let i = 0; i + parts.length <= words.length; i += 1) {
          if (parts.every((p, k) => String(words[i + k].w).toLowerCase().includes(p))) {
            hits.push({ kind: 'spoken', from: words[i].t, to: words[i + parts.length - 1].t, text: words.slice(Math.max(0, i - 6), i + parts.length + 6).map((w) => w.w).join(' ') });
          }
        }
      }
      const top = hits.slice(0, args.max_results ?? 6);
      const content = [{ type: 'text', text: top.length ? JSON.stringify(top.map(({ image, ...h }) => h), null, 2) : `Nothing found for "${args.query}". Try look_at around a likely time.` }];
      for (const h of top) {
        const t = (h.from + h.to) / 2;
        content.push({ type: 'text', text: `${h.kind} at ${t.toFixed(1)}s` });
        content.push({ type: 'image', data: extractFrame(file, t, 640).toString('base64'), mimeType: 'image/jpeg' });
      }
      return { content };
    },
  },
  transcribe: {
    description: 'Get the spoken words with timestamps. Uses the project transcript if the app already made one, a cached one, or runs whisper-cli if installed. Says plainly if no speech-to-text is installed.',
    inputSchema: {
      type: 'object',
      properties: { project_path: { type: 'string' }, video_path: { type: 'string' }, model: { type: 'string', description: 'Path to a whisper.cpp ggml model (or set ROUGH_CUT_WHISPER_MODEL)' } },
    },
    async handler(args) {
      const file = videoFileFor(args);
      const have = cachedTranscript(args, file);
      if (have) return text({ source: have.source, text: have.words.map((w) => w.w).join(' '), words: have.words.length });
      const which = spawnSync('which', ['whisper-cli'], { encoding: 'utf8' });
      const model = args.model ?? process.env.ROUGH_CUT_WHISPER_MODEL;
      if (which.status !== 0 || !model || !existsSync(model)) {
        return text('No speech-to-text is set up on this machine (whisper-cli and a model are missing), so spoken words cannot be read yet. The picture, on-screen text and silence map still work. Run the transcription setup script, or pass a model path.');
      }
      const tmp = mkdtempSync(join(tmpdir(), 'rc-asr-'));
      try {
        const wav = join(tmp, 'a.wav');
        run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', wav]);
        run('whisper-cli', ['-m', model, '-f', wav, '-ojf', '-of', join(tmp, 'out')]);
        const j = JSON.parse(readFileSync(join(tmp, 'out.json'), 'utf8'));
        const words = (j.transcription ?? []).map((s) => ({ t: +(s.offsets.from / 1000).toFixed(2), w: s.text.trim() })).filter((w) => w.w);
        const dir = join(CACHE_DIR, digestKey(file));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'transcript.json'), JSON.stringify({ words }));
        return text({ source: 'whisper-cli', text: words.map((w) => w.w).join(' '), words: words.length });
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    },
  },
  make_edit_copy: {
    description: 'Create (or reset) the editable copy of a project. All edits go to the copy; the original is never changed.',
    inputSchema: { type: 'object', properties: { project_path: { type: 'string' } }, required: ['project_path'] },
    async handler({ project_path }) {
      const src = resolve(project_path);
      const copy = editCopyPath(src);
      if (copy !== src) {
        // The copy is its own project: same edits, its own id.
        const doc = JSON.parse(readFileSync(src, 'utf8'));
        writeFileSync(copy, JSON.stringify({ ...doc, id: randomUUID() }));
      }
      return text({ editCopy: copy, summary: summarise(copy) });
    },
  },
  apply_edit: {
    description: 'Edit the project COPY (made by make_edit_copy). ops: cut_range {startSec,endSec} removes that stretch and closes the gap on all tracks; split {clipId,sec}; delete_clip {clipId, ripple?}. Saves a one-step undo file next to the copy.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'The original or the edit-copy path' },
        op: { type: 'string', enum: ['cut_range', 'split', 'delete_clip'] },
        startSec: { type: 'number' }, endSec: { type: 'number' },
        clipId: { type: 'string' }, sec: { type: 'number' }, ripple: { type: 'boolean' },
      },
      required: ['project_path', 'op'],
    },
    async handler(a) {
      const M = await model();
      const copy = editCopyPath(resolve(a.project_path));
      if (!existsSync(copy)) throw new Error('No edit copy yet. Call make_edit_copy first.');
      let doc = loadProject(copy);
      const fps = doc.settings?.frameRate ?? 30;
      const before = readFileSync(copy, 'utf8');
      const frame = (s) => Math.round(s * fps);
      const splitAt = (f) => {
        for (const track of doc.timeline.tracks) {
          const c = track.clips.find((x) => x.timelineIn < f && f < x.timelineOut);
          if (c) { doc = M.splitClip(doc, { clipId: c.id, frame: f }).document; return; }
        }
      };
      if (a.op === 'cut_range') {
        const s = frame(a.startSec), e = frame(a.endSec);
        if (!(e > s)) throw new Error('endSec must be after startSec');
        // Splitting one clip also splits its linked partners; repeat until nothing spans a boundary.
        for (const f of [s, e]) for (let i = 0; i < 20; i += 1) {
          const spans = doc.timeline.tracks.some((t) => t.clips.some((x) => x.timelineIn < f && f < x.timelineOut));
          if (!spans) break;
          splitAt(f);
        }
        doc = M.rippleDeleteRange(doc, { startFrame: s, endFrame: e }).document;
      } else if (a.op === 'split') {
        doc = M.splitClip(doc, { clipId: a.clipId, frame: frame(a.sec) }).document;
      } else if (a.op === 'delete_clip') {
        doc = M.deleteClip(doc, { clipId: a.clipId, mode: a.ripple ? 'ripple' : 'leave-gap' }).document;
      } else throw new Error(`Unknown op ${a.op}`);
      writeFileSync(`${copy}.undo`, before);
      writeFileSync(copy, JSON.stringify(doc));
      return text({ ok: true, summary: summarise(copy) });
    },
  },
  undo_edit: {
    description: 'Undo the last apply_edit on the project copy (one step).',
    inputSchema: { type: 'object', properties: { project_path: { type: 'string' } }, required: ['project_path'] },
    async handler({ project_path }) {
      const copy = editCopyPath(resolve(project_path));
      if (!existsSync(`${copy}.undo`)) throw new Error('Nothing to undo');
      copyFileSync(`${copy}.undo`, copy);
      rmSync(`${copy}.undo`);
      return text({ ok: true, summary: summarise(copy) });
    },
  },
  export_draft: {
    description: 'Render a quick draft MP4 of the edit copy (the primary video track, with its audio) so you can view_video the result. Not the styled final export.',
    inputSchema: { type: 'object', properties: { project_path: { type: 'string' }, out_path: { type: 'string' } }, required: ['project_path'] },
    async handler({ project_path, out_path }) {
      const copy = editCopyPath(resolve(project_path));
      const src = existsSync(copy) ? copy : resolve(project_path);
      const doc = loadProject(src);
      const fps = doc.settings?.frameRate ?? 30;
      const track = doc.timeline.tracks.find((t) => t.clips.length && doc.assets.some((x) => x.id === t.clips[0].source?.id));
      if (!track) throw new Error('No video track with media');
      const clips = [...track.clips].sort((x, y) => x.timelineIn - y.timelineIn);
      const out = resolve(out_path ?? src.replace(/\.roughcut$/, '.claude-draft.mp4'));
      const tmp = mkdtempSync(join(tmpdir(), 'rc-mcp-'));
      try {
        const parts = clips.map((c, i) => {
          const asset = doc.assets.find((x) => x.id === c.source.id);
          const part = join(tmp, `p${i}.mp4`);
          run('ffmpeg', ['-v', 'error', '-y', '-ss', String(c.sourceIn / fps), '-t', String((c.sourceOut - c.sourceIn) / fps),
            '-i', assetPath(src, asset), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-ar', '48000', '-ac', '2', part]);
          return part;
        });
        const list = join(tmp, 'list.txt');
        writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
        mkdirSync(dirname(out), { recursive: true });
        run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
      } finally { rmSync(tmp, { recursive: true, force: true }); }
      return text({ draft: out, ...ffprobe(out) });
    },
  },
};

// ---- JSON-RPC over stdio ---------------------------------------------------

function send(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`); }

async function handle(req) {
  const { id, method, params } = req;
  try {
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: {
        protocolVersion: params?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: 'rough-cut', version: '0.1.0' },
      } });
    }
    if (method === 'tools/list') {
      return send({ jsonrpc: '2.0', id, result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) } });
    }
    if (method === 'tools/call') {
      const tool = TOOLS[params?.name];
      if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool ${params?.name}` } });
      try {
        return send({ jsonrpc: '2.0', id, result: await tool.handler(params.arguments ?? {}) });
      } catch (err) {
        return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: String(err.message ?? err) }] } });
      }
    }
    if (method === 'prompts/list') {
      return send({ jsonrpc: '2.0', id, result: { prompts: [{ name: 'watch_and_discuss', description: 'Watch a video, then talk it through with the user and suggest or make edits.', arguments: [{ name: 'path', description: 'Project (.roughcut) or video file', required: true }] }] } });
    }
    if (method === 'prompts/get') {
      const p = params?.arguments?.path ?? '';
      const arg = p.endsWith('.roughcut') ? 'project_path' : 'video_path';
      const steps = [
        `Watch this video and be ready to discuss it: ${p}`,
        `1. Call video_digest (${arg}) and read the contact sheet and on-screen text.`,
        '2. Call transcribe for the spoken words.',
        '3. Tell me in plain words what the video is, what works, what drags, and what you would cut or change, with timestamps.',
        '4. Use look_at for any detail you are unsure about instead of guessing. Say clearly when you cannot tell.',
        '5. Only edit when I agree: make_edit_copy, then apply_edit, then export_draft and check the result with view_video.',
      ];
      return send({ jsonrpc: '2.0', id, result: { messages: [{ role: 'user', content: { type: 'text', text: steps.join('\n') } }] } });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (err) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(err.message ?? err) } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) { try { handle(JSON.parse(line)); } catch { /* ignore malformed line */ } }
  }
});
process.stdin.on('end', () => process.exit(0));
