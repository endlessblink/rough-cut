#!/usr/bin/env node
// Export review: export a real project through the PACKAGED app into a dated
// folder, then measure the result and build the pictures a human/agent must LOOK at.
//
//   node scripts/export-review/review-export.mjs <project.roughcut>
//   node scripts/export-review/review-export.mjs <project.roughcut> --reuse <export.mp4>   (no new export)
//   --format raw  export in Raw mode instead of Styled (default styled)
//   --no-editor   skip the editor-vs-export comparison (no app launch when combined with --reuse)
//   --out-root D  default: ~/Documents/Rough Cut MVP/export-reviews
//
// Every export gets its own folder: <out-root>/<project>/<YYYY-MM-DD_HHMM>/ with export.mp4,
// REPORT.md, report.json, sheets/*.jpg|png, editor/*.png. `latest` points at the newest.
// Automated gates can only say "not obviously broken": the REPORT always ends with the
// pictures that must be opened and judged by eye. Nothing here proves an export is good.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = parseArgs(process.argv.slice(2));
const projectPath = resolve(args.positional[0] || '');
if (!args.positional[0] || !existsSync(projectPath)) {
  console.error('Usage: node scripts/export-review/review-export.mjs <project.roughcut> [--reuse <export.mp4>] [--no-editor] [--out-root DIR]');
  process.exit(2);
}

const slug = basename(projectPath).replace(/\.roughcut$/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60);
const outRoot = resolve(args.flags['out-root'] || join(homedir(), 'Documents', 'Rough Cut MVP', 'export-reviews'));
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const outDir = join(outRoot, slug, stamp);
const sheetsDir = join(outDir, 'sheets');
const editorDir = join(outDir, 'editor');
const workDir = join(tmpdir(), `rc-export-review-${Date.now()}`);
for (const dir of [outDir, sheetsDir, editorDir, workDir]) mkdirSync(dir, { recursive: true });
const exportPath = join(outDir, 'export.mp4');

// The background grid must be in the export when the project asks for it (and absent when it does not).
// Measured, not eyeballed: average brightness on the columns where a line must fall vs the columns beside it,
// in the left margin outside the screen, where only the background is.
function checkBackgroundGrid() {
  const W = video.width; const H = video.height;
  const step = W / 12;
  const marginRight = (plan.screenFrame ? plan.screenFrame.x * W : W * 0.15) - 24;
  if (step + 8 > marginRight) { check('background-grid', 'warn', 'the screen covers the first grid line; not measurable on this layout'); return; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', exportPath, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  const buf = r.stdout;
  if (!buf || buf.length < W * H * 3) { check('background-grid', 'warn', 'could not read a frame to measure'); return; }
  const mean = (x0, x1) => {
    let sum = 0; let n = 0;
    for (let y = Math.round(H * 0.42); y < Math.round(H * 0.58); y += 1) {
      for (let x = x0; x <= x1; x += 1) { const i = (y * W + x) * 3; sum += (buf[i] + buf[i + 1] + buf[i + 2]) / 3; n += 1; }
    }
    return sum / n;
  };
  const line = mean(Math.round(step) - 1, Math.round(step));
  const beside = mean(Math.round(step) - 12, Math.round(step) - 8);
  const present = line - beside >= 4;
  if (plan.backgroundGrid) check('background-grid', present ? 'pass' : 'fail', `${present ? 'grid lines are in the export' : 'THE PROJECT HAS GRID LINES ON BUT THE EXPORT HAS NONE'} (line ${line.toFixed(1)} vs beside ${beside.toFixed(1)})`);
  else check('background-grid', present ? 'fail' : 'pass', `${present ? 'grid lines appear although the project has them off' : 'no grid lines, as the project asks'} (line ${line.toFixed(1)} vs beside ${beside.toFixed(1)})`);
}

let spikes = [];
let parity = [];
let appSelfCheck = null;
const checks = [];
const check = (id, status, detail) => { checks.push({ id, status, detail }); log(`${status.toUpperCase().padEnd(4)} ${id}: ${detail}`); };
function log(message) { console.log(message); }

// ---------------------------------------------------------------- plan
const plan = await buildPlan(projectPath);
log(`plan: ${plan.fps} fps, timeline ${plan.totalFrames}f, cuts remove ${plan.removedFrames}f, expect ${plan.expectedSec.toFixed(2)}s, ${plan.zoomMarkers.length} zoom, ${plan.graphics.length} graphics`);
const samples = buildSamples(plan);

// ---------------------------------------------------------------- editor shots + export
if (args.flags.reuse) {
  copyFileSync(resolve(args.flags.reuse), exportPath);
}
const needApp = !args.flags.reuse || !args.flags['no-editor'];
if (needApp) await runApp({ doExport: !args.flags.reuse, doShots: !args.flags['no-editor'] });
if (!existsSync(exportPath)) { check('export-exists', 'fail', 'no export.mp4 was produced'); finish(); }

// ---------------------------------------------------------------- analysis
const probe = ffprobeJson(exportPath);
const video = probe.streams.find((s) => s.codec_type === 'video');
const audio = probe.streams.find((s) => s.codec_type === 'audio');
const duration = Number(probe.format.duration);
check('export-exists', 'pass', `${(Number(probe.format.size) / 1e6).toFixed(1)} MB, ${video?.codec_name} ${video?.width}x${video?.height}`);

const wantSize = plan.canvas;
if (wantSize && (video.width !== wantSize.width || video.height !== wantSize.height)) check('resolution', 'warn', `${video.width}x${video.height}, project says ${wantSize.width}x${wantSize.height}`);
else check('resolution', 'pass', `${video.width}x${video.height}`);

const durOk = Math.abs(duration - plan.expectedSec) <= 0.25;
check('duration', durOk ? 'pass' : 'fail', `${duration.toFixed(2)}s, expected ${plan.expectedSec.toFixed(2)}s (timeline minus hidden ranges)`);

// A step that throws must show up in the report, never end the run silently.
const step = async (name, fn) => { try { await fn(); } catch (error) { check(name, 'fail', `the review step crashed: ${String(error?.stack || error).split('\n').slice(0, 3).join(' | ')}`); } };
if (appSelfCheck !== null) {
  const problem = /Problem found/i.test(appSelfCheck);
  const animationsOk = plan.graphics.length === 0 || /animations/i.test(appSelfCheck);
  check('app-self-check', problem || !animationsOk ? 'fail' : 'pass', appSelfCheck.slice(0, 280) || 'the app showed no check line');
}
await step('audio-analysis', analyseAudio);
await step('video-analysis', analyseVideo);
await step('contact-sheets', buildSheets);
if (!args.flags['no-editor']) await step('editor-compare', compareWithEditor);
finish();

// ================================================================ implementation

async function buildPlan(path) {
  const main = (f) => import(pathToFileURL(join(repoRoot, 'apps/desktop/src/main', f)).href);
  const { openProjectFile, getPrimaryRecording } = await main('project-files.mjs');
  const { resolveTimelineExportRecording, buildCutFrameRemap } = await main('export-service.mjs');
  const { listGraphics } = await import(pathToFileURL(join(repoRoot, 'apps/desktop/src/shared/motion-graphics.mjs')).href);
  const { isBackgroundGridOn } = await import(pathToFileURL(join(repoRoot, 'apps/desktop/src/shared/background-grid.mjs')).href);
  const opened = await openProjectFile(path);
  const document = opened.document;
  const recording = getPrimaryRecording(document);
  const exportRecording = resolveTimelineExportRecording(document, recording, { exportScope: 'timeline' }) ?? recording;
  const fps = Number.isFinite(exportRecording.fps) && exportRecording.fps > 0 ? exportRecording.fps : 30;
  const totalFrames = exportRecording.timelineDurationFrames ?? exportRecording.duration;
  const remap = buildCutFrameRemap(exportRecording);
  const mapFrame = (frame) => remap.mapFrame(frame);
  // timeline frame -> first timeline frame that lands on (or after) this export frame
  const invert = (exportFrame) => {
    for (let f = 0; f <= totalFrames; f += 1) if (mapFrame(f) >= exportFrame) return f;
    return totalFrames;
  };
  const visibleStartFrame = (() => { for (let f = 0; f < totalFrames; f += 1) if (mapFrame(f + 1) > mapFrame(f)) return f; return 0; })();
  const graphics = listGraphics(document).filter((g) => g.enabled).map((g) => ({ id: g.id, title: g.title || g.id, startFrame: g.startFrame, endFrame: g.endFrame }));
  const resolution = document.settings?.resolution;
  return {
    fps, totalFrames, removedFrames: remap.removedFrames, expectedSec: (totalFrames - remap.removedFrames) / fps,
    mapFrame, invert, visibleStartFrame,
    zoomMarkers: (exportRecording.zoomMarkers ?? []).map((m) => ({ startFrame: m.startFrame, endFrame: m.endFrame })),
    graphics, sourceAudioPath: recording.filePath, sourceDuration: null,
    cameraFrame: exportRecording.presentation?.cameraFrame && recording.camera?.filePath ? exportRecording.presentation.cameraFrame : null,
    backgroundGrid: isBackgroundGridOn(exportRecording.presentation?.background),
    screenFrame: exportRecording.presentation?.screenFrame ?? null,
    canvas: resolution?.width && resolution?.height ? { width: resolution.width, height: resolution.height } : null,
  };
}

function buildSamples(p) {
  const out = [];
  const add = (label, exportSec) => {
    const t = Math.max(0.2, Math.min(p.expectedSec - 0.2, exportSec));
    if (out.some((s) => Math.abs(s.exportSec - t) < 0.4)) return;
    out.push({ label, exportSec: t, timelineSec: p.invert(Math.round(t * p.fps)) / p.fps });
  };
  const toExport = (frame) => p.mapFrame(frame) / p.fps;
  add('start', 0.6);
  for (let i = 1; i <= 7; i += 1) add(`even ${i}/8`, (p.expectedSec * i) / 8);
  add('end', p.expectedSec - 0.8);
  p.zoomMarkers.slice(0, 5).forEach((m, i) => {
    const s = toExport(m.startFrame); const e = toExport(m.endFrame);
    add(`zoom${i + 1} before`, s - 1); add(`zoom${i + 1} in`, s + 0.8); add(`zoom${i + 1} mid`, (s + e) / 2); add(`zoom${i + 1} after`, e + 1);
  });
  p.graphics.slice(0, 8).forEach((g, i) => {
    const s = toExport(g.startFrame); const e = toExport(g.endFrame);
    add(`graphic${i + 1} early`, s + (e - s) * 0.25); add(`graphic${i + 1} late`, s + (e - s) * 0.65);
  });
  return out.sort((a, b) => a.exportSec - b.exportSec).slice(0, 40);
}

// ---------------------------------------------------------------- app: shots + export
async function runApp({ doExport, doShots }) {
  const packaged = join(repoRoot, 'dist', 'rough-cut-mvp-linux-x64');
  const electronPath = join(packaged, 'electron');
  const appPath = join(packaged, 'resources', 'app');
  if (!existsSync(electronPath) || !existsSync(appPath)) throw new Error('The packaged app is missing; run pnpm package:linux first.');
  const { _electron: electron } = loadPlaywright();
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${join(workDir, 'user-data')}`, appPath],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
      ROUGH_CUT_UI_SMOKE_EXPORT_PATH: exportPath,
      ROUGH_CUT_STARTUP_VIEW: 'editor',
      ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
      ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1500',
    },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 90000 });
    if (doShots) {
      const stage = page.locator('[data-ui-region="graphics-overlay"]').locator('xpath=..').first();
      for (const sample of samples) {
        await page.evaluate((t) => window.__roughCutSetPreviewTimeSec(t), sample.timelineSec);
        await page.waitForFunction(() => { const v = document.querySelector('video'); return Boolean(v) && !v.seeking && v.readyState >= 2; }, null, { timeout: 30000 });
        await new Promise((r) => setTimeout(r, 900));
        sample.editorShot = join(editorDir, `${sampleFile(sample)}.png`);
        await stage.screenshot({ path: sample.editorShot }).catch(async () => {
          await page.locator('canvas.styledPreviewCanvas').first().screenshot({ path: sample.editorShot });
        });
      }
      log(`editor shots: ${samples.length}`);
    }
    if (doExport) {
      await page.evaluate(() => window.__roughCutSetPreviewTimeSec(0)).catch(() => {});
      await page.locator('[data-ui-region="export-popover-toggle"][aria-pressed="false"]').click().catch(() => {});
      await page.locator(`button.exportFormat[data-export-format="${args.flags.format === 'raw' ? 'raw' : 'styled'}"]`).click();
      await page.locator('[data-export-action="export"]').click();
      const started = Date.now();
      await page.waitForFunction(() => document.body.textContent?.includes('Exported to:'), null, { timeout: Number(args.flags['export-timeout-ms'] || 3000000) });
      log(`export finished in ${((Date.now() - started) / 1000).toFixed(0)}s`);
      appSelfCheck = (await page.locator('[data-ui-region="export-result"]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    }
    await page.screenshot({ path: join(outDir, 'app-final.png') }).catch(() => {});
  } finally {
    await app.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------- audio
function analyseAudio() {
  const srcProbe = ffprobeJson(plan.sourceAudioPath);
  const srcHasAudio = srcProbe.streams.some((s) => s.codec_type === 'audio');
  if (!srcHasAudio) { check('audio', audio ? 'warn' : 'pass', 'source has no audio'); return; }
  if (!audio) { check('audio', 'fail', 'SILENT EXPORT: the source has audio but the export has no audio stream'); return; }
  const aDur = Number(audio.duration || duration);
  check('audio-length', Math.abs(aDur - duration) <= 0.3 ? 'pass' : 'fail', `audio ${aDur.toFixed(2)}s vs video ${duration.toFixed(2)}s`);

  const exp = volume(exportPath); const src = volume(plan.sourceAudioPath);
  if (exp.mean === null) check('audio-level', 'fail', 'audio stream decodes to nothing');
  else {
    const delta = Math.abs(exp.mean - src.mean);
    check('audio-level', delta <= 3 ? 'pass' : 'fail', `mean ${exp.mean} dB vs source ${src.mean} dB (diff ${delta.toFixed(1)} dB)`);
    check('audio-clipping', exp.max >= -0.1 ? 'warn' : 'pass', `peak ${exp.max} dB`);
  }
  const silences = silenceRuns(exportPath);
  check('audio-dropouts', silences.filter((s) => s.dur >= 3).length === 0 ? 'pass' : 'warn', silences.length ? `silent runs >=1.5s: ${silences.map((s) => `${s.start.toFixed(1)}s+${s.dur.toFixed(1)}s`).join(', ')}` : 'no silent runs >= 1.5 s');

  // Sync: correlate loudness envelopes of the export and the source (shifted by the removed head).
  const envE = envelope(exportPath); const envS = envelope(plan.sourceAudioPath);
  const headSec = plan.visibleStartFrame / plan.fps;
  const rate = 50;
  const windows = [0.05, 0.5, 0.9].map((f) => Math.max(0, Math.min(duration - 40, duration * f)));
  const results = windows.map((w0) => {
    const a0 = Math.round(w0 * rate); const len = Math.round(30 * rate);
    let best = { lag: 0, corr: -1 };
    for (let lag = -60; lag <= 60; lag += 1) {
      const c = corr(envE, a0, envS, a0 + Math.round(headSec * rate) + lag, len);
      if (c > best.corr) best = { lag, corr: c };
    }
    return { at: w0, lagMs: best.lag * (1000 / rate), corr: best.corr };
  });
  const bad = results.filter((r) => r.corr >= 0.5 && Math.abs(r.lagMs) > 60);
  const weak = results.filter((r) => r.corr < 0.5);
  check('audio-sync', bad.length ? 'fail' : weak.length === results.length ? 'warn' : 'pass',
    results.map((r) => `@${r.at.toFixed(0)}s lag ${r.lagMs.toFixed(0)}ms (corr ${r.corr.toFixed(2)})`).join('; '));

  // Pictures: waveform + spectrogram of the export (distortion/clipping shows here).
  run('ffmpeg', ['-v', 'error', '-y', '-i', exportPath, '-filter_complex', 'showwavespic=s=1800x240:colors=#58a6ff', '-frames:v', '1', join(sheetsDir, 'audio-waveform.png')]);
  run('ffmpeg', ['-v', 'error', '-y', '-i', exportPath, '-lavfi', 'showspectrumpic=s=1800x360:legend=0', join(sheetsDir, 'audio-spectrogram.png')]);
}

// ---------------------------------------------------------------- video
function analyseVideo() {
  const t0 = Date.now();
  const r = run('ffmpeg', ['-hide_banner', '-i', exportPath, '-an', '-vf', 'blackdetect=d=0.2:pic_th=0.97,freezedetect=n=-55dB:d=1.5', '-f', 'null', '-'], { stderr: true });
  const text = r.stderr;
  const blacks = [...text.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) })).filter((b) => b.start > 0.1 && b.end < duration + 1);
  check('black-frames', blacks.length === 0 ? 'pass' : 'fail', blacks.length ? blacks.map((b) => `${b.start.toFixed(1)}-${b.end.toFixed(1)}s`).join(', ') : 'none');
  // Slides sit still for long stretches, so a whole-frame freeze means nothing. The camera
  // corner is a live person and must keep moving: judge freezing there only.
  const cam = plan.cameraFrame;
  if (cam) {
    const crop = `crop=iw*${cam.w.toFixed(4)}:ih*${cam.h.toFixed(4)}:iw*${cam.x.toFixed(4)}:ih*${cam.y.toFixed(4)}`;
    const fr = run('ffmpeg', ['-hide_banner', '-i', exportPath, '-an', '-vf', `${crop},freezedetect=n=-60dB:d=1.5`, '-f', 'null', '-'], { stderr: true });
    const starts = [...fr.stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
    const durs = [...fr.stderr.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
    const freezes = starts.map((s, i) => ({ start: s, dur: durs[i] ?? Math.max(0, duration - s) }));
    const long = freezes.filter((f) => f.dur >= 3);
    check('camera-frozen', long.length === 0 ? (freezes.length ? 'warn' : 'pass') : 'fail', freezes.length ? `camera corner still: ${freezes.map((f) => `${f.start.toFixed(1)}s for ${f.dur.toFixed(1)}s`).join(', ')}` : 'camera corner never stops moving for >1.5 s');
  } else {
    check('camera-frozen', 'warn', 'project has no camera frame; not checked');
  }
  checkBackgroundGrid();
  // The very end must not be a held frame (the old bug padded the export with a frozen tail).
  const tail = run('ffmpeg', ['-hide_banner', '-ss', String(Math.max(0, duration - 5)), '-i', exportPath, '-an', '-vf', 'freezedetect=n=-60dB:d=2', '-f', 'null', '-'], { stderr: true });
  const tailFreeze = [...tail.stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  check('frozen-tail', tailFreeze.length === 0 ? 'pass' : 'fail', tailFreeze.length ? `last seconds are a held frame from ${(duration - 5 + tailFreeze[0]).toFixed(1)}s` : 'the export ends on moving content');
  // Sudden jumps between consecutive frames (glitches / hard cuts) — listed, and drawn into a sheet.
  const statsFile = join(workDir, 'ydif.txt');
  run('ffmpeg', ['-v', 'error', '-y', '-i', exportPath, '-an', '-vf', `fps=10,scale=480:-2,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=${statsFile}`, '-f', 'null', '-']);
  const rows = readFileSync(statsFile, 'utf8').split('\n');
  const ydif = []; let t = 0;
  for (const row of rows) {
    const tm = row.match(/pts_time:([\d.]+)/); if (tm) t = Number(tm[1]);
    const dm = row.match(/YDIF=([\d.]+)/); if (dm) ydif.push({ t, v: Number(dm[1]) });
  }
  const sorted = [...ydif].map((x) => x.v).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  spikes = ydif.filter((x) => x.v > Math.max(20, median * 8)).sort((a, b) => b.v - a.v).slice(0, 12).sort((a, b) => a.t - b.t);
  check('frame-jumps', 'warn', spikes.length ? `${spikes.length} big frame-to-frame jumps (slide changes/zooms are normal; LOOK at sheets/jumps.jpg): ${spikes.map((s) => `${s.t.toFixed(1)}s(${s.v.toFixed(0)})`).join(', ')}` : 'none');
  log(`video analysis ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ---------------------------------------------------------------- sheets (the pictures to look at)
async function buildSheets() {
  const frame = (sec, name) => { const p = join(workDir, name); run('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, sec)), '-i', exportPath, '-frames:v', '1', '-vf', 'scale=480:-2', p]); return p; };
  const sheet = (items, file, cols) => {
    const a = [];
    for (const [label, path] of items) a.push('-label', label, path);
    run('montage', [...a, '-tile', `${cols}x`, '-geometry', '+4+4', '-background', '#111111', '-fill', 'white', '-pointsize', '16', join(sheetsDir, file)]);
  };
  // 1. whole video, one frame per ~10 s
  const step = Math.max(5, Math.ceil(duration / 36));
  const overview = []; for (let s = 1; s < duration - 0.3; s += step) overview.push([`${s.toFixed(0)}s`, frame(s, `ov_${s}.jpg`)]);
  sheet(overview, '1-overview.jpg', 6);
  // 2. each zoom, 6 frames across (and just outside) it
  plan.zoomMarkers.slice(0, 6).forEach((m, i) => {
    const s = plan.mapFrame(m.startFrame) / plan.fps; const e = plan.mapFrame(m.endFrame) / plan.fps;
    const times = [s - 1, s, s + 0.6, (s + e) / 2, e - 0.3, e + 1];
    sheet(times.map((x) => [`${x.toFixed(1)}s`, frame(x, `z${i}_${x}.jpg`)]), `2-zoom${i + 1}.jpg`, 3);
  });
  // 3. each graphic, 6 frames across it
  plan.graphics.slice(0, 8).forEach((g, i) => {
    const s = plan.mapFrame(g.startFrame) / plan.fps; const e = plan.mapFrame(g.endFrame) / plan.fps;
    const times = [0, 0.15, 0.35, 0.55, 0.8, 1].map((f) => s + (e - s) * f);
    sheet(times.map((x) => [`${x.toFixed(1)}s`, frame(x, `g${i}_${x}.jpg`)]), `3-graphic${i + 1}.jpg`, 3);
  });
  // 4. glitch candidates: frame before and at each jump
  if (spikes.length) sheet(spikes.slice(0, 9).flatMap((sp) => [[`${(sp.t - 0.1).toFixed(1)}s`, frame(sp.t - 0.1, `j_${sp.t}_a.jpg`)], [`${sp.t.toFixed(1)}s`, frame(sp.t, `j_${sp.t}_b.jpg`)]]), 'jumps.jpg', 4);
  // 5. very start and very end (black/frozen/ragged edges)
  sheet([0.05, 0.5, 1.5, duration - 3, duration - 1, duration - 0.15].map((x) => [`${x.toFixed(2)}s`, frame(x, `edge_${x}.jpg`)]), '4-start-and-end.jpg', 3);
}

// ---------------------------------------------------------------- editor vs export
function compareWithEditor() {
  const withShots = samples.filter((s) => s.editorShot && existsSync(s.editorShot));
  if (withShots.length === 0) { check('editor-parity', 'warn', 'no editor shots were taken'); return; }
  const norm = (src, dst) => run('convert', [src, '-resize', '640x360!', '-colorspace', 'Gray', dst]);
  const offsets = []; for (let o = -3; o <= 3.001; o += 0.5) offsets.push(Number(o.toFixed(1)));
  // A sample planned past the real end (an export shorter than planned) is looked up at the last
  // frame instead, so the compare never has an empty candidate list; the length check reports the gap.
  const at = (s) => Math.max(0, Math.min(s.exportSec, duration - 0.15));
  const inRange = (s, o) => at(s) + o >= 0 && at(s) + o <= duration - 0.1;
  const rows = []; const pairs = [];
  for (const s of withShots) {
    const ed = join(workDir, `ed_${sampleFile(s)}.png`); norm(s.editorShot, ed);
    const scores = offsets.filter((o) => inRange(s, o)).map((o) => {
      const f = join(workDir, `ex_${sampleFile(s)}_${o}.png`);
      run('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, at(s) + o)), '-i', exportPath, '-frames:v', '1', f]);
      const n = f.replace('.png', '_n.png'); norm(f, n);
      return { o, ssim: ssim(ed, n), file: f };
    });
    const at0 = scores.find((x) => x.o === 0);
    if (!at0) { rows.push({ label: s.label, exportSec: s.exportSec, timelineSec: s.timelineSec, ssimAtExpected: 0, bestOffsetSec: 0, bestSsim: 0, aligned: false }); continue; }
    const best = scores.reduce((a, b) => (b.ssim > a.ssim ? b : a));
    const aligned = at0.ssim >= best.ssim - 0.05;
    rows.push({ label: s.label, exportSec: s.exportSec, timelineSec: s.timelineSec, ssimAtExpected: at0.ssim, bestOffsetSec: best.o, bestSsim: best.ssim, aligned });
    pairs.push([[`EDITOR ${s.label} (timeline ${s.timelineSec.toFixed(1)}s)`, s.editorShot], [`EXPORT ${s.exportSec.toFixed(1)}s ssim ${at0.ssim.toFixed(2)}${aligned ? '' : ` BEST ${best.o >= 0 ? '+' : ''}${best.o}s`}`, at0.file]]);
  }
  for (let i = 0; i < pairs.length; i += 4) {
    const a = []; for (const [l, p] of pairs.slice(i, i + 4).flat()) a.push('-label', l, p);
    run('montage', [...a, '-tile', '4x', '-geometry', '480x270+4+4', '-background', '#111111', '-fill', 'white', '-pointsize', '15', join(sheetsDir, `5-editor-vs-export-${String(i / 4 + 1).padStart(2, '0')}.jpg`)]);
  }
  const off = rows.filter((r) => !r.aligned);
  const med = rows.map((r) => r.ssimAtExpected).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  check('editor-timing', off.length === 0 ? 'pass' : off.length / rows.length > 0.25 ? 'fail' : 'warn',
    off.length === 0 ? `all ${rows.length} sampled moments match the editor at the expected time (median similarity ${med.toFixed(2)})`
      : `${off.length}/${rows.length} moments match the editor better at another time: ${off.map((r) => `${r.label} ${r.bestOffsetSec >= 0 ? '+' : ''}${r.bestOffsetSec}s`).join(', ')}`);
  parity = rows;
}

// ---------------------------------------------------------------- report
function finish() {
  const failed = checks.filter((c) => c.status === 'fail');
  const warned = checks.filter((c) => c.status === 'warn');
  const verdict = failed.length ? 'FAIL' : 'AUTOMATED CHECKS PASSED — NOT VERIFIED UNTIL SOMEONE LOOKS AT THE PICTURES BELOW';
  const sheetsList = existsSync(sheetsDir) ? listFiles(sheetsDir) : [];
  const md = [
    `# Export review — ${slug} — ${stamp}`,
    '', `**${verdict}**`, '',
    `- export: \`${exportPath}\``,
    `- project: \`${projectPath}\``,
    `- expected length ${plan.expectedSec.toFixed(2)} s; ${plan.zoomMarkers.length} zoom(s); ${plan.graphics.length} graphic(s); ${plan.removedFrames} frames hidden by cuts`,
    '', '## Automated checks', '', '| | check | result |', '|---|---|---|',
    ...checks.map((c) => `| ${{ pass: 'PASS', warn: 'WARN', fail: '**FAIL**' }[c.status]} | ${c.id} | ${c.detail.replace(/\|/g, '/')} |`),
    '', '## Editor vs export (same moment)', '',
    parity.length ? '| moment | export s | timeline s | similarity | best offset |\n|---|---|---|---|---|\n' + parity.map((r) => `| ${r.label} | ${r.exportSec.toFixed(1)} | ${r.timelineSec.toFixed(1)} | ${r.ssimAtExpected.toFixed(2)} | ${r.aligned ? 'ok' : `${r.bestOffsetSec}s`} |`).join('\n') : '_not run_',
    '', '## LOOK AT THESE (mandatory — open each image and describe what you see)', '',
    ...sheetsList.map((f) => `- \`${join(sheetsDir, f)}\``),
    '', `Failed: ${failed.length}, warnings: ${warned.length}.`, '',
  ].join('\n');
  writeFileSync(join(outDir, 'REPORT.md'), md);
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify({ verdict, projectPath, exportPath, plan: { ...plan, mapFrame: undefined, invert: undefined }, samples, checks, parity, sheets: sheetsList }, null, 2)}\n`);
  try { const latest = join(outRoot, slug, 'latest'); rmSync(latest, { force: true }); symlinkSync(outDir, latest); } catch {}
  try { appendFileSync(join(outRoot, 'INDEX.md'), `- ${stamp} ${slug}: ${failed.length ? 'FAIL' : 'auto-pass'} (${failed.length} fail, ${warned.length} warn) — ${outDir}\n`); } catch {}
  rmSync(workDir, { recursive: true, force: true });
  console.log(`\n${verdict}\nreport: ${join(outDir, 'REPORT.md')}\nfolder: ${outDir}`);
  process.exit(failed.length ? 1 : 0);
}

// ---------------------------------------------------------------- helpers
function parseArgs(argv) {
  const positional = []; const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const next = argv[i + 1]; if (next === undefined || next.startsWith('--')) flags[k] = true; else { flags[k] = next; i += 1; } }
    else positional.push(argv[i]);
  }
  return { positional, flags };
}
function run(cmd, a, { stderr = false } = {}) {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (!stderr && r.status !== 0 && cmd !== 'compare') console.error(`[warn] ${cmd} exit ${r.status}: ${(r.stderr || '').slice(-300)}`);
  return r;
}
function ffprobeJson(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout || '{"streams":[],"format":{}}');
}
function volume(file) {
  const r = run('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { stderr: true });
  const m = r.stderr.match(/mean_volume: (-?[\d.]+) dB/); const x = r.stderr.match(/max_volume: (-?[\d.]+) dB/);
  return { mean: m ? Number(m[1]) : null, max: x ? Number(x[1]) : null };
}
function silenceRuns(file) {
  const r = run('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'silencedetect=n=-50dB:d=1.5', '-f', 'null', '-'], { stderr: true });
  const starts = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const durs = [...r.stderr.matchAll(/silence_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ start: s, dur: durs[i] ?? 0 }));
}
function envelope(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', '-'], { maxBuffer: 1 << 30 });
  const buf = r.stdout; const n = Math.floor(buf.length / 2 / 80); const env = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { let s = 0; for (let j = 0; j < 80; j += 1) s += Math.abs(buf.readInt16LE((i * 80 + j) * 2)); env[i] = s / 80; }
  return env;
}
function corr(a, a0, b, b0, len) {
  let sa = 0; let sb = 0; let n = 0;
  for (let i = 0; i < len; i += 1) { const x = a[a0 + i]; const y = b[b0 + i]; if (x === undefined || y === undefined) continue; sa += x; sb += y; n += 1; }
  if (n < len * 0.8) return -1;
  const ma = sa / n; const mb = sb / n; let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < len; i += 1) { const x = a[a0 + i]; const y = b[b0 + i]; if (x === undefined || y === undefined) continue; num += (x - ma) * (y - mb); da += (x - ma) ** 2; db += (y - mb) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : -1;
}
function ssim(l, r) {
  const x = spawnSync('compare', ['-metric', 'SSIM', l, r, 'null:'], { encoding: 'utf8' });
  const v = Number((x.stderr || x.stdout).trim().split(/\s+/)[0]);
  return Number.isFinite(v) ? v : 0;
}
function sampleFile(s) { return `${String(Math.round(s.exportSec * 10)).padStart(5, '0')}-${s.label.replace(/[^a-z0-9]+/gi, '_')}`; }
function listFiles(dir) { return spawnSync('ls', [dir], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean); }
function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}
