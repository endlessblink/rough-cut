// Pure helpers that pluck the NLE-relevant fields out of an opaque
// ProjectState. main.tsx owns the canonical ProjectState type; this module
// only relies on duck-typed access via the NleProject shape in types.ts.

import { canonicalizeProjectDocument, computeTimelineDuration } from '@rough-cut/project-model';

const DEFAULT_FPS = 30;
const DEFAULT_DURATION_FRAMES = 1;

export function resolveProjectFps(project) {
  const recordingFps = Number(project?.recording?.fps);
  if (Number.isFinite(recordingFps) && recordingFps > 0) return recordingFps;
  const settingsFps = Number(project?.document?.settings?.frameRate);
  if (Number.isFinite(settingsFps) && settingsFps > 0) return settingsFps;
  return DEFAULT_FPS;
}

export function resolveCompositionDurationFrames(project) {
  const document = project?.document;
  if (document) {
    const canonical = canonicalizeProjectDocument(document);
    const fromTimeline = computeTimelineDuration(canonical.timeline);
    const fromComposition = Number(canonical.composition?.duration);
    const duration = Math.max(
      Number.isFinite(fromTimeline) ? fromTimeline : 0,
      Number.isFinite(fromComposition) ? fromComposition : 0,
    );
    if (duration > 0) return Math.max(1, Math.round(duration));
  }

  const fromComposition = Number(project?.document?.composition?.duration);
  if (Number.isFinite(fromComposition) && fromComposition > 0) {
    return Math.max(1, Math.round(fromComposition));
  }
  const fromRecording = Number(project?.recording?.duration);
  if (Number.isFinite(fromRecording) && fromRecording > 0) {
    return Math.max(1, Math.round(fromRecording));
  }
  return DEFAULT_DURATION_FRAMES;
}

export function frameToSeconds(frame, fps) {
  const f = Number(frame);
  const r = Number(fps);
  if (!Number.isFinite(f) || !Number.isFinite(r) || r <= 0) return 0;
  return f / r;
}

export function secondsToFrame(seconds, fps) {
  const s = Number(seconds);
  const r = Number(fps);
  if (!Number.isFinite(s) || !Number.isFinite(r) || r <= 0) return 0;
  return Math.max(0, Math.round(s * r));
}

// SMPTE-ish display: mm:ss:ff. Frames are absolute (no drop-frame correction).
export function formatTimecode(frame, fps) {
  const r = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  const f = Math.max(0, Math.round(Number(frame) || 0));
  const totalSeconds = Math.floor(f / r);
  const ff = f % r;
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}
