export const VOICE_CLEAN_LOCK_SEC: number;
export const VOICE_CLEAN_RESYNC_SEC: number;
export const VOICE_CLEAN_TICK_MS: number;

export type VoiceCleanMix = { video: number; dry: number; wet: number };

export function clampVoiceCleanAmount(value: unknown): number;
export function voiceCleanMix(input: { slotGain: number; amount: number; locked: boolean }): VoiceCleanMix;

export type VoiceCleanSyncPlan = {
  seekTo: number | null;
  play: boolean;
  pause: boolean;
  locked: boolean;
  drift: number;
};

export function planVoiceCleanSync(input: {
  videoTime: number;
  videoPaused: boolean;
  audioTime: number;
  audioPaused: boolean;
  audioSeeking: boolean;
  audioReadyState: number;
  locked: boolean;
  seekLead?: number;
}): VoiceCleanSyncPlan;

export type VoiceCleanMixerEvent = { type: 'resync' | 'locked' | 'unlocked'; drift: number; playing?: boolean };

export type VoiceCleanMixer = {
  attach(video: HTMLVideoElement, slotGain?: number): void;
  has(video: HTMLVideoElement): boolean;
  setSlotGain(video: HTMLVideoElement, value: number): boolean;
  slotGain(video: HTMLVideoElement): number | null;
  setAmount(value: number): void;
  amount(): number;
  tick(): void;
  state(): Array<{ locked: boolean; drift: number; applied: VoiceCleanMix; seekLead: number }>;
  dispose(): void;
};

export function createVoiceCleanMixer(options: {
  context: BaseAudioContext;
  url: string;
  amount?: number;
  applyVideoGain: (video: HTMLVideoElement, gain: number) => void;
  createAudio?: () => HTMLAudioElement;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  onEvent?: (event: VoiceCleanMixerEvent) => void;
}): VoiceCleanMixer;
