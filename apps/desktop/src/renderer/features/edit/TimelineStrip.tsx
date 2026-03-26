import { useCallback, useRef } from 'react';
import type { Track, Asset } from '@rough-cut/project-model';
import { ClipBlock } from './ClipBlock.js';

interface TimelineStripProps {
  tracks: readonly Track[];
  assets: readonly Asset[];
  playheadFrame: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onScrub: (frame: number) => void;
}

const TRACK_HEIGHT = 36;
const RULER_HEIGHT = 24;
const LABEL_WIDTH = 48;
const PIXELS_PER_FRAME = 3;

/** Frame interval for ruler tick marks (every N frames). */
function rulerInterval(totalFrames: number): number {
  if (totalFrames <= 150) return 10;
  if (totalFrames <= 600) return 30;
  if (totalFrames <= 1800) return 60;
  return 150;
}

export function TimelineStrip({
  tracks,
  assets,
  playheadFrame,
  selectedClipId,
  onSelectClip,
  onScrub,
}: TimelineStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute total timeline width from the maximum extent across all tracks
  const maxFrame = Math.max(
    ...tracks.map((t) =>
      t.clips.reduce((mx, c) => Math.max(mx, c.timelineOut), 0),
    ),
    playheadFrame + 1,
    30, // minimum visible width
  );
  const totalWidth = maxFrame * PIXELS_PER_FRAME;

  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const frameFromMouseX = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const x = clientX - rect.left + scrollLeft - LABEL_WIDTH;
      return Math.max(0, Math.round(x / PIXELS_PER_FRAME));
    },
    [],
  );

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      onScrub(frameFromMouseX(e.clientX));
    },
    [onScrub, frameFromMouseX],
  );

  const interval = rulerInterval(maxFrame);

  // Build ruler ticks
  const ticks: React.ReactNode[] = [];
  for (let f = 0; f <= maxFrame; f += interval) {
    ticks.push(
      <span
        key={f}
        style={{
          position: 'absolute',
          left: f * PIXELS_PER_FRAME,
          fontSize: 9,
          color: '#666',
          userSelect: 'none',
          top: 4,
        }}
      >
        {f}
      </span>,
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        background: '#111',
        borderTop: '1px solid #333',
        position: 'relative',
        flex: 'none',
      }}
    >
      {/* Ruler */}
      <div
        onClick={handleRulerClick}
        style={{
          height: RULER_HEIGHT,
          position: 'relative',
          marginLeft: LABEL_WIDTH,
          width: totalWidth,
          borderBottom: '1px solid #333',
          cursor: 'crosshair',
        }}
      >
        {ticks}
      </div>

      {/* Track lanes */}
      {tracks.map((track) => (
        <div
          key={track.id}
          style={{
            display: 'flex',
            height: TRACK_HEIGHT,
            borderBottom: '1px solid #222',
          }}
        >
          {/* Track label */}
          <div
            style={{
              width: LABEL_WIDTH,
              minWidth: LABEL_WIDTH,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#888',
              background: '#151515',
              borderRight: '1px solid #333',
              userSelect: 'none',
            }}
          >
            {track.name.length > 6
              ? track.name.replace('Video ', 'V').replace('Audio ', 'A')
              : track.name}
          </div>

          {/* Clip area */}
          <div
            style={{
              position: 'relative',
              flex: 1,
              minWidth: totalWidth,
            }}
            onClick={(e) => {
              onScrub(frameFromMouseX(e.clientX));
            }}
          >
            {track.clips.map((clip) => {
              const asset = assetMap.get(clip.assetId);
              const label = asset
                ? asset.filePath.split('/').pop() ?? clip.id
                : clip.id;
              return (
                <ClipBlock
                  key={clip.id}
                  clip={clip}
                  trackType={track.type}
                  pixelsPerFrame={PIXELS_PER_FRAME}
                  isSelected={clip.id === selectedClipId}
                  label={label}
                  onClick={onSelectClip}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Playhead line */}
      <div
        style={{
          position: 'absolute',
          left: LABEL_WIDTH + playheadFrame * PIXELS_PER_FRAME,
          top: 0,
          bottom: 0,
          width: 1,
          background: '#ef4444',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    </div>
  );
}
