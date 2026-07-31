import React from 'react';
import { navigatorClipStyle, navigatorFrameAtClientX } from './timeline-navigator-math.mjs';

type NavigatorBlock = {
  timelineIn: number;
  timelineOut: number;
  enabled?: boolean;
};

type NavigatorTrack = {
  kind: string;
  blocks: readonly NavigatorBlock[];
};

type NleTimelineNavigatorProps = {
  tracks: readonly NavigatorTrack[];
  durationFrames: number;
  playheadFrame: number;
  fps: number;
  onSeekFrame: (frame: number) => void;
};

export function NleTimelineNavigator({ tracks, durationFrames, playheadFrame, fps, onSeekFrame }: NleTimelineNavigatorProps) {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = React.useState(false);

  function seekFromPointer(clientX: number) {
    const surface = surfaceRef.current;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    onSeekFrame(navigatorFrameAtClientX(clientX, rect.left, rect.width, durationFrames));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    seekFromPointer(event.clientX);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragging) seekFromPointer(event.clientX);
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }

  const safeDuration = Math.max(1, Number(durationFrames) || 1);
  const safePlayhead = Math.max(0, Math.min(safeDuration, Number(playheadFrame) || 0));
  const timecode = `${Math.floor(safePlayhead / Math.max(1, fps))}:${String(Math.floor(safePlayhead % Math.max(1, fps))).padStart(2, '0')}`;

  return (
    <div className="nleTimelineNavigator" data-ui-region="nle-timeline-navigator">
      <div className="nleTimelineNavigatorHeader">
        <span className="eyebrow">Navigator</span>
        <span>{timecode}</span>
      </div>
      <div
        ref={surfaceRef}
        className={`nleTimelineNavigatorSurface${dragging ? ' dragging' : ''}`}
        role="slider"
        aria-label="Timeline navigator"
        aria-valuemin={0}
        aria-valuemax={safeDuration}
        aria-valuenow={Math.round(safePlayhead)}
        aria-valuetext={`${timecode} of timeline`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onSeekFrame(Math.max(0, safePlayhead - Math.max(1, fps)));
          if (event.key === 'ArrowRight') onSeekFrame(Math.min(safeDuration, safePlayhead + Math.max(1, fps)));
          if (event.key === 'Home') onSeekFrame(0);
          if (event.key === 'End') onSeekFrame(safeDuration);
        }}
      >
        <div className="nleTimelineNavigatorTracks" aria-hidden="true">
          {tracks.slice(0, 8).map((track, trackIndex) => (
            <div className={`nleTimelineNavigatorTrack ${track.kind}`} key={`${track.kind}-${trackIndex}`}>
              {track.blocks.map((block, blockIndex) => {
                const style = navigatorClipStyle(block.timelineIn, block.timelineOut, safeDuration);
                return style ? <span className={`nleTimelineNavigatorClip${block.enabled === false ? ' disabled' : ''}`} key={`${trackIndex}-${blockIndex}`} style={style} /> : null;
              })}
            </div>
          ))}
        </div>
        <span className="nleTimelineNavigatorPlayhead" style={{ left: `${(safePlayhead / safeDuration) * 100}%` }} />
      </div>
    </div>
  );
}
