/** Minimal clip type for benchmarking — mirrors @rough-cut/project-model */
export interface Clip {
  id: string;
  trackId: string;
  position: number;  // start frame
  duration: number;  // frame count
  color: string;     // visual identifier (no video in spike)
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio';
  index: number;
}

/** Generate N random clips distributed across tracks */
export function generateClips(count: number, tracks: Track[]): Clip[] {
  const clips: Clip[] = [];
  const colors = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2'];

  for (let i = 0; i < count; i++) {
    const track = tracks[i % tracks.length];
    const duration = 30 + Math.floor(Math.random() * 270); // 30-300 frames
    const position = Math.floor(Math.random() * 3000);
    clips.push({
      id: `clip-${i}`,
      trackId: track.id,
      position,
      duration,
      color: colors[i % colors.length],
    });
  }

  return clips;
}

export const DEFAULT_TRACKS: Track[] = [
  { id: 'v1', name: 'V1', type: 'video', index: 0 },
  { id: 'v2', name: 'V2', type: 'video', index: 1 },
  { id: 'a1', name: 'A1', type: 'audio', index: 2 },
  { id: 'a2', name: 'A2', type: 'audio', index: 3 },
];

/** Select clips active at a given frame */
export function selectActiveClipsAtFrame(clips: Clip[], frame: number): Clip[] {
  return clips.filter(c => frame >= c.position && frame < c.position + c.duration);
}
