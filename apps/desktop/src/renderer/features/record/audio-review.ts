export interface AudioMeterSnapshot {
  level: number;
  peak: number;
}

export interface AudioMeterAssessment {
  severity: 'idle' | 'healthy' | 'warning' | 'clipping';
  label: string;
  detail: string | null;
}

export interface PreviewDuckingState {
  available: boolean;
  active: boolean;
  duckedPercent: number;
  attenuationPercent: number;
  label: string;
}

interface RecordingAudioCaptureLike {
  requested?: {
    micEnabled?: boolean;
    sysAudioEnabled?: boolean;
  };
  resolved?: {
    micSource?: string | null;
    systemAudioSource?: string | null;
  };
  final?: {
    hasAudio?: boolean;
  };
}

export interface AudioReviewTrack {
  id: 'microphone' | 'system';
  label: string;
  detail: string;
  captured: boolean;
}

export interface RecordingAudioReview {
  tracks: AudioReviewTrack[];
  mixedReview: boolean;
  summary: string | null;
}

export function assessAudioMeter(snapshot: AudioMeterSnapshot): AudioMeterAssessment {
  if (snapshot.level < 0.02 && snapshot.peak < 0.08) {
    return { severity: 'idle', label: 'Silent', detail: null };
  }

  if (snapshot.peak >= 0.98 || snapshot.level >= 0.82) {
    return {
      severity: 'clipping',
      label: 'Clipping likely',
      detail: 'Lower mic gain before recording to avoid harsh, distorted narration.',
    };
  }

  if (snapshot.peak >= 0.92 || snapshot.level >= 0.64) {
    return {
      severity: 'warning',
      label: 'Mic is peaking',
      detail: 'Input is hot. Reduce gain a little for more headroom.',
    };
  }

  return { severity: 'healthy', label: 'Healthy', detail: null };
}

export function getPreviewDuckingState(input: {
  micEnabled: boolean;
  sysAudioEnabled: boolean;
  systemAudioGainPercent: number;
  meter: AudioMeterSnapshot;
}): PreviewDuckingState {
  const { micEnabled, sysAudioEnabled, systemAudioGainPercent, meter } = input;
  const normalizedGain = Math.max(0, Math.min(100, Math.round(systemAudioGainPercent)));
  if (!micEnabled || !sysAudioEnabled || normalizedGain <= 0) {
    return {
      available: false,
      active: false,
      duckedPercent: normalizedGain,
      attenuationPercent: 0,
      label: 'Preview ducking unavailable',
    };
  }

  const duckFactor = meter.level >= 0.64 ? 0.45 : meter.level >= 0.24 ? 0.6 : 0.72;
  const duckedPercent = Math.max(0, Math.round(normalizedGain * duckFactor));
  const attenuationPercent = Math.max(0, normalizedGain - duckedPercent);
  const active = meter.level >= 0.12;
  return {
    available: true,
    active,
    duckedPercent,
    attenuationPercent,
    label: active
      ? `Preview ducking active: desktop audio ${normalizedGain}% -> ${duckedPercent}% while you speak`
      : `Preview ducking ready: desktop audio can dip to ${duckedPercent}% while narration is present`,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getRecordingAudioReview(
  audioCapture: unknown,
  hasAudio: boolean,
): RecordingAudioReview {
  const safe = isObject(audioCapture) ? (audioCapture as RecordingAudioCaptureLike) : null;
  const requestedMic = safe?.requested?.micEnabled === true;
  const requestedSystem = safe?.requested?.sysAudioEnabled === true;
  const resolvedMic =
    typeof safe?.resolved?.micSource === 'string' && safe.resolved.micSource.trim().length > 0;
  const resolvedSystem =
    typeof safe?.resolved?.systemAudioSource === 'string' &&
    safe.resolved.systemAudioSource.trim().length > 0;
  const finalHasAudio = safe?.final?.hasAudio ?? hasAudio;

  const tracks: AudioReviewTrack[] = [];
  if (requestedMic || resolvedMic) {
    tracks.push({
      id: 'microphone',
      label: 'Microphone',
      detail: resolvedMic ? 'Narration route resolved' : 'Requested but unavailable in the saved take',
      captured: resolvedMic && finalHasAudio,
    });
  }
  if (requestedSystem || resolvedSystem) {
    tracks.push({
      id: 'system',
      label: 'System Audio',
      detail: resolvedSystem ? 'Desktop audio route resolved' : 'Requested but unavailable in the saved take',
      captured: resolvedSystem && finalHasAudio,
    });
  }

  if (tracks.length === 0) {
    return {
      tracks: [],
      mixedReview: false,
      summary: finalHasAudio ? 'This saved take contains audio.' : 'This saved take is silent.',
    };
  }

  const capturedCount = tracks.filter((track) => track.captured).length;
  const mixedReview = capturedCount > 1 && finalHasAudio;
  return {
    tracks,
    mixedReview,
    summary: mixedReview
      ? 'Record review keeps the saved take as one mixed stream while showing which sources were captured.'
      : finalHasAudio
        ? 'Record review shows the captured audio source for this take.'
        : 'Audio routing metadata exists, but the saved take ended up silent.',
  };
}
