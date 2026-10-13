import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ENVELOPE_BINS = 32768;
export const ENVELOPE_VERSION = 2;
const peakJobs = new Map();
const activeDecoders = new Set();

// Bounded signed extrema; never buffer a recording's entire decoded PCM.
export function createEnvelopeAccumulator({ channels, sampleRate, durationSec, bins = ENVELOPE_BINS }) {
  if (!Number.isInteger(channels) || channels < 1 || channels > 32 || !(sampleRate > 0) || !(durationSec > 0) || !Number.isInteger(bins) || bins < 1) throw new Error('Invalid waveform dimensions');
  const minimum = Array.from({ length: channels }, () => new Float32Array(bins));
  const maximum = Array.from({ length: channels }, () => new Float32Array(bins));
  const expectedFrames = Math.ceil(sampleRate * durationSec);
  const frameBytes = channels * 4;
  let frames = 0;
  let remainder = Buffer.alloc(0);
  return {
    push(chunk) {
      const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const completeBytes = data.length - data.length % frameBytes;
      for (let offset = 0; offset < completeBytes; offset += frameBytes, frames++) {
        if (frames >= expectedFrames) continue;
        const bin = Math.floor(frames * bins / expectedFrames);
        for (let channel = 0; channel < channels; channel++) {
          const value = data.readFloatLE(offset + channel * 4);
          if (!Number.isFinite(value)) throw new Error('Non-finite waveform sample');
          minimum[channel][bin] = Math.min(minimum[channel][bin], value);
          maximum[channel][bin] = Math.max(maximum[channel][bin], value);
        }
      }
      remainder = Buffer.from(data.subarray(completeBytes));
    },
    finish() {
      if (remainder.length) throw new Error('Incomplete waveform PCM frame');
      return { version: ENVELOPE_VERSION, channels, sampleRate, durationSec, bins, framesDecoded: frames, minimum: minimum.map(values => Array.from(values)), maximum: maximum.map(values => Array.from(values)) };
    },
  };
}

// Rebin with extrema, not averages: even a one-sample transient remains visible.
export function renderEnvelopeSvg(envelope, width, color = 'e0f2fe') {
  const channels = envelope.channels;
  const channelHeight = 100;
  const height = channelHeight * channels;
  const coordinate = value => Number(value.toFixed(4));
  const paths = [];
  for (let channel = 0; channel < channels; channel++) {
    const low = new Float32Array(width);
    const high = new Float32Array(width);
    for (let bin = 0; bin < envelope.bins; bin++) {
      const pixel = Math.min(width - 1, Math.floor(bin * width / envelope.bins));
      low[pixel] = Math.min(low[pixel], envelope.minimum[channel][bin]);
      high[pixel] = Math.max(high[pixel], envelope.maximum[channel][bin]);
    }
    const center = (channel + 0.5) * channelHeight;
    const y = value => coordinate(center - Math.max(-1, Math.min(1, value)) * channelHeight / 2);
    // Separate runs prevent a nonzero envelope bleeding across exact silence.
    for (let start = 0; start < width;) {
      if (low[start] === 0 && high[start] === 0) { start++; continue; }
      let end = start + 1;
      while (end < width && (low[end] !== 0 || high[end] !== 0)) end++;
      let path = `M${start},${y(high[start])}`;
      for (let x = start; x < end; x++) path += `L${x},${y(high[x])}L${x + 1},${y(high[x])}`;
      path += `L${end},${y(high[end - 1])}L${end},${y(low[end - 1])}`;
      for (let x = end - 1; x >= start; x--) path += `L${x + 1},${y(low[x])}L${x},${y(low[x])}`;
      path += `L${start},${y(low[start])}Z`;
      paths.push(`<path data-channel="${channel}" d="${path}"/>`);
      start = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><g fill="#${color}">${paths.join('')}</g></svg>`;
}

function audioInfo(sourcePath) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels,sample_rate,channel_layout', '-of', 'json', sourcePath], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    let output = ''; let error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`Waveform audio probe failed: ${error.slice(-300)}`));
      try {
        const stream = JSON.parse(output).streams?.[0];
        if (!stream) throw new Error('clip-visuals: source has no audio stream, no waveform to draw');
        resolve({ channels: Number(stream.channels), sampleRate: Number(stream.sample_rate), layout: stream.channel_layout ?? 'unspecified' });
      } catch (error) { reject(error); }
    });
  });
}

async function decodeEnvelope(sourcePath, info, durationSec, { startSec = 0, bins = ENVELOPE_BINS } = {}) {
  const accumulator = createEnvelopeAccumulator({ ...info, durationSec, bins });
  const child = spawn('ffmpeg', ['-nostdin', '-v', 'error', ...(startSec > 0 ? ['-ss', startSec.toFixed(9)] : []), '-i', sourcePath, '-map', '0:a:0', '-t', durationSec.toFixed(9), '-vn', '-sn', '-dn', '-f', 'f32le', '-c:a', 'pcm_f32le', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.max(60000, Math.ceil(durationSec * 200)) });
  activeDecoders.add(child);
  let errorText = '';
  child.stderr.on('data', chunk => { errorText = (errorText + chunk).slice(-2000); });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Waveform decode failed (${code}): ${errorText}`)));
  });
  // Attach a handler immediately so a stream failure cannot leave a rejection unobserved.
  completion.catch(() => {});
  try {
    for await (const chunk of child.stdout) accumulator.push(chunk);
    await completion;
    return accumulator.finish();
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  } finally { activeDecoders.delete(child); }
}

export function cancelWaveformDecoders() {
  for (const child of activeDecoders) child.kill('SIGTERM');
}

export async function ensureWaveformEnvelope({ sourcePath, mtimeMs, durationSec, width, directory, startSec = null, spanSec = null }) {
  const info = await audioInfo(sourcePath);
  if (startSec !== null || spanSec !== null) {
    if (!Number.isFinite(startSec) || !Number.isFinite(spanSec) || startSec < 0 || !(spanSec > 0) || startSec >= durationSec || !(width >= 1 && width <= 8192)) throw new Error('Invalid waveform source window');
    const actualSpan = Math.min(spanSec, durationSec - startSec);
    const key = createHash('sha256').update(JSON.stringify([sourcePath, mtimeMs, durationSec, info, startSec, actualSpan, width, ENVELOPE_VERSION])).digest('hex').slice(0,24);
    const svgPath = join(directory, `${key}-tile.svg`);
    const meta = {path:svgPath, kind:'waveform',durationSec,widthPx:width,channels:info.channels,startSec,spanSec:actualSpan};
    try { await readFile(svgPath); return meta; } catch { /* First view of this source window. */ }
    if (!peakJobs.has(svgPath)) peakJobs.set(svgPath, (async () => {
      const envelope = await decodeEnvelope(sourcePath,info,actualSpan,{startSec,bins:Math.ceil(width)});
      await mkdir(directory,{recursive:true});
      const temporary = `${svgPath}.${process.pid}.tmp`;
      await writeFile(temporary,renderEnvelopeSvg(envelope,Math.ceil(width)));await rename(temporary,svgPath);
    })().finally(()=>peakJobs.delete(svgPath)));
    await peakJobs.get(svgPath);return meta;
  }
  const key = createHash('sha256').update(JSON.stringify([sourcePath, mtimeMs, durationSec, info.channels, info.sampleRate, info.layout, ENVELOPE_BINS, ENVELOPE_VERSION])).digest('hex').slice(0, 24);
  const peaksPath = join(directory, `${key}.peaks.json`);
  const svgPath = join(directory, `${key}-${width}.svg`);
  if (!peakJobs.has(peaksPath)) {
    const job = (async () => {
      try {
        const cached = JSON.parse(await readFile(peaksPath, 'utf8'));
        if (cached.version === ENVELOPE_VERSION && cached.bins === ENVELOPE_BINS && cached.channels === info.channels && cached.durationSec === durationSec
          && cached.minimum?.length === info.channels && cached.maximum?.length === info.channels
          && [...cached.minimum, ...cached.maximum].every(values => Array.isArray(values) && values.length === ENVELOPE_BINS && values.every(Number.isFinite))) return cached;
      } catch { /* Regenerate absent or invalid data. */ }
      const envelope = await decodeEnvelope(sourcePath, info, durationSec);
      await mkdir(directory, { recursive: true });
      await writeFile(`${peaksPath}.${process.pid}.tmp`, JSON.stringify(envelope));
      await rename(`${peaksPath}.${process.pid}.tmp`, peaksPath);
      return envelope;
    })().finally(() => peakJobs.delete(peaksPath));
    peakJobs.set(peaksPath, job);
  }
  const envelope = await peakJobs.get(peaksPath);
  const svg = renderEnvelopeSvg(envelope, width);
  // Atomic writes ensure a renderer never observes a half-written vector image.
  const temporary = `${svgPath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(temporary, svg);
  await rename(temporary, svgPath);
  return { path: svgPath, kind: 'waveform', durationSec, widthPx: width, channels: info.channels };
}
