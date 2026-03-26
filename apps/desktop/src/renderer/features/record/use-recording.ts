import { useRef, useCallback, useEffect } from 'react';
import type { RecordingResult } from '../../env.js';
import type { RecordingStatus } from './record-state.js';

interface UseRecordingOptions {
  selectedSourceId: string | null;
  onStatusChange: (status: RecordingStatus) => void;
  onError: (error: string) => void;
  onElapsedChange: (ms: number) => void;
  onAssetCreated: (result: RecordingResult) => void;
}

interface UseRecordingResult {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useRecording({
  selectedSourceId,
  onStatusChange,
  onError,
  onElapsedChange,
  onAssetCreated,
}: UseRecordingOptions): UseRecordingResult {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (!selectedSourceId) return;

    try {
      onStatusChange('recording');
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: selectedSourceId,
          },
        } as unknown as MediaTrackConstraints,
      });

      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        onStatusChange('stopping');

        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const buffer = await blob.arrayBuffer();

        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack?.getSettings() ?? {};
        const durationMs = performance.now() - startTimeRef.current;

        try {
          const result = await window.roughcut.recordingSaveRecording(buffer, {
            fps: settings.frameRate ?? 30,
            width: settings.width ?? 1920,
            height: settings.height ?? 1080,
            durationMs,
          });
          onAssetCreated(result);
          onStatusChange('ready');
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err));
        }

        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      startTimeRef.current = performance.now();

      timerRef.current = window.setInterval(() => {
        onElapsedChange(performance.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedSourceId, onStatusChange, onError, onElapsedChange, onAssetCreated]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { startRecording, stopRecording };
}
