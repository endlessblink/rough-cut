import { useCallback, useEffect, useRef, useState } from 'react';

export type LivePreviewStatus = 'idle' | 'acquiring' | 'live' | 'failed';

/**
 * Acquires a MediaStream for the selected desktop capturer source
 * and provides a ref callback to attach it to a <video> element.
 * The stream lives independently of the recording lifecycle.
 */
export function useLivePreview(selectedSourceId: string | null) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<LivePreviewStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Acquire/release stream when source changes
  useEffect(() => {
    if (!selectedSourceId) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStream(null);
      }
      setStatus('idle');
      setError(null);
      return;
    }

    let cancelled = false;

    async function acquireStream() {
      setStatus('acquiring');
      setError(null);
      try {
        // Stop previous stream first
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setStream(null);
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSourceId,
              maxWidth: 3840,
              maxHeight: 2160,
              maxFrameRate: 60,
              minFrameRate: 15,
            },
          } as unknown as MediaTrackConstraints,
        });

        if (cancelled) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = newStream;
        setStream(newStream);
        setStatus('live');

        // If video element already exists, attach
        if (videoElementRef.current) {
          videoElementRef.current.srcObject = newStream;
        }
      } catch (err) {
        const name = (err as { name?: string })?.name ?? 'Error';
        const message = (err as { message?: string })?.message ?? String(err);
        console.error(
          '[useLivePreview] Failed to acquire stream:',
          `${name}: ${message}`,
          err,
        );
        if (!cancelled) {
          streamRef.current = null;
          setStream(null);
          setStatus('failed');
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void acquireStream();

    return () => {
      cancelled = true;
    };
  }, [selectedSourceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Callback ref for <video> element
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
    }
  }, []);

  return { stream, status, error, videoRef };
}
