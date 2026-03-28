import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Acquires a MediaStream for the selected desktop capturer source
 * and provides a ref callback to attach it to a <video> element.
 * The stream lives independently of the recording lifecycle.
 */
export function useLivePreview(selectedSourceId: string | null) {
  const [stream, setStream] = useState<MediaStream | null>(null);
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
      return;
    }

    let cancelled = false;

    async function acquireStream() {
      try {
        // Stop previous stream first
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSourceId,
            },
          } as unknown as MediaTrackConstraints,
        });

        if (cancelled) {
          newStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = newStream;
        setStream(newStream);

        // If video element already exists, attach
        if (videoElementRef.current) {
          videoElementRef.current.srcObject = newStream;
        }
      } catch (err) {
        console.error('[useLivePreview] Failed to acquire stream:', err);
        if (!cancelled) {
          streamRef.current = null;
          setStream(null);
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

  return { stream, videoRef };
}
