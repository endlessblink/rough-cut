import { useRef, useEffect } from 'react';

interface LivePreviewVideoProps {
  stream: MediaStream | null;
}

/**
 * Renders a <video> element that fills its positioned parent via
 * position: absolute; inset: 0. The parent MUST have position: relative
 * and a definite height (e.g. via aspect-ratio).
 *
 * No wrapper divs — the video element IS the component.
 */
export function LivePreviewVideo({ stream }: LivePreviewVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (ref.current && stream) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream;
      }
      void ref.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: 'black',
      }}
    />
  );
}
