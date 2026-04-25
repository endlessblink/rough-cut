import { useEffect, useRef, useState } from 'react';

interface UseLiveCameraPreviewOptions {
  enabled: boolean;
  deviceId: string | null;
}

interface UseLiveCameraPreviewResult {
  stream: MediaStream | null;
  aspectRatio: number;
}

export function useLiveCameraPreview({
  enabled,
  deviceId,
}: UseLiveCameraPreviewOptions): UseLiveCameraPreviewResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  const streamRef = useRef<MediaStream | null>(null);
  const activeStreamKeyRef = useRef<string | null>(null);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    if (!enabled) {
      activeStreamKeyRef.current = null;
      setAspectRatio(4 / 3);
      setStream((prev) => {
        prev?.getTracks().forEach((track) => track.stop());
        return null;
      });
      return;
    }

    const desiredKey = deviceId ?? '__default__';
    const existingStream = streamRef.current;
    const existingTrack = existingStream?.getVideoTracks()[0] ?? null;
    if (
      existingStream &&
      existingTrack &&
      existingTrack.readyState === 'live' &&
      activeStreamKeyRef.current === desiredKey
    ) {
      return;
    }

    let active = true;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      })
      .then((nextStream) => {
        if (!active) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const nextTrack = nextStream.getVideoTracks()[0] ?? null;
        const settings = nextTrack?.getSettings() ?? {};
        const width = typeof settings.width === 'number' ? settings.width : 0;
        const height = typeof settings.height === 'number' ? settings.height : 0;
        setAspectRatio(width > 0 && height > 0 ? width / height : 4 / 3);
        activeStreamKeyRef.current = desiredKey;
        setStream((prev) => {
          if (prev && prev !== nextStream) {
            prev.getTracks().forEach((track) => track.stop());
          }
          return nextStream;
        });
      })
      .catch(() => {
        if (!active) return;
        activeStreamKeyRef.current = null;
        setAspectRatio(4 / 3);
        setStream((prev) => {
          prev?.getTracks().forEach((track) => track.stop());
          return null;
        });
      });

    return () => {
      active = false;
    };
  }, [deviceId, enabled]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      activeStreamKeyRef.current = null;
    };
  }, []);

  return { stream, aspectRatio };
}
