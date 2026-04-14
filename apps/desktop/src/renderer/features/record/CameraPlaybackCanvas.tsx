import { useEffect, useRef, useState } from 'react';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';

interface CameraPlaybackCanvasProps {
  filePath: string;
}

export function CameraPlaybackCanvas({ filePath }: CameraPlaybackCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const playbackManager = getPlaybackManager();

    const onLoadedMetadata = () => setReady(true);
    const register = () => playbackManager.registerCameraVideo(video);

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    if (video.readyState >= 1) {
      setReady(true);
      register();
    } else {
      video.addEventListener('loadedmetadata', register, { once: true });
    }

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadedmetadata', register);
      playbackManager.unregisterCameraVideo();
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
