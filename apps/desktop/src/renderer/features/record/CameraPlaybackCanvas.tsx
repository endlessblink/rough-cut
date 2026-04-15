import { useEffect, useRef, useState } from 'react';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import { transportStore } from '../../hooks/use-stores.js';

interface CameraPlaybackCanvasProps {
  filePath: string;
  fps: number;
  clipTimelineIn?: number;
  clipSourceIn?: number;
}

export function CameraPlaybackCanvas({
  filePath,
  fps,
  clipTimelineIn = 0,
  clipSourceIn = 0,
}: CameraPlaybackCanvasProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  const frameToVideoTime = (frame: number) =>
    Math.max(0, (clipSourceIn + (frame - clipTimelineIn)) / fps);
  const videoTimeToFrame = (mediaTime: number) =>
    clipTimelineIn + Math.round(mediaTime * fps) - clipSourceIn;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const playbackManager = getPlaybackManager();

    setReady(video.readyState >= 2);

    const onLoadedData = () => {
      setReady(true);
      video.currentTime = frameToVideoTime(transportStore.getState().playheadFrame);
    };
    const register = () =>
      playbackManager.registerCameraVideo(video, frameToVideoTime, videoTimeToFrame);

    video.addEventListener('loadeddata', onLoadedData);
    if (video.readyState >= 2) {
      setReady(true);
      register();
    } else {
      video.addEventListener('loadeddata', register, { once: true });
    }

    return () => {
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('loadeddata', register);
      playbackManager.unregisterCameraVideo(video);
    };
  }, [clipSourceIn, clipTimelineIn, filePath, fps]);

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
