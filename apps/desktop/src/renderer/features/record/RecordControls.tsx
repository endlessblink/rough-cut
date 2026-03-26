import React, { useRef, useCallback, useEffect } from 'react';
import type { RecordingResult } from '../../env.js';
import type { RecordingStatus } from './record-state.js';

interface RecordControlsProps {
  selectedSourceId: string | null;
  status: RecordingStatus;
  elapsedMs: number;
  setStatus: (status: RecordingStatus) => void;
  setError: (error: string) => void;
  setElapsedMs: (ms: number) => void;
  onAssetCreated: (result: RecordingResult) => void;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function RecordControls({
  selectedSourceId,
  status,
  elapsedMs,
  setStatus,
  setError,
  setElapsedMs,
  onAssetCreated,
}: RecordControlsProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const handleStart = useCallback(async () => {
    if (!selectedSourceId) return;

    try {
      setStatus('recording');
      chunksRef.current = [];

      // Get the media stream from the selected source (Electron-specific constraints)
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
        setStatus('stopping');

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
          setStatus('ready');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }

        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // 1-second chunks
      startTimeRef.current = performance.now();

      // Elapsed time ticker
      timerRef.current = window.setInterval(() => {
        setElapsedMs(performance.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedSourceId, setStatus, setError, setElapsedMs, onAssetCreated]);

  const handleStop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const isRecording = status === 'recording';
  const isStopping = status === 'stopping';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px' }}>
      {!isRecording && !isStopping && (
        <button
          onClick={handleStart}
          disabled={!selectedSourceId || status === 'loading-sources'}
          style={{
            ...btnStyle,
            background: selectedSourceId ? '#dc2626' : '#555',
            cursor: selectedSourceId ? 'pointer' : 'not-allowed',
          }}
        >
          {'\u25CF'} REC
        </button>
      )}
      {isRecording && (
        <>
          <button onClick={handleStop} style={{ ...btnStyle, background: '#555' }}>
            {'\u25A0'} Stop
          </button>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 16,
              color: '#ef4444',
            }}
          >
            {'\u25CF'} {formatTime(elapsedMs)}
          </span>
        </>
      )}
      {isStopping && (
        <span style={{ color: '#888', fontSize: 13 }}>Saving recording...</span>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '8px 20px',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};
