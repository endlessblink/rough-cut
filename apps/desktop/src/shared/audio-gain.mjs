// Shared numbers for track and clip volume, used by the preview (Web Audio
// gain nodes) and the export (ffmpeg `volume` per timeline section) so the two
// play the same level. Pure: no DOM, no ffmpeg, no project document.

/** Peaks above this (about -1 dBFS) are limited when sound is boosted past 100%. */
export const BOOST_LIMIT = 0.89;

/** Track 200% x clip 200%: the loudest gain any section can get. */
export const MAX_COMBINED_GAIN = 4;

/** ffmpeg limiter for boosted exports: no auto make-up gain, delay compensated (sound stays in sync). */
export const EXPORT_BOOST_LIMITER = `alimiter=limit=${BOOST_LIMIT}:level=false:latency=true`;

export function clampGain(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(MAX_COMBINED_GAIN, number));
}

/** Clip gain x track gain, clamped. */
export function combineGains(...gains) {
  return clampGain(gains.reduce((product, gain) => product * clampGain(gain), 1));
}

/** Linear gain to decibels (-Infinity for silence). 2 -> +6.02 dB, 0.5 -> -6.02 dB. */
export function gainToDb(gain) {
  const value = Number(gain);
  if (!(value > 0)) return -Infinity;
  return 20 * Math.log10(value);
}

export function dbToGain(db) {
  return 10 ** (Number(db) / 20);
}

/** "100%", "50%", "Muted": what the UI and timeline badge show. */
export function formatVolume({ volume = 1, muted = false } = {}) {
  if (muted) return 'Muted';
  return `${Math.round(clampGain(volume) * 100)}%`;
}

/** The ffmpeg filter for one section's gain, or '' when it plays as recorded. */
export function exportGainFilter(gain) {
  const value = clampGain(gain);
  if (value === 1) return '';
  return `volume=${String(Math.round(value * 10_000) / 10_000)}`;
}

/** True when any gain is a boost, so peaks must be limited to keep them from clipping. */
export function needsBoostLimiter(gains) {
  return (Array.isArray(gains) ? gains : [gains]).some((gain) => clampGain(gain) > 1);
}

/**
 * Curve for the preview's boost limiter (a WaveShaperNode fed through a
 * 1/MAX_COMBINED_GAIN pre-gain). Exactly linear below BOOST_LIMIT, so normal
 * levels pass untouched; above it peaks bend smoothly toward full scale
 * instead of clipping hard. Point k stands for the input level
 * MAX_COMBINED_GAIN * (2k / (length - 1) - 1).
 */
export function boostLimiterCurve(length = 65537) {
  const size = Math.max(3, Math.floor(length) | 1);
  const curve = new Float32Array(size);
  const knee = 1 - BOOST_LIMIT;
  for (let index = 0; index < size; index += 1) {
    const input = MAX_COMBINED_GAIN * ((2 * index) / (size - 1) - 1);
    const magnitude = Math.abs(input);
    const shaped = magnitude <= BOOST_LIMIT ? magnitude : BOOST_LIMIT + knee * Math.tanh((magnitude - BOOST_LIMIT) / knee);
    curve[index] = Math.sign(input) * shaped;
  }
  return curve;
}
