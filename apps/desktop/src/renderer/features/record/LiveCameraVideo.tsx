import { useEffect, useRef } from 'react';

interface LiveCameraVideoProps {
  stream: MediaStream;
  testId?: string;
}

export function LiveCameraVideo({ stream, testId }: LiveCameraVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;

    const sourceTrack = stream.getVideoTracks()[0] ?? null;
    if (!sourceTrack || sourceTrack.readyState !== 'live') {
      node.pause();
      node.srcObject = null;
      return;
    }

    node.srcObject = null;
    node.srcObject = stream;
    node.autoplay = true;
    node.muted = true;
    node.playsInline = true;

    const play = () => {
      void node.play().catch(() => {});
    };

    node.addEventListener('loadedmetadata', play);
    node.addEventListener('loadeddata', play);
    node.addEventListener('canplay', play);
    play();

    return () => {
      node.removeEventListener('loadedmetadata', play);
      node.removeEventListener('loadeddata', play);
      node.removeEventListener('canplay', play);
      node.pause();
      node.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      data-testid={testId}
      ref={videoRef}
      muted
      playsInline
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        objectFit: 'cover',
        background: '#050505',
      }}
    />
  );
}
