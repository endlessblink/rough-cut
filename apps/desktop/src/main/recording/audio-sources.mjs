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
    const output = await runPactlShort();
    const { monitorSources, micSources } = parsePactlSources(output);
    const monitorSource =
      (preferredSystemAudioSourceId && monitorSources.includes(preferredSystemAudioSourceId)
        ? preferredSystemAudioSourceId
        : null) ??
      monitorSources[0] ??
      null;
    const micSource = micSources[0] ?? null;
    const systemAudioSources = monitorSources.map((name) => ({
      id: name,
      label: toAudioSourceLabel(name),
    }));

    console.info('[audio-sources] Discovered:', { monitorSource, micSource, systemAudioSources });
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
