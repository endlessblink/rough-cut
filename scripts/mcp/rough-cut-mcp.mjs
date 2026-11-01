#!/usr/bin/env node
// Rough Cut MCP server (phase 1: watch and cut). Dependency-free stdio JSON-RPC.
// Edits only ever touch a COPY of a project (`<name>.claude-edit.roughcut`).
import { spawn, spawnSync } from 'node:child_process';
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
// Every ffmpeg call goes through the memory-capped wrapper (house rule), falling back to
// a capped systemd scope when the wrapper is missing.
const FFMPEG = process.env.ROUGH_CUT_MCP_FFMPEG ?? (existsSync(join(homedir(), '.local/bin/ffmpeg-safe')) ? join(homedir(), '.local/bin/ffmpeg-safe') : 'ffmpeg');
const APP_DIR = resolve(HERE, '../../apps/desktop');

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
  return run(FFMPEG, ['-v', 'error', '-ss', String(Math.max(0, sec)), '-i', file, '-frames:v', '1',
    '-vf', `scale=${width}:-2`, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '4', '-'], { binary: true });
}

const silenceCache = new Map();
function silenceMap(file) {
  const key = `${file}:${statSync(file).mtimeMs}`;
  if (!silenceCache.has(key)) silenceCache.set(key, silenceMapUncached(file));
  return silenceCache.get(key);
}
function silenceMapUncached(file) {
  const r = spawnSync(FFMPEG, ['-v', 'info', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.7', '-vn', '-f', 'null', '-'],
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
  const r = spawnSync(FFMPEG, ['-v', 'info', '-i', file, '-vf', `select='gt(scene,${threshold})',showinfo`, '-an', '-f', 'null', '-'],
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
  return run(FFMPEG, args, { binary: true });
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

/**
 * The list of edits made on a copy, which Rough Cut offers Noam to take into his own
 * project one by one (Dev menu, Agent edits). Beside the copy: <copy>.edits.json.
 */
function journalPath(copy) { return `${copy}.edits.json`; }
function readJournal(copy) {
  try {
    const journal = JSON.parse(readFileSync(journalPath(copy), 'utf8'));
    if (Array.isArray(journal.entries)) return journal;
  } catch { /* no list yet */ }
  return { version: 1, projectPath: copy.replace(/\.claude-edit\.roughcut$/, '.roughcut'), entries: [] };
}
function writeJournal(copy, journal) { writeFileSync(journalPath(copy), `${JSON.stringify(journal, null, 2)}\n`); }

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
        scene_from: { type: 'number', description: 'First scene to show (default 0). The reply shows 20 scenes at a time; use scene_from/scene_to to page.' },
        scene_to: { type: 'number', description: 'Scene index to stop before (default scene_from + 20)' },
        ocr_chars: { type: 'number', description: 'Max on-screen text characters per scene (default 160)' },
        min_silence: { type: 'number', description: 'Only list silences of at least this many seconds (default 1.0); nearby ones are merged' },
      },
    },
    async handler(args) {
      const file = videoFileFor(args);
      const d = buildDigest(file, { threshold: args.sensitivity ?? 0.2, force: !!args.rebuild });
      const tr = cachedTranscript(args, file);
      // Keep the reply small: a page of scenes, short on-screen text, and silences merged and over a minimum length.
      const from = Math.max(0, args.scene_from ?? 0);
      const to = Math.min(d.scenes.length, args.scene_to ?? from + 20);
      const page = d.scenes.slice(from, to);
      const ocrChars = args.ocr_chars ?? 160;
      const lines = page.map((s) => `#${s.index} ${s.from}s–${s.to}s${s.onScreenText ? `  screen: ${s.onScreenText.slice(0, ocrChars)}` : ''}`);
      const minSilence = args.min_silence ?? 1.0;
      const silences = [];
      for (const st of d.silentStretches) {
        const last = silences.at(-1);
        if (last && st.from - last.to <= 0.3) last.to = st.to; else silences.push({ from: st.from, to: st.to });
      }
      const longSilences = silences.filter((st) => st.to - st.from >= minSilence);
      const content = [{ type: 'text', text: JSON.stringify({
        file: d.file, duration: d.duration, width: d.width, height: d.height, hasAudio: d.hasAudio,
        cached: d.cached, sceneCount: d.sceneCount, scenesShown: `${from}-${to - 1}`,
        silentStretches: longSilences, silenceNote: `merged, only stretches of ${minSilence}s or more (${longSilences.length} of ${silences.length}); set min_silence to change`,
        transcript: tr ? `${tr.source} (${tr.words?.length ?? 0} words, use get_transcript)` : 'none yet (see transcribe)',
      }) + `\n\nScenes${to < d.scenes.length ? ` (more: call again with scene_from=${to})` : ''}:\n${lines.join('\n')}` }];
      if (args.sheet !== false) {
        const imgs = page.map((s) => s.image);
        for (let i = 0; i < imgs.length; i += 12) {
          const jpg = montage(imgs.slice(i, i + 12));
          if (jpg) {
            content.push({ type: 'text', text: `Contact sheet, scenes #${from + i}–#${from + Math.min(i + 11, imgs.length - 1)} (left to right, top to bottom)` });
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
          const img = run(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', vf.join(','),
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
        run(FFMPEG, ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', wav]);
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
        // A fresh copy starts a fresh list of edits for Noam to take in.
        writeJournal(copy, { version: 1, projectPath: src, entries: [] });
      }
      return text({ editCopy: copy, summary: summarise(copy) });
    },
  },
  apply_edit: {
    description: 'Edit the project COPY (made by make_edit_copy), the same edits Noam makes in the app. ops: '
      + 'cut_range {startSec,endSec} removes that stretch and closes the gap on all tracks; split {clipId,sec}; delete_clip {clipId, ripple?}; '
      + 'insert_clip {file, atSec, mode: insert|overwrite, inSec?, outSec?} puts a video file on the timeline at atSec (insert pushes everything after it later; overwrite replaces what is under it), full picture, its sound replaces the recording\'s there; '
      + 'add_voice_over {file, atSec, mode: replace|over, inSec?, outSec?} puts a sound file on the Voice lane (replace mutes the recording\'s voice under it, over plays both); '
      + 'set_voice_over_mode {clipId, mode}; move_clip {clipId, atSec} and trim_clip {clipId, edge: head|tail, sec} for added clips and voice-overs; '
      + 'set_layout {captions?: boolean, camera?: boolean} turns burned-in captions and the camera bubble on or off. '
      + 'Saves a one-step undo file next to the copy and adds the edit to the list Noam sees in Rough Cut (Dev menu, Agent edits), where he takes each one into his own project or skips it. The original project is never changed.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'The original or the edit-copy path' },
        op: { type: 'string', enum: ['cut_range', 'split', 'delete_clip', 'insert_clip', 'add_voice_over', 'set_voice_over_mode', 'move_clip', 'trim_clip', 'set_layout'] },
        startSec: { type: 'number' }, endSec: { type: 'number' },
        clipId: { type: 'string' }, sec: { type: 'number' }, ripple: { type: 'boolean' },
        file: { type: 'string', description: 'insert_clip / add_voice_over: the media file (referenced in place, never copied or changed)' },
        atSec: { type: 'number', description: 'Timeline second it starts at' },
        inSec: { type: 'number', description: 'Part of the file to use: start (default 0)' },
        outSec: { type: 'number', description: 'Part of the file to use: end (default its end)' },
        mode: { type: 'string', description: 'insert_clip: insert|overwrite. add_voice_over / set_voice_over_mode: replace|over' },
        edge: { type: 'string', enum: ['head', 'tail'] },
        captions: { type: 'boolean' }, camera: { type: 'boolean' },
        verbose: { type: 'boolean', description: 'Return the whole timeline instead of a one-line receipt (large).' },
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
      // Build one edit that names things the same way in the copy and in Noam's project,
      // apply it with the same code the app uses, and log it so the app can offer it to him.
      const addedAsset = (clipId) => {
        const clip = M.listInsertedClips(doc).find((item) => item.clipId === clipId);
        if (!clip) throw new Error(`${clipId} is not an added clip or voice-over`);
        return clip.assetId;
      };
      let edit;
      if (a.op === 'cut_range') {
        let s = frame(a.startSec), e = frame(a.endSec);
        if (!(e > s)) throw new Error('endSec must be after startSec');
        // A cut that stops a hair short of the start or end would leave a stray 1-3 frame clip: widen it to the edge.
        const endFrame = Math.max(0, ...doc.timeline.tracks.flatMap((t) => t.clips.map((c) => c.timelineOut)));
        if (s <= 3) s = 0;
        if (e >= endFrame - 3) e = endFrame;
        edit = { op: 'cut_range', startFrame: s, endFrame: e };
      } else if (a.op === 'split') {
        const track = doc.timeline.tracks.find((item) => item.clips.some((clip) => clip.id === a.clipId));
        if (!track) throw new Error(`No clip ${a.clipId}`);
        edit = { op: 'split', frame: frame(a.sec), trackId: track.id };
      } else if (a.op === 'delete_clip') {
        const added = M.listInsertedClips(doc).find((clip) => clip.clipId === a.clipId);
        edit = added
          ? { op: 'delete_added', assetId: added.assetId, ripple: a.ripple !== false }
          : { op: 'delete_clip', clipId: a.clipId, ripple: Boolean(a.ripple) };
      } else if (a.op === 'insert_clip' || a.op === 'add_voice_over') {
        const file = resolve(String(a.file ?? ''));
        if (!existsSync(file)) throw new Error(`No file at ${file}`);
        const info = ffprobe(file);
        if (!(info.duration > 0)) throw new Error('Could not read how long that file is');
        const durationFrames = Math.max(1, Math.round(info.duration * fps));
        const sourceIn = a.inSec === undefined ? 0 : frame(a.inSec);
        const sourceOut = a.outSec === undefined ? durationFrames : frame(a.outSec);
        const name = file.split('/').pop();
        if (a.op === 'insert_clip') {
          if (!info.width) throw new Error('insert_clip needs a video file; use add_voice_over for sound');
          const asset = M.createInsertedMediaAsset({ id: `clip-${randomUUID()}`, filePath: file, durationFrames, kind: 'clip', name, hasAudio: info.hasAudio, width: info.width, height: info.height, fps });
          edit = { op: 'insert_clip', asset, frame: frame(a.atSec ?? 0), mode: a.mode === 'overwrite' ? 'overwrite' : 'insert', sourceIn, sourceOut };
        } else {
          if (!info.hasAudio) throw new Error('add_voice_over needs a file with sound');
          const asset = M.createInsertedMediaAsset({ id: `voice-${randomUUID()}`, filePath: file, durationFrames, kind: 'voice', name, voiceMode: a.mode === 'over' ? 'over' : 'replace' });
          edit = { op: 'add_voice_over', asset, frame: frame(a.atSec ?? 0), sourceIn, sourceOut };
        }
      } else if (a.op === 'set_voice_over_mode') {
        edit = { op: 'set_voice_over_mode', assetId: addedAsset(a.clipId), mode: a.mode === 'over' ? 'over' : 'replace' };
      } else if (a.op === 'move_clip') {
        edit = { op: 'move_added', assetId: addedAsset(a.clipId), frame: frame(a.atSec ?? 0) };
      } else if (a.op === 'trim_clip') {
        edit = { op: 'trim_added', assetId: addedAsset(a.clipId), edge: a.edge === 'head' ? 'head' : 'tail', frame: frame(a.sec ?? 0) };
      } else if (a.op === 'set_layout') {
        edit = { op: 'set_layout', ...(typeof a.captions === 'boolean' ? { captions: a.captions } : {}), ...(typeof a.camera === 'boolean' ? { camera: a.camera } : {}) };
      } else throw new Error(`Unknown op ${a.op}`);
      doc = M.applyAgentEdit(doc, edit);
      writeFileSync(`${copy}.undo`, before);
      writeFileSync(copy, JSON.stringify(doc));
      const journal = readJournal(copy);
      journal.entries.push({ id: randomUUID(), at: new Date().toISOString(), edit, label: M.describeAgentEdit(edit, fps) });
      writeJournal(copy, journal);
      // A short receipt by default: the full timeline is thousands of tokens and grows with every edit.
      if (a.verbose) return text({ ok: true, summary: summarise(copy) });
      const s = summarise(copy);
      return text({ ok: true, op: a.op, edit: journal.entries.at(-1).label, durationSec: s.durationSec, clips: s.tracks.reduce((n, t) => n + t.clips.length, 0) });
    },
  },
  apply_edits: {
    description: 'Apply many edits to the project COPY in one call. Give ops (same fields as apply_edit). All cut_range ops use seconds of the copy as it is NOW (before this call); the server merges overlapping or touching cuts and applies them from the end backwards so nothing shifts, then applies any other ops in the order given. Returns one short receipt. Cuts that would leave under 0.1s at the very start or end are widened to the edge.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' },
        ops: { type: 'array', items: { type: 'object', description: 'An apply_edit op: {op, startSec, endSec, ...}' } },
      },
      required: ['project_path', 'ops'],
    },
    async handler({ project_path, ops }) {
      if (!Array.isArray(ops) || !ops.length) throw new Error('ops must be a non-empty list');
      const cuts = ops.filter((o) => o.op === 'cut_range').map((o) => ({ s: o.startSec, e: o.endSec }))
        .sort((x, y) => x.s - y.s);
      const merged = [];
      for (const c of cuts) {
        if (!(c.e > c.s)) throw new Error(`Bad cut ${c.s}-${c.e}: endSec must be after startSec`);
        const last = merged.at(-1);
        if (last && c.s <= last.e) last.e = Math.max(last.e, c.e); else merged.push({ ...c });
      }
      const before = summarise(editCopyPath(resolve(project_path))).durationSec;
      let removed = 0;
      for (const c of merged.reverse()) {
        await TOOLS.apply_edit.handler({ project_path, op: 'cut_range', startSec: c.s, endSec: c.e });
        removed += c.e - c.s;
      }
      let others = 0;
      for (const o of ops.filter((x) => x.op !== 'cut_range')) {
        await TOOLS.apply_edit.handler({ ...o, project_path });
        others += 1;
      }
      const after = summarise(editCopyPath(resolve(project_path))).durationSec;
      return text({ ok: true, cuts: merged.length, otherOps: others, removedSec: +removed.toFixed(2), durationBeforeSec: before, durationAfterSec: after });
    },
  },
  suggest_cuts: {
    description: 'PROPOSE cuts (nothing is changed): repeated takes, long silences and screens that show private things. Returns a short list [{startSec,endSec,kind,reason}] in seconds of the ORIGINAL recording, sorted, ready to pass as cut_range ops to apply_edits after you check them. kinds: retake (an earlier version of a sentence that is said again later; the LAST take is kept), silence (a quiet stretch over min_silence, trimmed to keep a short breath each side), privacy (a scene whose on-screen text looks like an email address, inbox, account chooser or password field; cut or blur it). Silences are only proposed where the picture is also still (no scene change inside), so a silent demo is kept. Needs a project transcript for retakes (see get_transcript).',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string' }, video_path: { type: 'string' },
        kinds: { type: 'array', items: { type: 'string', enum: ['retake', 'silence', 'privacy', 'filler'] }, description: 'Default: retake, silence, privacy. Add filler to also cut um/uh/אה/אמ words' },
        min_silence: { type: 'number', description: 'Shortest silence to propose, seconds (default 3)' },
        breath: { type: 'number', description: 'Seconds of quiet kept each side of a silence cut (default 0.4)' },
        similarity: { type: 'number', description: 'Retake match 0-1, word overlap (default 0.6)' },
      },
    },
    async handler(args) {
      const kinds = new Set(args.kinds ?? ['retake', 'silence', 'privacy']);
      const file = videoFileFor(args);
      const d = buildDigest(file, {});
      const out = [];
      if (kinds.has('privacy')) {
        const rx = [/[\w.+-]+@[\w-]+\.[\w.]+/i, /choose an account/i, /\binbox\b/i, /gmail/i, /\bpassword\b/i, /confirmation (link|instructions)/i];
        for (const s of d.scenes) {
          const hit = rx.find((r) => r.test(s.onScreenText ?? ''));
          if (hit) out.push({ startSec: s.from, endSec: s.to, kind: 'privacy', reason: `on-screen text matches ${hit}` });
        }
      }
      if (kinds.has('silence')) {
        const minSil = args.min_silence ?? 3, breath = args.breath ?? 0.4;
        const sil = [];
        for (const st of d.silentStretches) {
          const last = sil.at(-1);
          if (last && st.from - last.to <= 0.3) last.to = st.to; else sil.push({ from: st.from, to: st.to });
        }
        // Is the picture frozen for (nearly) the whole stretch? If anything moves (an animation playing, a video), keep it.
        const pictureStill = (a, b) => {
          const r = spawnSync(FFMPEG, ['-v', 'info', '-ss', String(a), '-t', String(b - a), '-i', file, '-an', '-vf', `scale=320:-2,freezedetect=n=0.02:d=${((b - a) * 0.8).toFixed(2)}`, '-f', 'null', '-'], { encoding: 'utf8' });
          const m = /freeze_duration: ([\d.]+)/.exec(r.stderr ?? '');
          return Boolean(m) && Number(m[1]) >= (b - a) * 0.8;
        };
        for (const st of sil) {
          if (st.to - st.from < minSil) continue;
          if (!pictureStill(st.from, st.to)) continue;
          out.push({ startSec: +(st.from + breath).toFixed(2), endSec: +(st.to - breath).toFixed(2), kind: 'silence', reason: `${(st.to - st.from).toFixed(1)}s of silence, picture still` });
        }
      }
      if (kinds.has('retake') && args.project_path) {
        const dd = loadProject(resolve(args.project_path));
        const fps = dd.settings?.frameRate ?? 30;
        const words = (dd.transcript?.words ?? []).map((w) => ({ s: w.startFrame / fps, e: w.endFrame / fps, w: String(w.text ?? w.word) }));
        const chunks = [];
        let cur = null;
        for (const w of words) {
          if (cur && w.s - cur.e > 0.6) { chunks.push(cur); cur = null; }
          if (!cur) cur = { s: w.s, e: w.e, t: [] };
          cur.e = w.e; cur.t.push(w.w);
        }
        if (cur) chunks.push(cur);
        const norm = (c) => new Set(c.t.join(' ').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter((x) => x.length > 1));
        const sets = chunks.map(norm);
        const thr = args.similarity ?? 0.6;
        const silent = (a, b) => d.silentStretches.some((st) => st.from <= a + 0.2 && st.to >= b - 0.2);
        for (let i = 0; i < chunks.length; i += 1) {
          if (sets[i].size < 4 || silent(chunks[i].s, chunks[i].e)) continue;
          // Is a nearby later chunk (within 90 s) a repeat of this one? Then this is the earlier take: propose cutting just this take.
          for (let j = i + 1; j < chunks.length && chunks[j].s - chunks[i].e < 90; j += 1) {
            const inter = [...sets[i]].filter((x) => sets[j].has(x)).length;
            const score = inter / Math.min(sets[i].size, sets[j].size);
            if (score >= thr) {
              const end = Math.min(chunks[i + 1].s - 0.05, chunks[i].e + 1.5);
              out.push({ startSec: +chunks[i].s.toFixed(2), endSec: +Math.max(chunks[i].e, end).toFixed(2), kind: 'retake', reason: `said again at ${chunks[j].s.toFixed(1)}s (${Math.round(score * 100)}% same words); last take kept`, keepFrom: +chunks[j].s.toFixed(2) });
              break;
            }
          }
        }
      }
      if (kinds.has('filler') && args.project_path) {
        const dd = loadProject(resolve(args.project_path));
        const fps = dd.settings?.frameRate ?? 30;
        const rxFiller = /^(u+h+m*|u+m+|e+r+m*|h+m+|אה+|אמ+|אההה*|אממ+|הממ+|ארר*)$/i;
        for (const w of dd.transcript?.words ?? []) {
          const word = String(w.text ?? w.word ?? '').replace(/[^\p{L}]/gu, '');
          if (!rxFiller.test(word)) continue;
          out.push({ startSec: +(w.startFrame / fps).toFixed(2), endSec: +(w.endFrame / fps).toFixed(2), kind: 'filler', reason: `filler word "${word}"` });
        }
      }
      out.sort((x, y) => x.startSec - y.startSec);
      const total = out.reduce((n, c) => n + (c.endSec - c.startSec), 0);
      return text({ suggestions: out.length, totalSec: +total.toFixed(1), note: 'Proposals only. Overlaps are fine: apply_edits merges them. Check retakes against get_transcript before applying.', cuts: out });
    },
  },
  review_edit: {
    description: 'Check an edit copy before showing it to the user. Structure: slivers under 4 frames, gaps or overlaps between clips on a track, tracks of different length. With render:true also renders a draft and looks for black frames. Returns pass/fail lines and the join times (seconds in the edit) so you can look_at each join. Short reply.',
    inputSchema: { type: 'object', properties: { project_path: { type: 'string' }, render: { type: 'boolean', description: 'Also render a draft and scan it for black frames (slower)' } }, required: ['project_path'] },
    async handler({ project_path, render }) {
      const copy = editCopyPath(resolve(project_path));
      const src = existsSync(copy) ? copy : resolve(project_path);
      const s = summarise(src);
      const problems = [];
      const joins = new Set();
      for (const t of s.tracks) {
        const clips = [...t.clips].sort((a, b) => a.timelineIn - b.timelineIn);
        clips.forEach((c, i) => {
          if (c.timelineOut - c.timelineIn < 4) problems.push(`${t.name ?? t.id}: sliver of ${c.timelineOut - c.timelineIn} frames at ${c.startSec}s`);
          const next = clips[i + 1];
          if (next) {
            if (next.timelineIn > c.timelineOut) problems.push(`${t.name ?? t.id}: gap ${((next.timelineIn - c.timelineOut) / s.fps).toFixed(2)}s at ${c.endSec}s`);
            if (next.timelineIn < c.timelineOut) problems.push(`${t.name ?? t.id}: overlap at ${next.startSec}s`);
            if (next.sourceIn !== c.sourceOut || next.mediaId !== c.mediaId) joins.add(+c.endSec.toFixed(2));
          }
        });
      }
      const ends = s.tracks.filter((t) => t.clips.length).map((t) => Math.max(...t.clips.map((c) => c.timelineOut)));
      if (ends.length && Math.max(...ends) - Math.min(...ends) > 2) problems.push(`tracks end at different times (${ends.map((e) => (e / s.fps).toFixed(1)).join(', ')}s)`);
      let black = null;
      if (render) {
        const made = JSON.parse((await TOOLS.export_draft.handler({ project_path: src })).content[0].text);
        const r = spawnSync(FFMPEG, ['-v', 'info', '-i', made.draft, '-an', '-vf', 'blackdetect=d=0.1:pix_th=0.05', '-f', 'null', '-'], { encoding: 'utf8' });
        black = [...(r.stderr ?? '').matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => ({ from: +m[1], to: +m[2] }));
        if (black.length) problems.push(`black frames: ${black.map((b) => `${b.from}-${b.to}s`).join(', ')}`);
      }
      return text({ pass: problems.length === 0, durationSec: s.durationSec, joins: [...joins].sort((a, b) => a - b), problems, ...(black ? { draftChecked: true } : {}) });
    },
  },
  get_transcript: {
    description: 'The spoken words as short lines "[start-end] text" in seconds of the ORIGINAL recording, from the project transcript (or the cache). Optional from/to (seconds) to read one stretch. Lines split at pauses over 0.6s. Text over a stretch that is really silent can be wrong (the local speech model sometimes invents words over quiet parts): compare with video_digest silentStretches before trusting a short line.',
    inputSchema: {
      type: 'object',
      properties: { project_path: { type: 'string' }, video_path: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' } },
    },
    async handler(args) {
      let words;
      if (args.project_path) {
        const d = loadProject(resolve(args.project_path));
        const fps = d.settings?.frameRate ?? 30;
        words = (d.transcript?.words ?? []).map((w) => ({ s: w.startFrame / fps, e: w.endFrame / fps, w: w.text ?? w.word }));
      }
      if (!words?.length) {
        const have = cachedTranscript(args, videoFileFor(args));
        if (!have) return text('No transcript yet. Run transcribe first.');
        words = have.words.map((w, i, all) => ({ s: w.t, e: all[i + 1]?.t ?? w.t + 0.4, w: w.w }));
      }
      const from = args.from ?? 0, to = args.to ?? Infinity;
      const lines = [];
      let cur = null;
      for (const w of words) {
        if (w.s < from || w.s >= to) continue;
        if (cur && w.s - cur.e > 0.6) { lines.push(cur); cur = null; }
        if (!cur) cur = { s: w.s, e: w.e, t: [] };
        cur.e = w.e; cur.t.push(w.w);
      }
      if (cur) lines.push(cur);
      let silences = [];
      try { silences = silenceMap(videoFileFor(args)); } catch { /* no audio file: no flags */ }
      // A line that sits (almost) entirely inside measured silence is words the speech model invented.
      const doubtful = (l) => {
        const covered = silences.reduce((n, st) => n + Math.max(0, Math.min(st.to, l.e) - Math.max(st.from, l.s)), 0);
        return l.e > l.s && covered / (l.e - l.s) >= 0.8;
      };
      return text(lines.map((l) => `[${l.s.toFixed(1)}-${l.e.toFixed(1)}]${doubtful(l) ? ' (?silent: probably not real speech)' : ''} ${l.t.join(' ')}`).join('\n') || 'No words in that range.');
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
      const journal = readJournal(copy);
      journal.entries.pop();
      writeJournal(copy, journal);
      return text({ ok: true, summary: summarise(copy) });
    },
  },
  export_styled: {
    description: 'Export a project exactly as the app\'s Export button does (styled: zooms, camera bubble as laid out, Claude graphics, background, cursor), run by the app itself without a window. Options: captions (default true; false leaves burned-in captions out), camera (default true; false leaves the camera bubble out), start_sec/end_sec (keep only that part of the timeline, e.g. one opening animation). Reads the project, never changes it. Takes about as long as an export in the app; check the result with view_video.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'The .roughcut to export (the original or an edit copy).' },
        out_path: { type: 'string', description: 'Where to write the .mp4 (default: next to the project, <name>.claude-export.mp4).' },
        captions: { type: 'boolean', description: 'Burn in captions as set in the project (default true).' },
        camera: { type: 'boolean', description: 'Include the camera bubble as laid out in the project (default true).' },
        start_sec: { type: 'number', description: 'Timeline second to start at (optional).' },
        end_sec: { type: 'number', description: 'Timeline second to end at (optional).' },
      },
      required: ['project_path'],
    },
    async handler({ project_path, out_path, captions, camera, start_sec, end_sec }) {
      const projectPath = resolve(project_path);
      if (!existsSync(projectPath)) throw new Error(`No project at ${projectPath}`);
      const outPath = resolve(out_path ?? projectPath.replace(/\.roughcut$/, '.claude-export.mp4'));
      const result = await runStyledExport({ projectPath, outPath, captions: captions !== false, camera: camera !== false, startSec: start_sec ?? null, endSec: end_sec ?? null });
      return text({ export: result.outPath, captions: result.captions, camera: result.camera, startSec: result.startSec, endSec: result.endSec, tookSeconds: Math.round(result.durationMs / 1000), ...ffprobe(result.outPath) });
    },
  },
  export_draft: {
    description: 'Render a quick draft MP4 of the edit copy (the primary video track, with its audio) so you can view_video the result. Not the styled final export: use export_styled for that.',
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
          run(FFMPEG, ['-v', 'error', '-y', '-ss', String(c.sourceIn / fps), '-t', String((c.sourceOut - c.sourceIn) / fps),
            '-i', assetPath(src, asset), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-ar', '48000', '-ac', '2', part]);
          return part;
        });
        const list = join(tmp, 'list.txt');
        writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
        mkdirSync(dirname(out), { recursive: true });
        run(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
      } finally { rmSync(tmp, { recursive: true, force: true }); }
      return text({ draft: out, ...ffprobe(out) });
    },
  },
};

/**
 * One styled export through the app's own main process (no window, own profile, so it never
 * touches a running Rough Cut). Resolves with the job result or rejects with its error.
 */
export function runStyledExport(job, { appDir = APP_DIR, timeoutMs = 3 * 60 * 60 * 1000 } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'rc-mcp-export-'));
  const jobPath = join(work, 'job.json');
  writeFileSync(jobPath, JSON.stringify(job));
  const electron = join(appDir, 'node_modules/.bin/electron');
  if (!existsSync(electron)) throw new Error('The Rough Cut app is not installed next to this tool (no electron).');
  const display = process.env.DISPLAY && !process.env.ROUGH_CUT_MCP_FORCE_XVFB ? [] : ['xvfb-run', '-a'];
  const command = [...display, electron, '--enable-sandbox', '--mute-audio', '--disable-gpu', `--user-data-dir=${join(work, 'profile')}`, '.'];
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: appDir,
      env: { ...process.env, ROUGH_CUT_AGENT_EXPORT_JOB: jobPath, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(readFileSync(`${jobPath}.result.json`, 'utf8'));
        if (!result.ok) throw new Error(result.error || 'Export failed');
        resolvePromise(result);
      } catch (err) {
        reject(new Error(`${err.message}${stderr ? ` | ${stderr.slice(-600)}` : ''}`));
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    });
  });
}

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
      return send({ jsonrpc: '2.0', id, result: { prompts: [{ name: 'watch_and_discuss', description: 'Watch a video, then talk it through with the user and suggest or make edits.', arguments: [{ name: 'path', description: 'Project (.roughcut) or video file', required: true }] }, { name: 'edit_recording', description: 'Edit a raw recording end to end: remove retakes, silences and private screens, check it, hand it over for one-click review.', arguments: [{ name: 'path', description: 'Project (.roughcut)', required: true }] }] } });
    }
    if (method === 'prompts/get' && params?.name === 'edit_recording') {
      const p = params?.arguments?.path ?? '';
      const steps = [
        `Edit this recording end to end: ${p}`,
        'Edits go only to the edit copy and the Agent edits list; the original never changes.',
        '1. video_digest (project_path), then transcribe if there is no transcript.',
        '2. suggest_cuts with kinds retake, silence, privacy (add filler only if I ask). Proposals only.',
        '3. Check retakes and any line marked "?silent" with get_transcript (from/to); drop proposals you doubt. Privacy cuts: confirm with look_at.',
        '4. make_edit_copy, then ONE apply_edits with the cuts you trust (source seconds; overlaps are merged).',
        '5. review_edit (render:true). Fix anything it reports (stray clips, black frames) and re-check.',
        '6. Tell me in 2-3 plain sentences what was cut and the new length. I take the edits in from Dev menu > Agent edits.',
      ];
      return send({ jsonrpc: '2.0', id, result: { messages: [{ role: 'user', content: { type: 'text', text: steps.join('\n') } }] } });
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
