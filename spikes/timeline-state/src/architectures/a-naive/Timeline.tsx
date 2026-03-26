import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Clip, Track } from '../../types';
import { generateClips, DEFAULT_TRACKS } from '../../types';
import { ClipBlock } from '../../components/ClipBlock';

interface NaiveStore {
  playhead: number;
  isPlaying: boolean;
  tracks: Track[];
  clips: Clip[];
  setPlayhead: (frame: number) => void;
  togglePlay: () => void;
  setClips: (clips: Clip[]) => void;
}

const useNaiveStore = create<NaiveStore>((set) => ({
  playhead: 0,
  isPlaying: false,
  tracks: DEFAULT_TRACKS,
  clips: [],
  setPlayhead: (frame) => set({ playhead: frame }),
  togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),
  setClips: (clips) => set({ clips }),
}));

const PIXELS_PER_FRAME = 2;

export function TimelineNaive({ clipCount }: { clipCount: number }) {
  const { playhead, isPlaying, tracks, clips, setPlayhead, togglePlay, setClips } = useNaiveStore();
  const rafRef = useRef<number>();

  // Generate clips on mount or count change
  useEffect(() => {
    setClips(generateClips(clipCount, DEFAULT_TRACKS));
  }, [clipCount, setClips]);

  // Playback loop — updates playhead via store
  useEffect(() => {
    if (!isPlaying) return;
    let frame = playhead;
    const tick = () => {
      frame++;
      if (frame > 5000) frame = 0;
      setPlayhead(frame);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, playhead, setPlayhead]);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <strong>Architecture A: Single Naive Store</strong>
        <span style={{ marginLeft: 16, fontFamily: 'monospace' }}>
          Frame: {playhead} | Clips: {clips.length}
        </span>
        <button onClick={togglePlay} style={{ marginLeft: 16, padding: '4px 12px' }}>
          {isPlaying ? 'Pause' : 'Play'}
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
        {/* Playhead */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: 30 + playhead * PIXELS_PER_FRAME,
          width: 2, background: '#ef4444', zIndex: 10,
        }} />
      </div>
    </div>
  );
}
