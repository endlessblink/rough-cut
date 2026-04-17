// @ts-check
import { execFile } from 'node:child_process';

/**
 * @typedef {Object} AudioSources
 * @property {string | null} monitorSource — PulseAudio monitor source name (system audio)
 * @property {string | null} micSource     — PulseAudio input source name (microphone)
 * @property {Array<{id: string, label: string}>} systemAudioSources
 */

function toAudioSourceLabel(name) {
  return name.replace(/\.monitor$/, '').replace(/[_\.]+/g, ' ');
}

function parsePactlSources(output) {
  const lines = output.trim().split('\n').filter(Boolean);
  const monitorSources = [];
  const micSources = [];

  for (const line of lines) {
    const parts = line.split('\t');
    const name = parts[1];
    if (!name) continue;

    if (name.includes('.monitor')) {
      monitorSources.push(name);
      continue;
    }
    if (name.startsWith('alsa_input.')) {
      micSources.push(name);
    }
  }

  return { monitorSources, micSources };
}

function toMonitorSourceName(sinkName) {
  return sinkName ? `${sinkName}.monitor` : null;
}

function resolveDefaultMonitorSource(monitorSources, defaultSinkName) {
  const defaultMonitorSource = toMonitorSourceName(defaultSinkName);
  if (!defaultMonitorSource) return null;
  return monitorSources.includes(defaultMonitorSource) ? defaultMonitorSource : null;
}

/**
 * Discover available PulseAudio/PipeWire audio sources using `pactl`.
 *
 * Uses `pactl list short sources` which outputs tab-separated lines:
 *   ID\tNAME\tDRIVER\tSAMPLE_SPEC\tSTATE
 *
 * - monitorSource: name containing `.monitor` (captures system output)
 * - micSource: name starting with `alsa_input.` (microphone/line-in)
 *
 * Returns nulls on failure (no PulseAudio, pactl not found, etc.).
 * Callers must treat null as "skip audio" — never let this break recording.
 *
 * @param {string | null} [preferredSystemAudioSourceId]
 * @returns {Promise<AudioSources>}
 */
export async function discoverAudioSources(preferredSystemAudioSourceId = null) {
  try {
    const [output, defaultSinkName] = await Promise.all([
      runPactlShort(),
      runPactlDefaultSink().catch(() => null),
    ]);
    const { monitorSources, micSources } = parsePactlSources(output);
    const defaultMonitorSource = resolveDefaultMonitorSource(monitorSources, defaultSinkName);
    const monitorSource =
      (preferredSystemAudioSourceId && monitorSources.includes(preferredSystemAudioSourceId)
        ? preferredSystemAudioSourceId
        : null) ??
      defaultMonitorSource ??
      monitorSources[0] ??
      null;
    const micSource = micSources[0] ?? null;
    const systemAudioSources = monitorSources.map((name) => ({
      id: name,
      label: toAudioSourceLabel(name),
    }));

    console.info('[audio-sources] Discovered:', {
      monitorSource,
      defaultSinkName,
      defaultMonitorSource,
      micSource,
      systemAudioSources,
    });
    return { monitorSource, micSource, systemAudioSources };
  } catch (err) {
    console.warn(
      '[audio-sources] Discovery failed (recording will be video-only):',
      err?.message ?? err,
    );
    return { monitorSource: null, micSource: null, systemAudioSources: [] };
  }
}

export async function listSystemAudioSources() {
  const { systemAudioSources } = await discoverAudioSources();
  return systemAudioSources;
}

/**
 * Ensure the given PulseAudio source is audible before capture.
 *
 * Monitor sources carry their own volume slider, independent of the sink
 * they observe. Users sometimes end up with it stuck near 0 (e.g. 8%),
 * in which case FFmpeg captures a file that's technically opus-encoded
 * but inaudible. Probe the volume and bump it to 100% when it's below
 * a usable threshold.
 *
 * @param {string | null} sourceName
 * @returns {Promise<{ previousPercent: number | null, raised: boolean }>}
 */
export async function ensureSourceAudible(sourceName) {
  if (!sourceName) return { previousPercent: null, raised: false };

  try {
    const info = await runPactlSourceInfo(sourceName);
    const percent = parseSourceVolumePercent(info);
    if (percent === null) {
      return { previousPercent: null, raised: false };
    }
    if (percent >= 50) {
      return { previousPercent: percent, raised: false };
    }
    await runPactlSetSourceVolume(sourceName, '100%');
    console.info(
      '[audio-sources] Raised monitor volume from',
      `${percent}%`,
      'to 100% for',
      sourceName,
    );
    return { previousPercent: percent, raised: true };
  } catch (err) {
    console.warn(
      '[audio-sources] Failed to probe/raise monitor volume:',
      err?.message ?? err,
    );
    return { previousPercent: null, raised: false };
  }
}

function parseSourceVolumePercent(info) {
  const match = info.match(/Volume:[^\n]*?(\d+)%/);
  return match ? parseInt(match[1], 10) : null;
}

function runPactlSourceInfo(sourceName) {
  return new Promise((resolve, reject) => {
    execFile(
      'pactl',
      ['list', 'sources'],
      { timeout: 5000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        // Pick the block that matches this source name
        const blocks = stdout.split(/\n(?=Source #)/);
        const target = blocks.find((b) => b.includes(`Name: ${sourceName}`));
        if (!target) return reject(new Error(`source not found: ${sourceName}`));
        resolve(target);
      },
    );
  });
}

function runPactlSetSourceVolume(sourceName, volume) {
  return new Promise((resolve, reject) => {
    execFile(
      'pactl',
      ['set-source-volume', sourceName, volume],
      { timeout: 5000 },
      (err) => {
        if (err) return reject(err);
        resolve();
      },
    );
  });
}

/**
 * Run `pactl list short sources` and return stdout.
 * @returns {Promise<string>}
 */
function runPactlShort() {
  return new Promise((resolve, reject) => {
    execFile('pactl', ['list', 'short', 'sources'], { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

/**
 * Run `pactl get-default-sink` and return the sink name.
 * @returns {Promise<string>}
 */
function runPactlDefaultSink() {
  return new Promise((resolve, reject) => {
    execFile('pactl', ['get-default-sink'], { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}
