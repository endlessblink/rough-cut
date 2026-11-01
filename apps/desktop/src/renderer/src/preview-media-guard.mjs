// Safety net for "I pressed stop and the sound keeps playing" (Noam, 2026-11-01; only a restart cleared it).
// Remembers every media element that was started with play() in this window, including ones the
// preview no longer references (detached or from an earlier state), so stop can silence all of them.
// Delayed silencing never touches an element that was (re)started after the stop was pressed.
const played = new Map(); // element -> time of its last play()
let clock = () => Date.now();

export function setGuardClock(fn) { clock = fn; }

export function installPlayTracker(proto = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : null) {
  if (!proto || proto.__roughCutPlayTracked) return false;
  const original = proto.play;
  proto.play = function trackedPlay(...args) {
    played.set(this, clock());
    return original.apply(this, args);
  };
  proto.__roughCutPlayTracked = true;
  return true;
}

export function trackPlayedMedia(element) {
  played.set(element, clock());
}

/** Pause every element that was played (before `notAfter`, if given) and is still playing. Returns how many were still playing. */
export function pauseAllPlayedMedia(notAfter = Infinity) {
  let stillPlaying = 0;
  for (const [element, at] of [...played]) {
    if (at > notAfter) continue;
    if (!element.paused) {
      stillPlaying += 1;
      try { element.pause(); } catch { /* element already gone */ }
    }
    if (element.paused && !element.isConnected) played.delete(element);
  }
  return stillPlaying;
}

/** Stop was pressed: silence everything now, and again shortly after for late play() promises, but never what started after the stop. */
export function silenceAfterStop(schedule = (fn, ms) => setTimeout(fn, ms)) {
  const stoppedAt = clock();
  const first = pauseAllPlayedMedia();
  schedule(() => pauseAllPlayedMedia(stoppedAt), 150);
  schedule(() => pauseAllPlayedMedia(stoppedAt), 600);
  return first;
}
