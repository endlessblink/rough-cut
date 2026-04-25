/**
 * Click sound effect playback for mouse-click preview.
 *
 * Wraps the pure-PCM synthesizer in `@rough-cut/export-renderer/click-sound-synth`
 * for the renderer's Web Audio playback path. The same waveform is used by
 * the export pipeline so users hear identical click character in preview
 * and rendered output.
 *
 * Usage:
 *   const ctx = getClickAudioContext();
 *   const buf = await getClickAudioBuffer();
 *   playClickSound(); // shortcut: schedules immediate playback
 */
import { synthesizeClickPcm } from '@rough-cut/export-renderer/click-sound-synth';

let audioContext: AudioContext | null = null;
let bufferPromise: Promise<AudioBuffer> | null = null;

/**
 * Lazily create a shared AudioContext for click playback.
 * Returns null in non-browser environments (e.g. Vitest jsdom without WebAudio).
 */
export function getClickAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  const Ctor =
    typeof window !== 'undefined'
      ? (window as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
        null
      : null;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

/**
 * Synthesize the click waveform into an AudioBuffer at the context's sample rate.
 */
export function synthesizeClickBuffer(ctx: AudioContext): AudioBuffer {
  const pcm = synthesizeClickPcm(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buffer.getChannelData(0).set(pcm);
  return buffer;
}

/** Get (and cache) the pre-synthesized click AudioBuffer. */
export function getClickAudioBuffer(): Promise<AudioBuffer> | null {
  const ctx = getClickAudioContext();
  if (!ctx) return null;
  if (!bufferPromise) {
    bufferPromise = Promise.resolve(synthesizeClickBuffer(ctx));
  }
  return bufferPromise;
}

/**
 * Schedule one click sound for immediate playback. No-op if the audio
 * subsystem is unavailable (e.g. test environment) or the context is
 * suspended without a user gesture.
 */
export function playClickSound(): void {
  const ctx = getClickAudioContext();
  if (!ctx) return;
  const promise = getClickAudioBuffer();
  if (!promise) return;
  promise
    .then((buffer) => {
      if (ctx.state === 'suspended') {
        // Resume best-effort; first user gesture will normally have already
        // unlocked it. Failure here is fine — we just won't hear this click.
        ctx.resume().catch(() => undefined);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
    })
    .catch(() => undefined);
}

/**
 * Test-only helper that resets module state. NOT for production use.
 * @internal
 */
export function __resetClickSoundForTests(): void {
  audioContext = null;
  bufferPromise = null;
}
