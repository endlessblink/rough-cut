import React, { useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import type { Clip, Track } from '../../types';
import { generateClips, DEFAULT_TRACKS } from '../../types';
import { ClipBlock } from '../../components/ClipBlock';

interface ProjectStore {
  tracks: Track[];
  clips: Clip[];
  setClips: (clips: Clip[]) => void;
}

const useProjectStore = create<ProjectStore>((set) => ({
  tracks: DEFAULT_TRACKS,
  clips: [],
  setClips: (clips) => set({ clips }),
}));

const PIXELS_PER_FRAME = 2;

export function TimelineRef({ clipCount }: { clipCount: number }) {
  const setClips = useProjectStore(s => s.setClips);
  const tracks = useProjectStore(s => s.tracks);
  const clips = useProjectStore(s => s.clips);

  const playheadRef = useRef(0);
  const playheadElRef = useRef<HTMLDivElement>(null);
  const frameDisplayRef = useRef<HTMLSpanElement>(null);
  const isPlayingRef = useRef(false);
  const rafRef = useRef<number>();

  useEffect(() => {
    setClips(generateClips(clipCount, DEFAULT_TRACKS));
  }, [clipCount, setClips]);

  // Playback loop — uses refs only, no store updates
  const startPlayback = useCallback(() => {
    isPlayingRef.current = true;
    const tick = () => {
      if (!isPlayingRef.current) return;
      playheadRef.current++;
      if (playheadRef.current > 5000) playheadRef.current = 0;

      // Direct DOM update — no React re-render
      if (playheadElRef.current) {
        playheadElRef.current.style.left = `${30 + playheadRef.current * PIXELS_PER_FRAME}px`;
      }
      if (frameDisplayRef.current) {
        frameDisplayRef.current.textContent = String(playheadRef.current);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) stopPlayback();
    else startPlayback();
  }, [startPlayback, stopPlayback]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <strong>Architecture C: Ref-Based Playhead</strong>
        <span style={{ marginLeft: 16, fontFamily: 'monospace' }}>
          Frame: <span ref={frameDisplayRef}>0</span> | Clips: {clips.length}
        </span>
        <button onClick={togglePlay} style={{ marginLeft: 16, padding: '4px 12px' }}>
          Play / Pause
        </button>
      </div>

      <div style={{ position: 'relative', background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
        {tracks.map(track => {
          const trackClips = clips.filter(c => c.trackId === track.id);
          return (
            <div key={track.id} style={{ position: 'relative', height: 36, borderBottom: '1px solid #333' }}>
              <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 10, color: '#888' }}>{track.name}</span>
              <div style={{ marginLeft: 30, position: 'relative', height: '100%' }}>
                {trackClips.map(clip => (
                  <ClipBlock key={clip.id} clip={clip} pixelsPerFrame={PIXELS_PER_FRAME} />
                ))}
              </div>
            </div>
          );
        })}
        {/* Playhead — positioned via ref, not state */}
        <div
          ref={playheadElRef}
          style={{
            position: 'absolute', top: 0, bottom: 0,
            left: 30, width: 2, background: '#ef4444', zIndex: 10,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
