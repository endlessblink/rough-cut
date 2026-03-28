import { useRef, useCallback, useEffect } from 'react';
import type { RecordingResult } from '../../env.js';
import type { RecordingStatus } from './record-state.js';
import { projectStore } from '../../hooks/use-stores.js';

interface UseRecordingOptions {
  selectedSourceId: string | null;
  /** External MediaStream managed by useLivePreview. When provided, recording
   * reuses this stream instead of calling getUserMedia again. The caller owns
   * the stream lifecycle — useRecording will NOT stop its tracks on recording end. */
  stream?: MediaStream | null;
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
  stream: externalStream,
  onStatusChange,
  onError,
  onElapsedChange,
  onAssetCreated,
}: UseRecordingOptions): UseRecordingResult {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  // Only used when we own the stream (no external stream provided)
  const ownedStreamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (!selectedSourceId) return;

    try {
      onStatusChange('recording');
      chunksRef.current = [];

      // Use the external live-preview stream if available; otherwise acquire our own
      let stream: MediaStream;
      if (externalStream) {
        stream = externalStream;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSourceId,
            },
          } as unknown as MediaTrackConstraints,
        });
        ownedStreamRef.current = stream;
      }

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
          const filePath = projectStore.getState().projectFilePath;
          const projectDir = filePath
            ? filePath.substring(0, filePath.lastIndexOf('/'))
            : undefined;

          const result = await window.roughcut.recordingSaveRecording(buffer, {
            fps: settings.frameRate ?? 30,
            width: settings.width ?? 1920,
            height: settings.height ?? 1080,
            durationMs,
            projectDir,
          });
          onAssetCreated(result);
          onStatusChange('ready');
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err));
        }

        // Only stop tracks if we own the stream (external stream lifecycle
        // is managed by useLivePreview)
        if (!externalStream && ownedStreamRef.current) {
          ownedStreamRef.current.getTracks().forEach((t) => t.stop());
          ownedStreamRef.current = null;
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      startTimeRef.current = performance.now();

      timerRef.current = window.setInterval(() => {
        onElapsedChange(performance.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      console.error('[recording] renderer: error:', err);
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedSourceId, externalStream, onStatusChange, onError, onElapsedChange, onAssetCreated]);

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
      if (ownedStreamRef.current) {
        ownedStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { startRecording, stopRecording };
}
