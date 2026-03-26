import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { Clip, Track } from '../../types';
import { generateClips, DEFAULT_TRACKS } from '../../types';
import { ClipBlock } from '../../components/ClipBlock';

// Transport store — playhead updates only affect this store
interface TransportStore {
  playhead: number;
  isPlaying: boolean;
  setPlayhead: (frame: number) => void;
  togglePlay: () => void;
}

const useTransportStore = create<TransportStore>((set) => ({
  playhead: 0,
  isPlaying: false,
  setPlayhead: (frame) => set({ playhead: frame }),
  togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),
}));

// Project store — clips and tracks (does NOT include playhead)
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

/** Playhead component — only subscribes to transport store */
function Playhead() {
  const playhead = useTransportStore(s => s.playhead);
  return (
    <div style={{
      position: 'absolute', top: 0, bottom: 0,
      left: 30 + playhead * PIXELS_PER_FRAME,
      width: 2, background: '#ef4444', zIndex: 10,
      pointerEvents: 'none',
    }} />
  );
}

/** Track row — only subscribes to project store */
function TrackRow({ track }: { track: Track }) {
  const clips = useProjectStore(s => s.clips.filter(c => c.trackId === track.id));
  return (
    <div style={{ position: 'relative', height: 36, borderBottom: '1px solid #333' }}>
      <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 10, color: '#888' }}>{track.name}</span>
      <div style={{ marginLeft: 30, position: 'relative', height: '100%' }}>
        {clips.map(clip => (
          <ClipBlock key={clip.id} clip={clip} pixelsPerFrame={PIXELS_PER_FRAME} />
        ))}
      </div>
    </div>
  );
}

export function TimelineSplit({ clipCount }: { clipCount: number }) {
  const { isPlaying, togglePlay, setPlayhead } = useTransportStore();
  const playhead = useTransportStore(s => s.playhead);
  const setClips = useProjectStore(s => s.setClips);
  const tracks = useProjectStore(s => s.tracks);
  const clipCountState = useProjectStore(s => s.clips.length);
  const rafRef = useRef<number>();

  useEffect(() => {
    setClips(generateClips(clipCount, DEFAULT_TRACKS));
  }, [clipCount, setClips]);

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
  }, [isPlaying]);

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <strong>Architecture B: Split Stores</strong>
        <span style={{ marginLeft: 16, fontFamily: 'monospace' }}>
          Frame: {playhead} | Clips: {clipCountState}
        </span>
        <button onClick={togglePlay} style={{ marginLeft: 16, padding: '4px 12px' }}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
      </div>

      <div style={{ position: 'relative', background: '#1a1a2e', borderRadius: 4, overflow: 'hidden' }}>
        {tracks.map(track => <TrackRow key={track.id} track={track} />)}
        <Playhead />
      </div>
    </div>
  );
}
