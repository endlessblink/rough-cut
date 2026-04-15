import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../hooks/use-stores.js';
import { useCameraSync } from './use-camera-sync.js';

interface CameraPlaybackCanvasProps {
  filePath: string;
}

export function CameraPlaybackCanvas({ filePath }: CameraPlaybackCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const fps = useProjectStore((s) => s.project.settings.frameRate);

  useCameraSync(videoRef.current, fps);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setReady(video.readyState >= 2);

    const onLoadedData = () => setReady(true);

    video.addEventListener('loadeddata', onLoadedData);
    if (video.readyState >= 2) setReady(true);

    return () => {
      video.removeEventListener('loadeddata', onLoadedData);
    };
  }, [filePath]);

  return (
    <video
      ref={videoRef}
      data-testid="camera-playback-video"
      data-ready={ready ? 'true' : 'false'}
      src={`media://${filePath}`}
      muted
      playsInline
      preload="auto"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        background: '#000',
      }}
    />
  );
}
