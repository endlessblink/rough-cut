import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_CLEAN_RESYNC_SEC,
  clampVoiceCleanAmount,
  createVoiceCleanMixer,
  planVoiceCleanSync,
  voiceCleanMix,
} from './voice-clean-mix.mjs';

test('amount clamps to 0..1 and junk means off', () => {
  assert.equal(clampVoiceCleanAmount(-1), 0);
  assert.equal(clampVoiceCleanAmount(2), 1);
  assert.equal(clampVoiceCleanAmount('0.25'), 0.25);
  assert.equal(clampVoiceCleanAmount(undefined), 0);
  assert.equal(clampVoiceCleanAmount(Number.NaN), 0);
});

test('mix: amount 0 or not locked keeps the video sound exactly', () => {
  assert.deepEqual(voiceCleanMix({ slotGain: 0.8, amount: 0, locked: true }), { video: 0.8, dry: 0, wet: 0 });
  assert.deepEqual(voiceCleanMix({ slotGain: 0.8, amount: 0.7, locked: false }), { video: 0.8, dry: 0, wet: 0 });
});

test('mix: locked is a linear dry/wet crossfade scaled by the slot gain (fades and cuts)', () => {
  assert.deepEqual(voiceCleanMix({ slotGain: 1, amount: 1, locked: true }), { video: 0, dry: 0, wet: 1 });
  assert.deepEqual(voiceCleanMix({ slotGain: 1, amount: 0.25, locked: true }), { video: 0, dry: 0.75, wet: 0.25 });
  assert.deepEqual(voiceCleanMix({ slotGain: 0, amount: 0.5, locked: true }), { video: 0, dry: 0, wet: 0 });
  const half = voiceCleanMix({ slotGain: 0.6, amount: 0.5, locked: true });
  assert.ok(Math.abs(half.dry + half.wet - 0.6) < 1e-12, 'dry + wet = slot gain at every amount');
});

const base = { audioSeeking: false, audioReadyState: 4, locked: false, seekLead: 0 };

test('sync: paused video parks the audio exactly on its time and counts as locked', () => {
  const plan = planVoiceCleanSync({ ...base, videoTime: 10, videoPaused: true, audioTime: 3, audioPaused: false });
  assert.equal(plan.pause, true);
  assert.equal(plan.seekTo, 10);
  assert.equal(plan.locked, false, 'not locked until the seek lands');
  const parked = planVoiceCleanSync({ ...base, videoTime: 10, videoPaused: true, audioTime: 10, audioPaused: true });
  assert.equal(parked.seekTo, null);
  assert.equal(parked.locked, true);
});

test('sync: small drift while playing is left alone; big drift resyncs with lead and unlocks', () => {
  const small = planVoiceCleanSync({ ...base, locked: true, videoTime: 5, videoPaused: false, audioTime: 5.03, audioPaused: false });
  assert.equal(small.seekTo, null);
  assert.equal(small.locked, true);
  const big = planVoiceCleanSync({ ...base, locked: true, videoTime: 5, videoPaused: false, audioTime: 5 + VOICE_CLEAN_RESYNC_SEC + 0.01, audioPaused: false, seekLead: 0.03 });
  assert.equal(big.seekTo, 5.03);
  assert.equal(big.locked, false);
});

test('sync: playing video starts a paused audio element; locks only once it is close and buffered', () => {
  const start = planVoiceCleanSync({ ...base, videoTime: 1, videoPaused: false, audioTime: 1, audioPaused: true });
  assert.equal(start.play, true);
  assert.equal(start.locked, false);
  const buffering = planVoiceCleanSync({ ...base, audioReadyState: 2, videoTime: 1, videoPaused: false, audioTime: 1.01, audioPaused: false });
  assert.equal(buffering.locked, false);
  const seeking = planVoiceCleanSync({ ...base, locked: true, audioSeeking: true, videoTime: 1, videoPaused: false, audioTime: 0, audioPaused: false });
  assert.equal(seeking.locked, false);
  assert.equal(seeking.seekTo, null, 'no new seek while one is in flight');
});

class FakeTarget {
  constructor() { this.handlers = new Map(); }
  addEventListener(type, fn) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]); }
  removeEventListener(type, fn) { this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== fn)); }
  emit(type) { for (const fn of this.handlers.get(type) ?? []) fn(); }
  listenerCount() { return [...this.handlers.values()].reduce((n, list) => n + list.length, 0); }
}

function fakeGain() {
  return {
    gain: { value: 1, target: null, setTargetAtTime(value) { this.target = value; } },
    connect() {},
    disconnect() { this.disconnected = true; },
  };
}

function fakeContext() {
  const gains = [];
  return {
    currentTime: 0,
    destination: {},
    gains,
    createMediaElementSource: () => ({ connect() {}, disconnect() {} }),
    createChannelSplitter: () => ({ connections: [], connect(node, output) { this.connections.push(output); }, disconnect() {} }),
    createGain() { const gain = fakeGain(); gains.push(gain); return gain; },
  };
}

function fakeVideo(time = 0) {
  const video = new FakeTarget();
  Object.assign(video, { currentTime: time, paused: true, playbackRate: 1 });
  return video;
}

function fakeAudio() {
  const audio = new FakeTarget();
  Object.assign(audio, {
    currentTime: 0, paused: true, seeking: false, readyState: 4, playbackRate: 1, src: '', plays: 0,
    play() { this.paused = false; this.plays += 1; return Promise.resolve(); },
    pause() { this.paused = true; },
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {},
  });
  return audio;
}

function harness(amount = 1) {
  const context = fakeContext();
  const videoGains = new Map();
  const audios = [];
  const mixer = createVoiceCleanMixer({
    context,
    url: 'media://file/take.voice-clean.wav',
    amount,
    applyVideoGain: (video, gain) => videoGains.set(video, gain),
    createAudio: () => { const audio = fakeAudio(); audios.push(audio); return audio; },
    setTimer: () => 1,
    clearTimer: () => undefined,
  });
  return { context, videoGains, audios, mixer };
}

test('mixer: wires channel 0 to the original gain and channel 1 to the cleaned gain', () => {
  const { context, mixer, audios } = harness();
  mixer.attach(fakeVideo(), 1);
  assert.equal(audios[0].src, 'media://file/take.voice-clean.wav');
  assert.equal(audios[0].crossOrigin, 'anonymous');
  assert.equal(context.gains.length, 2);
});

test('mixer: sound stays on the video until the clean player locks, then moves over', () => {
  const { context, mixer, audios, videoGains } = harness(1);
  const video = fakeVideo(4);
  mixer.attach(video, 1);
  const [dry, wet] = context.gains;
  // Paused at 4 s: the player is parked on 4 s first.
  assert.equal(audios[0].currentTime, 4);
  mixer.tick();
  assert.equal(mixer.state()[0].locked, true);
  assert.equal(videoGains.get(video), 0);
  assert.equal(wet.gain.target, 1);
  assert.equal(dry.gain.target, 0);
  // A seek unlocks: the plain recording carries the sound meanwhile.
  video.emit('seeking');
  assert.equal(videoGains.get(video), 1);
  assert.equal(wet.gain.target, 0);
});

test('mixer: Amount only moves gains, never reloads or re-seeks the player', () => {
  const { context, mixer, audios } = harness(1);
  const video = fakeVideo(2);
  mixer.attach(video, 0.5);
  mixer.tick();
  const audio = audios[0];
  const timeBefore = audio.currentTime;
  mixer.setAmount(0.25);
  const [dry, wet] = context.gains;
  assert.equal(dry.gain.target, 0.375);
  assert.equal(wet.gain.target, 0.125);
  assert.equal(audios.length, 1);
  assert.equal(audio.currentTime, timeBefore);
  assert.equal(audio.src, 'media://file/take.voice-clean.wav');
});

test('mixer: follows the video: play starts it, pause stops it, rate follows', () => {
  const { mixer, audios } = harness(1);
  const video = fakeVideo(0);
  mixer.attach(video, 1);
  video.paused = false;
  video.playbackRate = 1.5;
  video.emit('play');
  assert.equal(audios[0].paused, false);
  assert.equal(audios[0].playbackRate, 1.5);
  video.paused = true;
  video.emit('pause');
  assert.equal(audios[0].paused, true);
});

test('mixer: a slot gain of 0 (standby decoder) is silent on every path', () => {
  const { context, mixer, videoGains } = harness(0.5);
  const standby = fakeVideo(9);
  mixer.attach(standby, 0);
  mixer.tick();
  const [dry, wet] = context.gains;
  assert.equal(videoGains.get(standby), 0);
  assert.equal(dry.gain.target, 0);
  assert.equal(wet.gain.target, 0);
  mixer.setSlotGain(standby, 1);
  assert.equal(dry.gain.target, 0.5);
  assert.equal(wet.gain.target, 0.5);
});

test('mixer: dispose hands the plain sound back and removes every listener', () => {
  const { mixer, videoGains, audios } = harness(1);
  const video = fakeVideo(1);
  mixer.attach(video, 0.7);
  mixer.tick();
  assert.equal(videoGains.get(video), 0);
  mixer.dispose();
  assert.equal(videoGains.get(video), 0.7);
  assert.equal(video.listenerCount(), 0);
  assert.equal(audios[0].paused, true);
  assert.equal(audios[0].src, '');
  assert.equal(mixer.setSlotGain(video, 1), false);
});
