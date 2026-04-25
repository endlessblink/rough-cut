/**
 * Click sound effect waveform synthesis (pure PCM, no Web Audio dependency).
 *
 * Generates a short, sharp "click" — filtered noise transient plus a damped
 * 1.7 kHz body — close to a mechanical mouse click in character. Both the
 * Record preview (playback) and the export pipeline (mixed into output
 * audio) consume this same synthesis so users hear the same sound in both.
 */

const CLICK_DURATION_SEC = 0.045;
const CLICK_BODY_HZ = 1700;
const CLICK_BODY_DECAY_TAU = 0.012; // seconds
const CLICK_NOISE_TAU = 0.006; // seconds — very fast noise transient
const CLICK_GAIN = 0.55;
const CLICK_ATTACK_SEC = 0.0005;

/**
 * Render the click waveform at the given sample rate, returning a single-
 * channel Float32Array. Deterministic (fixed RNG seed) so the export-side
 * waveform is reproducible. Length is `ceil(CLICK_DURATION_SEC * sampleRate)`.
 */
export function synthesizeClickPcm(sampleRate: number): Float32Array {
  if (sampleRate <= 0) return new Float32Array(0);
  const length = Math.ceil(CLICK_DURATION_SEC * sampleRate);
  const out = new Float32Array(length);

  // Deterministic xorshift32 — same noise every time the function runs.
  let rng = 0x9e3779b9;
  const nextNoise = (): number => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    // Map int32 to roughly [-1, 1].
    return ((rng >>> 0) / 0xffffffff) * 2 - 1;
  };

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const noise = nextNoise() * Math.exp(-t / CLICK_NOISE_TAU);
    const body = Math.sin(2 * Math.PI * CLICK_BODY_HZ * t) * Math.exp(-t / CLICK_BODY_DECAY_TAU);
    const attack = Math.min(1, t / CLICK_ATTACK_SEC);
    out[i] = (noise * 0.7 + body * 0.3) * attack * CLICK_GAIN;
  }

  return out;
}

/** Duration of the synthesized click in seconds. */
export const CLICK_SOUND_DURATION_SEC = CLICK_DURATION_SEC;
