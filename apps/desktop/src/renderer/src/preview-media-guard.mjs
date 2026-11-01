// Safety net for "I pressed stop and the sound keeps playing" (Noam, 2026-11-01; only a restart cleared it).
// Remembers every media element that was started with play() in this window, including ones the
// preview no longer references (detached or from an earlier state), so stop can silence all of them.
const played = new Set();

export function installPlayTracker(proto = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : null) {
  if (!proto || proto.__roughCutPlayTracked) return false;
  const original = proto.play;
  proto.play = function trackedPlay(...args) {
    played.add(this);
    return original.apply(this, args);
  };
  proto.__roughCutPlayTracked = true;
  return true;
}

export function trackPlayedMedia(element) {
  played.add(element);
}

/** Pause every element that was ever played and is still playing. Returns how many were still playing. */
export function pauseAllPlayedMedia() {
  let stillPlaying = 0;
  for (const element of [...played]) {
    if (!element.paused) {
      stillPlaying += 1;
      try { element.pause(); } catch { /* element already gone */ }
    }
    if (element.paused && !element.isConnected) played.delete(element);
  }
  return stillPlaying;
}

/** Stop was pressed: silence everything now and again shortly after, for late play() promises. */
export function silenceAfterStop(schedule = (fn, ms) => setTimeout(fn, ms)) {
  const first = pauseAllPlayedMedia();
  schedule(() => pauseAllPlayedMedia(), 150);
  schedule(() => pauseAllPlayedMedia(), 600);
  return first;
}
