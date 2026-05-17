import React from 'react';

type Options = {
  durationSeconds: number;
};

// Hover-scrub state: at rest the card shows the static <img> thumbnail. On the
// first pointer-enter, the consumer mounts a <video preload="none"> overlay
// (this hook owns the ref + currentTime updates). On pointer-leave, the video
// pauses and the consumer unmounts it so we don't keep 40+ HTMLVideoElements
// hot through the unthrottled media:// protocol.
export function useHoverScrub({ durationSeconds }: Options) {
  const cardRef = React.useRef<HTMLElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = React.useState(false);

  const onPointerEnter = React.useCallback(() => {
    if (durationSeconds <= 0) return;
    setActive(true);
  }, [durationSeconds]);

  const onPointerLeave = React.useCallback(() => {
    setActive(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      try { video.currentTime = 0; } catch { /* seek before metadata is fine to ignore */ }
    }
  }, []);

  const onPointerMove = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!active || durationSeconds <= 0) return;
    const video = videoRef.current;
    const card = cardRef.current;
    if (!video || !card) return;
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    try { video.currentTime = ratio * durationSeconds; } catch { /* mid-seek races are non-fatal */ }
  }, [active, durationSeconds]);

  return { cardRef, videoRef, active, onPointerEnter, onPointerLeave, onPointerMove };
}
