import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { CameraPresentation } from '@rough-cut/project-model';

interface EditCameraOverlayProps {
  filePath: string;
  fps: number;
  sourceFrame: number;
  visible: boolean;
  isPlaying: boolean;
  camera: CameraPresentation;
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

function getBorderRadius(camera: CameraPresentation): string {
  if (camera.shape === 'circle') return '9999px';
  if (camera.shape === 'square') return '0';
  return `${Math.max(0, Math.min(100, camera.roundness))}%`;
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
  sourceFrame,
  visible,
  isPlaying,
  camera,
}: EditCameraOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const targetTime = sourceFrame / fps;
  const widthPercent = 24 * (camera.size / 100);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setReady(video.readyState >= 1);

    const onLoadedMetadata = () => {
      setReady(true);
      video.currentTime = targetTime;
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [filePath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 1) return;

    if (!visible || !camera.visible) {
      video.pause();
      return;
    }

    if (isPlaying) {
      if (Math.abs(video.currentTime - targetTime) > 0.08) {
        video.currentTime = targetTime;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
      if (Math.abs(video.currentTime - targetTime) > 0.02) {
        video.currentTime = targetTime;
      }
    }
  }, [camera.visible, isPlaying, targetTime, visible]);

  return (
    <div
      style={{
        position: 'absolute',
        width: `${widthPercent}%`,
        aspectRatio: getAspectRatio(camera),
        overflow: 'hidden',
        borderRadius: getBorderRadius(camera),
        boxShadow: '0 14px 38px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
        display: visible && camera.visible ? 'block' : 'none',
        zIndex: 3,
        background: '#000',
        ...getPositionStyle(camera.position),
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
  );
}
