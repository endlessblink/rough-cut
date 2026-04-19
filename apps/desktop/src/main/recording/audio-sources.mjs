// @ts-check
import { execFile } from 'node:child_process';

/**
 * @typedef {Object} AudioSources
 * @property {string | null} monitorSource — PulseAudio monitor source name (system audio)
 * @property {string | null} micSource     — PulseAudio input source name (microphone)
 * @property {Array<{id: string, label: string}>} systemAudioSources
 */

function normalizeSourceLabel(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\.monitor$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

function parsePactlSourceBlocks(output) {
  const blocks = output.split(/\n(?=Source #)/).filter(Boolean);
  return blocks
    .map((block) => {
      const name = block.match(/^\s*Name:\s*(.+)$/m)?.[1]?.trim() ?? null;
      const description = block.match(/^\s*Description:\s*(.+)$/m)?.[1]?.trim() ?? null;
      if (!name) return null;
      return {
        name,
        description,
        isMonitor: name.includes('.monitor'),
      };
    })
    .filter(Boolean);
}

function resolvePreferredMicSource(micSourceDetails, preferredMicSourceId, preferredMicLabel) {
  if (!Array.isArray(micSourceDetails) || micSourceDetails.length === 0) return null;

  if (preferredMicSourceId) {
    const exactSource = micSourceDetails.find((source) => source.name === preferredMicSourceId);
    if (exactSource) return exactSource.name;
  }

  const normalizedPreferredLabel = normalizeSourceLabel(preferredMicLabel);
  if (!normalizedPreferredLabel) return null;

  const exactLabelMatch = micSourceDetails.find((source) => {
    return [source.description, source.name].some(
      (candidate) => normalizeSourceLabel(candidate) === normalizedPreferredLabel,
    );
  });
  if (exactLabelMatch) return exactLabelMatch.name;

  const partialLabelMatch = micSourceDetails.find((source) => {
    return [source.description, source.name].some((candidate) => {
      const normalizedCandidate = normalizeSourceLabel(candidate);
      return (
        normalizedCandidate.includes(normalizedPreferredLabel) ||
        normalizedPreferredLabel.includes(normalizedCandidate)
      );
    });
  });
  return partialLabelMatch?.name ?? null;
}

function toMonitorSourceName(sinkName) {
  return sinkName ? `${sinkName}.monitor` : null;
}

function resolveDefaultMonitorSource(monitorSources, defaultSinkName) {
  const defaultMonitorSource = toMonitorSourceName(defaultSinkName);
  if (!defaultMonitorSource) return null;
  return monitorSources.includes(defaultMonitorSource) ? defaultMonitorSource : null;
}

function resolveDefaultMicSource(micSources, defaultSourceName) {
  if (!defaultSourceName) return null;
  return micSources.includes(defaultSourceName) ? defaultSourceName : null;
}

export function resolveAudioSourceSelection({
  monitorSources,
  micSources,
  micSourceDetails,
  defaultSinkName,
  defaultSourceName,
  preferredSystemAudioSourceId = null,
  preferredMicSourceId = null,
  preferredMicLabel = null,
  strictMicSelection = false,
  strictSystemSelection = false,
}) {
  const defaultMonitorSource = resolveDefaultMonitorSource(monitorSources, defaultSinkName);
  const defaultMicSource = resolveDefaultMicSource(micSources, defaultSourceName);
  const preferredMonitorSource =
    preferredSystemAudioSourceId && monitorSources.includes(preferredSystemAudioSourceId)
      ? preferredSystemAudioSourceId
      : null;
  const monitorSource = strictSystemSelection
    ? preferredMonitorSource
    : preferredMonitorSource ?? defaultMonitorSource ?? monitorSources[0] ?? null;
  const preferredMicSource = resolvePreferredMicSource(
    micSourceDetails,
    preferredMicSourceId,
    preferredMicLabel,
  );
  const micSource = strictMicSelection
    ? preferredMicSource
    : preferredMicSource ?? defaultMicSource ?? micSources[0] ?? null;
  const systemAudioSources = monitorSources.map((name) => ({
    id: name,
    label: toAudioSourceLabel(name),
  }));

  return {
    monitorSource,
    micSource,
    systemAudioSources,
    defaultMonitorSource,
    defaultMicSource,
  };
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
 * @param {{
 *   preferredSystemAudioSourceId?: string | null,
 *   preferredMicSourceId?: string | null,
 *   preferredMicLabel?: string | null,
 *   strictMicSelection?: boolean,
 * }} [options]
 * @returns {Promise<AudioSources>}
 */
export async function discoverAudioSources(options = {}) {
  const {
    preferredSystemAudioSourceId = null,
    preferredMicSourceId = null,
    preferredMicLabel = null,
    strictMicSelection = false,
    strictSystemSelection = false,
  } = options;

  try {
    const [output, sourceDetailsOutput, defaultSinkName, defaultSourceName] = await Promise.all([
      runPactlShort(),
      runPactlSourceDetails(),
      runPactlDefaultSink().catch(() => null),
      runPactlDefaultSource().catch(() => null),
    ]);
    const { monitorSources, micSources } = parsePactlSources(output);
    const micSourceDetails = parsePactlSourceBlocks(sourceDetailsOutput).filter(
      (source) => !source.isMonitor,
    );
    const selection = resolveAudioSourceSelection({
      monitorSources,
      micSources,
      micSourceDetails,
      defaultSinkName,
      defaultSourceName,
      preferredSystemAudioSourceId,
      preferredMicSourceId,
      preferredMicLabel,
      strictMicSelection,
      strictSystemSelection,
    });

    console.info('[audio-sources] Discovered:', {
      monitorSource: selection.monitorSource,
      defaultSinkName,
      defaultMonitorSource: selection.defaultMonitorSource,
      defaultSourceName,
      preferredMicSourceId,
      preferredMicLabel,
      micSource: selection.micSource,
      systemAudioSources: selection.systemAudioSources,
    });
    return {
      monitorSource: selection.monitorSource,
      micSource: selection.micSource,
      systemAudioSources: selection.systemAudioSources,
    };
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

function runPactlSourceDetails() {
  return new Promise((resolve, reject) => {
    execFile(
      'pactl',
      ['list', 'sources'],
      { timeout: 5000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      },
    );
  });
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

/**
 * Run `pactl get-default-source` and return the source name.
 * @returns {Promise<string>}
 */
function runPactlDefaultSource() {
  return new Promise((resolve, reject) => {
    execFile('pactl', ['get-default-source'], { timeout: 5000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}
