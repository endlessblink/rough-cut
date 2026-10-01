// Finds stretches of a recording with no speech, locally, with ffmpeg's
// silencedetect. The AI edit used to get only the clip length and a click
// count, so it could not hear long dead-air gaps (2026-10-01); these ranges
// now become cut suggestions directly and are shown to Claude as facts.

import { spawn } from 'node:child_process';

export const DEFAULT_SILENCE = Object.freeze({ noiseDb: -38, minSilenceSec: 1.5, padSec: 0.25 });

/** Parse ffmpeg silencedetect stderr into [{ startSec, endSec }]. */
export function parseSilenceDetect(stderr, { durationSec = null } = {}) {
  const ranges = [];
  let openStart = null;
  for (const line of String(stderr ?? '').split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) {
      openStart = Math.max(0, Number(start[1]));
      continue;
    }
    const end = line.match(/silence_end:\s*([\d.]+)/);
    if (end && openStart !== null) {
      ranges.push({ startSec: openStart, endSec: Number(end[1]) });
      openStart = null;
    }
  }
  // Silence that runs to the end of the file has no silence_end line.
  if (openStart !== null && Number.isFinite(durationSec) && durationSec > openStart) {
    ranges.push({ startSec: openStart, endSec: durationSec });
  }
  return ranges.filter((range) => Number.isFinite(range.startSec) && Number.isFinite(range.endSec) && range.endSec > range.startSec);
}

/**
 * Turn silences into cut ranges (frames), keeping a little breathing room at
 * each side so speech is never clipped, and dropping ones already cut.
 */
export function silencesToCutRanges(silences, { fps = 30, padSec = DEFAULT_SILENCE.padSec, minSilenceSec = DEFAULT_SILENCE.minSilenceSec, durationFrames = Infinity, existingCuts = [] } = {}) {
  const out = [];
  for (const silence of silences) {
    const length = silence.endSec - silence.startSec;
    if (length < minSilenceSec) continue;
    // A silence at the very start or end needs no padding on its outer edge.
    const atStart = silence.startSec <= 0.05;
    const atEnd = Number.isFinite(durationFrames) && silence.endSec * fps >= durationFrames - 1;
    const startFrame = Math.round((atStart ? 0 : silence.startSec + padSec) * fps);
    const endFrame = Math.min(durationFrames, Math.round((atEnd ? silence.endSec : silence.endSec - padSec) * fps));
    if (endFrame - startFrame < Math.round(0.5 * fps)) continue;
    const alreadyCut = existingCuts.some((cut) => startFrame >= cut.startFrame && endFrame <= cut.endFrame);
    if (alreadyCut) continue;
    out.push({ startFrame, endFrame, silenceSec: Math.round(length * 10) / 10 });
  }
  return out;
}

/** Run ffmpeg silencedetect on the first audio stream of a media file. */
export function detectSilences({ filePath, noiseDb = DEFAULT_SILENCE.noiseDb, minSilenceSec = DEFAULT_SILENCE.minSilenceSec, durationSec = null, signal = null, spawnImpl = spawn, timeoutMs = 120_000 }) {
  return new Promise((resolve) => {
    if (!filePath) {
      resolve({ ok: false, reason: 'No recording file to listen to.' });
      return;
    }
    const args = ['-hide_banner', '-nostats', '-i', filePath, '-map', '0:a:0', '-af', `silencedetect=noise=${noiseDb}dB:d=${minSilenceSec}`, '-f', 'null', '-'];
    const child = spawnImpl('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => { child.kill('SIGTERM'); finish({ ok: false, cancelled: true, reason: 'Cancelled.' }); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ ok: false, reason: 'Listening for silences took too long.' }); }, timeoutMs);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ ok: false, reason: `Could not run ffmpeg: ${error.message}` }));
    child.on('close', (code) => {
      if (code !== 0 && !/silence_/.test(stderr)) {
        finish({ ok: false, reason: /does not contain any stream|matches no streams/i.test(stderr) ? 'The recording has no audio.' : `ffmpeg exited with code ${code}.` });
        return;
      }
      finish({ ok: true, silences: parseSilenceDetect(stderr, { durationSec }) });
    });
  });
}
