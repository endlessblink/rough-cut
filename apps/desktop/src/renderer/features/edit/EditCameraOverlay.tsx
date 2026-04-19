import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CameraPresentation, NormalizedRect } from '@rough-cut/project-model';
import { getCameraBorderRadius } from '@rough-cut/frame-resolver';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import { transportStore } from '../../hooks/use-stores.js';

interface EditCameraOverlayProps {
  filePath: string;
  fps: number;
  clipTimelineIn: number;
  clipSourceIn: number;
  visible: boolean;
  camera: CameraPresentation;
  cameraFrame?: NormalizedRect;
}

function getPositionStyle(position: CameraPresentation['position']): CSSProperties {
  switch (position) {
    case 'corner-tl':
      return { top: '4%', left: '4%' };
    case 'corner-tr':
      return { top: '4%', right: '4%' };
    case 'corner-bl':
      return { bottom: '4%', left: '4%' };
    case 'center':
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    case 'corner-br':
    default:
      return { right: '4%', bottom: '4%' };
  }
}

function getAspectRatio(camera: CameraPresentation): string {
  if (camera.shape === 'circle') return '1 / 1';

  switch (camera.aspectRatio) {
    case '16:9':
      return '16 / 9';
    case '9:16':
      return '9 / 16';
    case '4:3':
      return '4 / 3';
    case '1:1':
    default:
      return '1 / 1';
  }
}

export function EditCameraOverlay({
  filePath,
  fps,
  clipTimelineIn,
  clipSourceIn,
  visible,
  camera,
  cameraFrame,
}: EditCameraOverlayProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const widthPercent = 24 * (camera.size / 100);
  const shadow = camera.shadowEnabled
    ? `0 ${Math.round(camera.shadowBlur * 0.25)}px ${camera.shadowBlur}px rgba(0,0,0,${camera.shadowOpacity})`
    : 'none';
  const frameToVideoTime = (frame: number) =>
    Math.max(0, (clipSourceIn + (frame - clipTimelineIn)) / fps);
  const videoTimeToFrame = (mediaTime: number) =>
    clipTimelineIn + Math.round(mediaTime * fps) - clipSourceIn;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const playbackManager = getPlaybackManager();

    setReady(video.readyState >= 1);

    const onLoadedData = () => {
      setReady(true);
      video.currentTime = frameToVideoTime(transportStore.getState().playheadFrame);
    };
    const register = () =>
      playbackManager.registerCameraVideo(video, frameToVideoTime, videoTimeToFrame);

    video.addEventListener('loadeddata', onLoadedData);
    if (video.readyState >= 2) {
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

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;

    const updateSize = () => {
      const rect = frame.getBoundingClientRect();
      setFrameSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const borderRadius =
    camera.shape === 'circle'
      ? '50%'
      : getCameraBorderRadius(camera, frameSize.width, frameSize.height);
  const frameStyle: CSSProperties = cameraFrame
    ? {
        left: `${cameraFrame.x * 100}%`,
        top: `${cameraFrame.y * 100}%`,
        width: `${cameraFrame.w * 100}%`,
        height: `${cameraFrame.h * 100}%`,
      }
    : {
        width: `${widthPercent}%`,
        aspectRatio: getAspectRatio(camera),
        ...getPositionStyle(camera.position),
      };

  return (
    <div
      ref={frameRef}
      style={{
        position: 'absolute',
        overflow: 'hidden',
        borderRadius,
        boxShadow: shadow,
        border: camera.inset > 0 ? `${camera.inset}px solid ${camera.insetColor}` : 'none',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        display: visible && camera.visible ? 'block' : 'none',
        zIndex: 3,
        ...frameStyle,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: camera.padding,
          overflow: 'hidden',
          borderRadius: 'inherit',
          background: '#000',
        }}
      >
        <video
          ref={videoRef}
          data-testid="edit-camera-playback-video"
          data-ready={ready ? 'true' : 'false'}
          src={`media://${filePath}`}
          muted
          playsInline
          preload="auto"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            background: '#000',
          }}
        />
      </div>
    </div>
  );
}
