/**
 * RecordTimelineShell: Presentation-only mini-timeline for the Record view.
 * Shows real tracks and clips from the project store, read-only.
 * No trim handles, no selection, no split, no delete.
 */
import { useRef, useCallback, useMemo } from 'react';
import type { Track, Asset } from '@rough-cut/project-model';

interface RecordTimelineShellProps {
  tracks: readonly Track[];
  assets: readonly Asset[];
  durationFrames: number;
  currentFrame: number;
  fps: number;
  onScrub: (frame: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function chooseMajorTickInterval(durationSec: number): number {
  if (durationSec <= 10) return 1;
  if (durationSec <= 30) return 5;
  if (durationSec <= 120) return 10;
  return 30;
}

function trackLabel(track: Track, index: number): string {
  if (track.type === 'video') return `V${index + 1}`;
  if (track.type === 'audio') return `A${index + 1}`;
  return track.name.slice(0, 2).toUpperCase();
}

// ─── TimelineRuler ────────────────────────────────────────────────────────────

function TimelineRuler({
  durationFrames,
  fps,
}: {
  durationFrames: number;
  fps: number;
}) {
  const durationSec = durationFrames / fps;
  const interval = chooseMajorTickInterval(durationSec);

  const ticks = useMemo(() => {
    if (durationSec <= 0) return [];
    const result: { timeSec: number; pct: number }[] = [];
    for (let t = 0; t <= durationSec; t += interval) {
      result.push({ timeSec: t, pct: (t / durationSec) * 100 });
    }
    return result;
  }, [durationSec, interval]);

  return (
    <div
      style={{
        height: 20,
        minHeight: 20,
        position: 'relative',
        background: 'rgba(15,15,15,0.98)',
        flexShrink: 0,
        paddingLeft: 32, // align with clip area (label width)
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {ticks.map(({ timeSec, pct }) => (
        <div
          key={timeSec}
          style={{
            position: 'absolute',
            left: `calc(32px + ${pct}% * (100% - 32px) / 100)`,
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <div
            style={{
              width: 1,
              height: 6,
              background: 'rgba(255,255,255,0.20)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: 1,
              fontSize: 9,
              color: 'rgba(255,255,255,0.45)',
              whiteSpace: 'nowrap',
              transform: 'translateX(-50%)',
              letterSpacing: '0.02em',
            }}
          >
            {formatTimecode(timeSec)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── TrackLanes ───────────────────────────────────────────────────────────────

const LABEL_WIDTH = 32;
const LANE_HEIGHT = 32;
const CLIP_HEIGHT = 22;
const CLIP_TOP = (LANE_HEIGHT - CLIP_HEIGHT) / 2;

function TrackLanes({
  tracks,
  assets,
  durationFrames,
  currentFrame,
  onScrub,
}: {
  tracks: readonly Track[];
  assets: readonly Asset[];
  durationFrames: number;
  currentFrame: number;
  onScrub: (frame: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  // Build a fast asset lookup
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  const frameFromClientX = useCallback(
    (clientX: number): number => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || durationFrames <= 0) return 0;
      // clip area starts after label column
      const clipAreaLeft = rect.left + LABEL_WIDTH;
      const clipAreaWidth = rect.width - LABEL_WIDTH;
      const x = Math.min(Math.max(clientX - clipAreaLeft, 0), clipAreaWidth);
      return Math.round((x / clipAreaWidth) * durationFrames);
    },
    [durationFrames],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only scrub on clip area (not label column)
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || e.clientX < rect.left + LABEL_WIDTH) return;
      isDraggingRef.current = true;
      onScrub(frameFromClientX(e.clientX));

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        onScrub(frameFromClientX(ev.clientX));
      };
      const handleMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [frameFromClientX, onScrub],
  );

  const playheadPct = durationFrames > 0 ? (currentFrame / durationFrames) * 100 : 0;

  // Count video/audio tracks separately for labels
  let vIdx = 0;
  let aIdx = 0;
  const labelIndices: number[] = tracks.map((t) => {
    if (t.type === 'video') return vIdx++;
    return aIdx++;
  });

  const totalHeight = Math.max(tracks.length * LANE_HEIGHT, LANE_HEIGHT);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(7,7,7,0.98)',
        cursor: 'pointer',
        minHeight: totalHeight,
      }}
    >
      {/* Lane rows */}
      {tracks.map((track, i) => {
        const laneTop = i * LANE_HEIGHT;
        const isVideo = track.type === 'video';
        const labelText = trackLabel(track, labelIndices[i] ?? i);

        return (
          <div
            key={track.id}
            style={{
              position: 'absolute',
              top: laneTop,
              left: 0,
              right: 0,
              height: LANE_HEIGHT,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
            }}
          >
            {/* Lane label */}
            <div
              style={{
                width: LABEL_WIDTH,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.60)',
                borderRight: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: isVideo ? 'rgba(108,191,255,0.70)' : 'rgba(255,189,110,0.70)',
                  userSelect: 'none',
                  letterSpacing: '0.03em',
                }}
              >
                {labelText}
              </span>
            </div>

            {/* Clip area */}
            <div
              style={{
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {track.clips.map((clip) => {
                const asset = assetMap.get(clip.assetId);
                const clipDuration = clip.timelineOut - clip.timelineIn;
                if (durationFrames <= 0 || clipDuration <= 0) return null;

                const leftPct = (clip.timelineIn / durationFrames) * 100;
                const widthPct = (clipDuration / durationFrames) * 100;

                const bgGradient = isVideo
                  ? 'linear-gradient(to right, rgba(108,191,255,0.85), rgba(27,97,189,0.85))'
                  : 'linear-gradient(to right, rgba(255,189,110,0.85), rgba(221,128,42,0.85))';

                const label = asset
                  ? asset.filePath.split('/').pop() ?? asset.filePath
                  : clip.name ?? clip.id;

                return (
                  <div
                    key={clip.id}
                    style={{
                      position: 'absolute',
                      top: CLIP_TOP,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      height: CLIP_HEIGHT,
                      borderRadius: 4,
                      background: bgGradient,
                      overflow: 'hidden',
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.90)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 'calc(100% - 12px)',
                        userSelect: 'none',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state when no tracks */}
      {tracks.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.20)', userSelect: 'none' }}>
            No clips yet
          </span>
        </div>
      )}

      {/* Playhead line */}
      {durationFrames > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${LABEL_WIDTH}px + ${playheadPct}% * (100% - ${LABEL_WIDTH}px) / 100)`,
            width: 2,
            background: '#ff7043',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
            transform: 'translateX(-1px)',
            pointerEvents: 'none',
            zIndex: 4,
          }}
        />
      )}

      {/* Playhead handle (at top) */}
      {durationFrames > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: `calc(${LABEL_WIDTH}px + ${playheadPct}% * (100% - ${LABEL_WIDTH}px) / 100)`,
            width: 10,
            height: 10,
            borderRadius: 999,
            background: '#ff7043',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 4,
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        />
      )}
    </div>
  );
}

// ─── RecordTimelineShell ──────────────────────────────────────────────────────

export function RecordTimelineShell({
  tracks,
  assets,
  durationFrames,
  currentFrame,
  fps,
  onScrub,
}: RecordTimelineShellProps) {
  return (
    <div
      style={{
        width: '100%',
        flex: 1,
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'rgba(8,8,8,0.96)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 32,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'rgba(0,0,0,0.80)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.72)',
            userSelect: 'none',
          }}
        >
          Timeline
        </span>
        <div style={{ display: 'flex', gap: 8 }} />
      </div>

      {/* Body */}
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <TimelineRuler durationFrames={durationFrames} fps={fps} />
        <TrackLanes
          tracks={tracks}
          assets={assets}
          durationFrames={durationFrames}
          currentFrame={currentFrame}
          onScrub={onScrub}
        />
      </div>
    </div>
  );
}
