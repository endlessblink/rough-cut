// Live "Clean voice" mix for the preview: one hidden <audio> per screen slot
// plays the cached voice file (channel 0 = original voice, channel 1 = cleaned
// voice) slaved to that slot's <video>. Amount is a gain change, never a reload.
//
// Gains (linear, chosen on purpose): the two channels are the same voice, so a
// linear crossfade keeps the voice level flat across the slider; an
// equal-power curve would lift the voice ~3 dB in the middle.
//   amount 0 or not locked yet -> the video's own sound, exactly as before
//   locked, amount a           -> video 0, original channel v*(1-a), cleaned v*a
// "Locked" means the audio element is playing within VOICE_CLEAN_LOCK_SEC of the
// video. Until then the video keeps carrying the sound, so a slow start or a
// resync is heard as the plain recording, never as a dropout.

export const VOICE_CLEAN_LOCK_SEC = 0.045;
export const VOICE_CLEAN_RESYNC_SEC = 0.06;
export const VOICE_CLEAN_TICK_MS = 50;
const GAIN_TIME_CONSTANT = 0.004;
const MAX_SEEK_LEAD_SEC = 0.25;

export function clampVoiceCleanAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

export function voiceCleanMix({ slotGain, amount, locked }) {
  const v = Number.isFinite(Number(slotGain)) ? Math.max(0, Number(slotGain)) : 0;
  const a = clampVoiceCleanAmount(amount);
  if (a <= 0 || !locked) return { video: v, dry: 0, wet: 0 };
  return { video: 0, dry: v * (1 - a), wet: v * a };
}

/**
 * What the slaved audio element should do now.
 * Paused video: park the audio exactly on the video time (a paused seek is
 * exact), so the next play starts aligned. Playing video: keep the audio
 * playing; hard-resync only past VOICE_CLEAN_RESYNC_SEC, leading the target by
 * the measured seek delay so the resync lands on time.
 */
export function planVoiceCleanSync({
  videoTime,
  videoPaused,
  audioTime,
  audioPaused,
  audioSeeking,
  audioReadyState,
  locked,
  seekLead = 0,
}) {
  const drift = audioTime - videoTime;
  const plan = { seekTo: null, play: false, pause: false, locked, drift };
  if (videoPaused) {
    if (!audioPaused) plan.pause = true;
    if (!audioSeeking && Math.abs(drift) > 0.002) plan.seekTo = videoTime;
    plan.locked = !audioSeeking && plan.seekTo === null && audioReadyState >= 2;
    return plan;
  }
  if (audioSeeking) {
    plan.locked = false;
    return plan;
  }
  if (Math.abs(drift) > VOICE_CLEAN_RESYNC_SEC) {
    plan.seekTo = videoTime + seekLead;
    plan.locked = false;
    if (audioPaused) plan.play = true;
    return plan;
  }
  if (audioPaused) {
    plan.play = true;
    plan.locked = false;
    return plan;
  }
  if (audioReadyState >= 3 && Math.abs(drift) < VOICE_CLEAN_LOCK_SEC) plan.locked = true;
  return plan;
}

/**
 * Builds and runs the per-slot clean-voice players.
 * applyVideoGain(video, gain) must set the video's own gain node (the preview's
 * existing setTargetAtTime path).
 */
export function createVoiceCleanMixer({
  context,
  destination = context.destination,
  url,
  amount = 0,
  applyVideoGain,
  createAudio = () => new Audio(),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
  onEvent = () => undefined,
}) {
  const slots = new Map();
  let currentAmount = clampVoiceCleanAmount(amount);
  let disposed = false;

  function setGain(node, value) {
    node.gain.setTargetAtTime(value, context.currentTime, GAIN_TIME_CONSTANT);
  }

  function apply(slot, force = false) {
    const mix = voiceCleanMix({ slotGain: slot.slotGain, amount: currentAmount, locked: slot.locked });
    if (force || mix.video !== slot.applied.video) applyVideoGain(slot.video, mix.video);
    if (force || mix.dry !== slot.applied.dry) setGain(slot.dry, mix.dry);
    if (force || mix.wet !== slot.applied.wet) setGain(slot.wet, mix.wet);
    slot.applied = mix;
  }

  function seekAudio(slot, time) {
    const target = Math.max(0, time);
    slot.audio.currentTime = target;
    // Only a resync during playback says anything about seek delay.
    slot.lastSeek = slot.video.paused ? null : { target };
  }

  function sync(slot) {
    const { audio, video } = slot;
    const plan = planVoiceCleanSync({
      videoTime: video.currentTime,
      videoPaused: video.paused,
      audioTime: audio.currentTime,
      audioPaused: audio.paused,
      audioSeeking: audio.seeking,
      audioReadyState: audio.readyState,
      locked: slot.locked,
      seekLead: slot.seekLead,
    });
    // Learn how late a playing resync lands, so the next one leads by that much.
    if (slot.lastSeek && !audio.seeking && !video.paused && !audio.paused) {
      slot.seekLead = Math.max(0, Math.min(MAX_SEEK_LEAD_SEC, slot.seekLead - plan.drift));
      slot.lastSeek = null;
    }
    if (plan.pause) audio.pause();
    if (plan.seekTo !== null) {
      seekAudio(slot, plan.seekTo);
      onEvent({ type: 'resync', drift: plan.drift, playing: !video.paused });
    }
    if (plan.play) void audio.play().catch(() => undefined);
    if (audio.playbackRate !== video.playbackRate) audio.playbackRate = video.playbackRate;
    if (plan.locked !== slot.locked) {
      slot.locked = plan.locked;
      onEvent({ type: plan.locked ? 'locked' : 'unlocked', drift: plan.drift });
      apply(slot);
    }
  }

  function attach(video, slotGain = 0) {
    if (disposed || !video || slots.has(video)) return;
    const audio = createAudio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.src = url;
    const source = context.createMediaElementSource(audio);
    const splitter = context.createChannelSplitter(2);
    const dry = context.createGain();
    const wet = context.createGain();
    dry.gain.value = 0;
    wet.gain.value = 0;
    source.connect(splitter);
    splitter.connect(dry, 0);
    splitter.connect(wet, 1);
    dry.connect(destination);
    wet.connect(destination);
    const slot = {
      video,
      audio,
      source,
      splitter,
      dry,
      wet,
      slotGain,
      locked: false,
      seekLead: 0,
      lastSeek: null,
      applied: { video: Number.NaN, dry: 0, wet: 0 },
      listeners: [],
    };
    const on = (target, type, handler) => {
      target.addEventListener(type, handler);
      slot.listeners.push(() => target.removeEventListener(type, handler));
    };
    const relock = () => sync(slot);
    on(video, 'play', relock);
    on(video, 'playing', relock);
    on(video, 'pause', relock);
    on(video, 'ended', relock);
    on(video, 'seeked', relock);
    on(video, 'ratechange', relock);
    on(video, 'seeking', () => {
      if (slot.locked) {
        slot.locked = false;
        apply(slot);
      }
    });
    on(audio, 'seeked', relock);
    on(audio, 'canplay', relock);
    slots.set(video, slot);
    apply(slot, true);
    sync(slot);
  }

  const timer = setTimer(() => {
    for (const slot of slots.values()) sync(slot);
  }, VOICE_CLEAN_TICK_MS);

  return {
    attach,
    has: (video) => slots.has(video),
    setSlotGain(video, value) {
      const slot = slots.get(video);
      if (!slot) return false;
      slot.slotGain = value;
      apply(slot);
      return true;
    },
    slotGain: (video) => slots.get(video)?.slotGain ?? null,
    setAmount(value) {
      currentAmount = clampVoiceCleanAmount(value);
      for (const slot of slots.values()) apply(slot);
    },
    amount: () => currentAmount,
    tick() {
      for (const slot of slots.values()) sync(slot);
    },
    state: () => [...slots.values()].map((slot) => ({
      locked: slot.locked,
      drift: slot.audio.currentTime - slot.video.currentTime,
      applied: { ...slot.applied },
      seekLead: slot.seekLead,
    })),
    /** Stops the players and hands every slot's plain gain back to the video. */
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimer(timer);
      for (const slot of slots.values()) {
        for (const remove of slot.listeners) remove();
        applyVideoGain(slot.video, slot.slotGain);
        slot.audio.pause();
        try {
          slot.source.disconnect();
          slot.splitter.disconnect();
          slot.dry.disconnect();
          slot.wet.disconnect();
        } catch {
          // Already disconnected when the context closed.
        }
        slot.audio.removeAttribute?.('src');
        slot.audio.load?.();
      }
      slots.clear();
    },
  };
}
