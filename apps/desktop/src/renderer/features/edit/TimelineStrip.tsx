import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track, Asset } from '@rough-cut/project-model';
import { snapToNearestEdge } from '@rough-cut/timeline-engine';
import { ClipBlock } from './ClipBlock.js';

export interface TimelineInteractionConfig {
  canTrim: boolean;
  canSelect: boolean;
  canSnap: boolean;
}

export interface ExportRange {
  inFrame: number;
  outFrame: number;
}

interface TimelineStripProps {
  tracks: readonly Track[];
  assets: readonly Asset[];
  playheadFrame: number;
  selectedClipId?: string | null;
  pixelsPerFrame: number;
  snapEnabled?: boolean;
  interaction?: TimelineInteractionConfig;
  onSelectClip?: (clipId: string) => void;
  onScrub: (frame: number) => void;
  onTrimLeft?: (clipId: string, newTimelineIn: number) => void;
  onTrimRight?: (clipId: string, newTimelineOut: number) => void;
  exportRange?: ExportRange;
  onChangeExportRange?: (range: ExportRange) => void;
}

const TRACK_HEIGHT = 36;
const RULER_HEIGHT = 24;
const LABEL_WIDTH = 48;
const SNAP_THRESHOLD = 5;

/** Frame interval for ruler tick marks (every N frames). */
function rulerInterval(totalFrames: number): number {
  if (totalFrames <= 150) return 10;
  if (totalFrames <= 600) return 30;
  if (totalFrames <= 1800) return 60;
  return 150;
}

const DEFAULT_INTERACTION: TimelineInteractionConfig = {
  canTrim: true,
  canSelect: true,
  canSnap: true,
};

export function TimelineStrip({
  tracks,
  assets,
  playheadFrame,
  selectedClipId = null,
  pixelsPerFrame,
  snapEnabled = false,
  interaction = DEFAULT_INTERACTION,
  onSelectClip,
  onScrub,
  onTrimLeft,
  onTrimRight,
  exportRange,
  onChangeExportRange,
}: TimelineStripProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMouseXRef = useRef(0);
  const prevPpfRef = useRef(pixelsPerFrame);
  const [snapIndicator, setSnapIndicator] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cursor-anchored zoom: keep the frame under the mouse fixed when pixelsPerFrame changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || prevPpfRef.current === pixelsPerFrame) return;

    const rect = el.getBoundingClientRect();
    const mouseRelX = lastMouseXRef.current - rect.left;

    if (mouseRelX >= 0 && mouseRelX <= rect.width) {
      const frameUnderCursor = (el.scrollLeft + mouseRelX - LABEL_WIDTH) / prevPpfRef.current;
      el.scrollLeft = frameUnderCursor * pixelsPerFrame - (mouseRelX - LABEL_WIDTH);
    }

    prevPpfRef.current = pixelsPerFrame;
  }, [pixelsPerFrame]);

  // Compute total timeline width from the maximum extent across all tracks
  const visibleFrames = containerWidth > 0
    ? Math.ceil((containerWidth - LABEL_WIDTH) / pixelsPerFrame)
    : 30;

  const maxFrame = Math.max(
    ...tracks.map((t) =>
      t.clips.reduce((mx, c) => Math.max(mx, c.timelineOut), 0),
    ),
    playheadFrame + 1,
    visibleFrames,
  );
  const totalWidth = maxFrame * pixelsPerFrame;

  const assetMap = new Map(assets.map((a) => [a.id, a]));



  const frameFromMouseX = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollLeft = containerRef.current.scrollLeft;
      const x = clientX - rect.left + scrollLeft - LABEL_WIDTH;
      return Math.max(0, Math.round(x / pixelsPerFrame));
    },
    [pixelsPerFrame],
  );

  const applySnap = useCallback(
    (frame: number, excludeClipId?: string) => {
      if (!snapEnabled || !interaction.canSnap) return frame;
      const result = snapToNearestEdge(
        frame,
        tracks as Track[],
        SNAP_THRESHOLD,
        excludeClipId as import('@rough-cut/project-model').ClipId | undefined,
      );
      if (result.snapped && result.snapTarget !== undefined) {
        setSnapIndicator(result.snapTarget);
        setTimeout(() => setSnapIndicator(null), 300);
      }
      return result.frame;
    },
    [snapEnabled, tracks],
  );

  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const raw = frameFromMouseX(e.clientX);
      onScrub(applySnap(raw));
    },
    [onScrub, frameFromMouseX, applySnap],
  );

  const handleTrackAreaClick = useCallback(
    (e: React.MouseEvent) => {
      const raw = frameFromMouseX(e.clientX);
      onScrub(applySnap(raw));
    },
    [onScrub, frameFromMouseX, applySnap],
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
          left: f * pixelsPerFrame,
          fontSize: 9,
          color: 'rgba(255,255,255,0.45)',
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
      onMouseMove={(e) => { lastMouseXRef.current = e.clientX; }}
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        background: 'rgba(10,10,10,0.98)',
        borderTop: 'none',
        position: 'relative',
        flex: '1 1 0',
        minWidth: 0,
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
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          cursor: 'crosshair',
          background: 'rgba(15,15,15,0.98)',
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
            borderBottom: '1px solid rgba(255,255,255,0.04)',
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
              color: 'rgba(255,255,255,0.50)',
              background: 'rgba(0,0,0,0.6)',
              borderRight: '1px solid rgba(255,255,255,0.06)',
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
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '40px 100%',
            }}
            onClick={handleTrackAreaClick}
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
                  pixelsPerFrame={pixelsPerFrame}
                  isSelected={interaction.canSelect ? clip.id === selectedClipId : false}
                  label={label}
                  onClick={interaction.canSelect ? onSelectClip : undefined}
                  onTrimLeft={interaction.canTrim ? onTrimLeft : undefined}
                  onTrimRight={interaction.canTrim ? onTrimRight : undefined}
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
          left: LABEL_WIDTH + playheadFrame * pixelsPerFrame,
          top: 0,
          bottom: 0,
          width: 2,
          background: '#ff7043',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />

      {/* Snap indicator line */}
      {snapIndicator !== null && (
        <div
          style={{
            position: 'absolute',
            left: LABEL_WIDTH + snapIndicator * pixelsPerFrame,
            top: 0,
            bottom: 0,
            width: 1,
            background: '#5ac8fa',
            pointerEvents: 'none',
            zIndex: 11,
            opacity: 0.8,
          }}
        />
      )}

      {/* Export range overlay — dims areas outside the range */}
      {exportRange && (() => {
        const inX = LABEL_WIDTH + exportRange.inFrame * pixelsPerFrame;
        const outX = LABEL_WIDTH + exportRange.outFrame * pixelsPerFrame;
        const fullWidth = LABEL_WIDTH + maxFrame * pixelsPerFrame;

        return (
          <>
            {/* Left dim zone */}
            {inX > LABEL_WIDTH && (
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: LABEL_WIDTH,
                width: inX - LABEL_WIDTH,
                background: 'rgba(0,0,0,0.55)',
                pointerEvents: 'none',
                zIndex: 8,
              }} />
            )}
            {/* Right dim zone */}
            {outX < fullWidth && (
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: outX,
                width: fullWidth - outX,
                background: 'rgba(0,0,0,0.55)',
                pointerEvents: 'none',
                zIndex: 8,
              }} />
            )}
            {/* In handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const startX = e.clientX;
                const startFrame = exportRange.inFrame;
                const handleMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX;
                  const deltaFrames = Math.round(dx / pixelsPerFrame);
                  const newIn = Math.max(0, Math.min(exportRange.outFrame - 1, startFrame + deltaFrames));
                  onChangeExportRange?.({ ...exportRange, inFrame: newIn });
                };
                const handleUp = () => {
                  window.removeEventListener('mousemove', handleMove);
                  window.removeEventListener('mouseup', handleUp);
                };
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleUp);
              }}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: inX - 3,
                width: 6,
                cursor: 'ew-resize',
                zIndex: 9,
                background: 'transparent',
              }}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 2,
                width: 2,
                background: '#ffcc66',
                borderRadius: 1,
              }} />
            </div>
            {/* Out handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const startX = e.clientX;
                const startFrame = exportRange.outFrame;
                const handleMove = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX;
                  const deltaFrames = Math.round(dx / pixelsPerFrame);
                  const newOut = Math.max(exportRange.inFrame + 1, startFrame + deltaFrames);
                  onChangeExportRange?.({ ...exportRange, outFrame: newOut });
                };
                const handleUp = () => {
                  window.removeEventListener('mousemove', handleMove);
                  window.removeEventListener('mouseup', handleUp);
                };
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleUp);
              }}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: outX - 3,
                width: 6,
                cursor: 'ew-resize',
                zIndex: 9,
                background: 'transparent',
              }}
            >
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 2,
                width: 2,
                background: '#ffcc66',
                borderRadius: 1,
              }} />
            </div>
          </>
        );
      })()}
    </div>
  );
}
