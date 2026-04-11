// @ts-check
import { execFile } from 'node:child_process';

/**
 * @typedef {Object} AudioSources
 * @property {string | null} monitorSource — PulseAudio monitor source name (system audio)
 * @property {string | null} micSource     — PulseAudio input source name (microphone)
 */

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
 * @returns {Promise<AudioSources>}
 */
export async function discoverAudioSources() {
  try {
    const output = await runPactlShort();
    const lines = output.trim().split('\n').filter(Boolean);

    let monitorSource = null;
    let micSource = null;

    for (const line of lines) {
      // Format: ID\tNAME\tDRIVER\tSAMPLE_SPEC\tSTATE
      const parts = line.split('\t');
      const name = parts[1];
      if (!name) continue;

      if (name.includes('.monitor')) {
        if (!monitorSource) monitorSource = name;
      } else if (name.startsWith('alsa_input.')) {
        if (!micSource) micSource = name;
      }
    }

    console.info('[audio-sources] Discovered:', { monitorSource, micSource });
    return { monitorSource, micSource };
  } catch (err) {
    console.warn('[audio-sources] Discovery failed (recording will be video-only):', err?.message ?? err);
    return { monitorSource: null, micSource: null };
  }
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
