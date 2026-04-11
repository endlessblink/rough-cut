/**
 * RecordTimelineShell: Self-contained mini-timeline for the Record view.
 * Shows tracks/clips from the project store (read-only) with built-in
 * play/pause/scrub.  The playback rAF loop lives entirely inside this
 * component — no dependency on PlaybackController or compositor init.
 *
 * Key architecture choices (per research):
 *   1. All timing state lives in refs, NOT React state → no re-renders during playback.
 *   2. The rAF effect depends ONLY on the play trigger → never restarts mid-playback.
 *   3. The playhead needle is updated imperatively via a DOM ref.
 *   4. Callbacks are accessed through a ref to avoid stale closures.
 */
import { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import type { Track, Asset } from '@rough-cut/project-model';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface RecordTimelineShellProps {
  tracks: readonly Track[];
  assets: readonly Asset[];
  durationFrames: number;
  currentFrame: number;
  fps: number;
  onScrub: (frame: number) => void;
  /** When set, highlight clips matching this asset and dim others */
  activeAssetId?: string | null;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const LABEL_WIDTH = 32;
const LANE_HEIGHT = 32;
const CLIP_HEIGHT = 22;
const CLIP_TOP = (LANE_HEIGHT - CLIP_HEIGHT) / 2;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

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

/** Compute how far (0-100 %) a frame is across the clip area */
function frameToPct(frame: number, total: number): number {
  return total > 0 ? (frame / total) * 100 : 0;
}

/** CSS `left` expression that accounts for the label column */
function pctToLeft(pct: number): string {
  return `calc(${LABEL_WIDTH}px + (100% - ${LABEL_WIDTH}px) * ${pct} / 100)`;
}

/* ── TimelineRuler ─────────────────────────────────────────────────────────── */

function TimelineRuler({ durationFrames, fps }: { durationFrames: number; fps: number }) {
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
        paddingLeft: LABEL_WIDTH,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {ticks.map(({ timeSec, pct }) => (
        <div
          key={timeSec}
          style={{
            position: 'absolute',
            left: pctToLeft(pct),
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <div style={{ width: 1, height: 6, background: 'rgba(255,255,255,0.20)' }} />
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

/* ── RecordTimelineShell ───────────────────────────────────────────────────── */

export function RecordTimelineShell({
  tracks,
  assets,
  durationFrames,
  currentFrame,
  fps,
  onScrub,
  activeAssetId,
}: RecordTimelineShellProps) {
  /* ── derived data ──────────────────────────────────────────────────────── */

  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  const effectiveDuration = useMemo(() => {
    const maxClipEnd = tracks.reduce(
      (max, t) => t.clips.reduce((mx, c) => Math.max(mx, c.timelineOut), max),
      0,
    );
    return Math.max(maxClipEnd, durationFrames);
  }, [tracks, durationFrames]);

  /* ── play/pause state ──────────────────────────────────────────────────── */

  const [isPlaying, setIsPlaying] = useState(false);

  // Displayed frame – updates via state for the timecode readout only
  const [displayFrame, setDisplayFrame] = useState(currentFrame);

  /* ── refs for rAF loop (never in dep arrays) ───────────────────────────── */

  const rafIdRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const isPlayingRef = useRef(false);
  const internalFrameRef = useRef(currentFrame);
  const onScrubRef = useRef(onScrub);

  // Keep onScrubRef fresh (avoids stale closure)
  useEffect(() => {
    onScrubRef.current = onScrub;
  }, [onScrub]);

  // Sync external scrubs into the internal ref (when NOT playing)
  useEffect(() => {
    if (!isPlayingRef.current) {
      internalFrameRef.current = currentFrame;
      setDisplayFrame(currentFrame);
    }
  }, [currentFrame]);

  /* ── DOM refs for imperative playhead needle ───────────────────────────── */

  const needleRef = useRef<HTMLDivElement>(null);
  const needleHandleRef = useRef<HTMLDivElement>(null);
  const lanesContainerRef = useRef<HTMLDivElement>(null);

  const effectiveDurationRef = useRef(effectiveDuration);
  useEffect(() => { effectiveDurationRef.current = effectiveDuration; }, [effectiveDuration]);

  const moveNeedle = useCallback(
    (frame: number) => {
      const pct = frameToPct(frame, effectiveDurationRef.current);
      const left = pctToLeft(pct);
      if (needleRef.current) needleRef.current.style.left = left;
      if (needleHandleRef.current) needleHandleRef.current.style.left = left;
    },
    [],
  );

  /* ── rAF playback loop ─────────────────────────────────────────────────── */

  useEffect(() => {
    if (!isPlaying) {
      isPlayingRef.current = false;
      // Pause compositor video (stops audio)
      getPlaybackManager().setCompositorPlaying(false);
      return;
    }

    if (effectiveDuration <= 0) {
      setIsPlaying(false);
      return;
    }

    isPlayingRef.current = true;
    const INTERVAL = 1000 / fps;
    lastTimestampRef.current = performance.now();

    // Start compositor video playback (unmutes for audio)
    getPlaybackManager().setCompositorPlaying(true);

    const tick = (timestamp: number) => {
      if (!isPlayingRef.current) return; // guard: cleanup already ran

      const delta = timestamp - lastTimestampRef.current;

      if (delta >= INTERVAL) {
        // Drift-correcting modulo (prevents accumulated lag)
        lastTimestampRef.current = timestamp - (delta % INTERVAL);

        internalFrameRef.current += 1;

        // End-of-timeline → stop
        if (internalFrameRef.current >= effectiveDuration) {
          internalFrameRef.current = 0;
          isPlayingRef.current = false;
          setIsPlaying(false);
          setDisplayFrame(0);
          onScrubRef.current(0);
          moveNeedle(0);
          return;
        }

        // Push frame to store (via ref — no stale closure)
        onScrubRef.current(internalFrameRef.current);

        // Imperative needle update — no React re-render
        moveNeedle(internalFrameRef.current);

        // Throttled display update (~10 Hz for timecode readout)
        if (internalFrameRef.current % 3 === 0) {
          setDisplayFrame(internalFrameRef.current);
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isPlayingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlaying]); // ← ONLY isPlaying. Never frame, callbacks, or duration.
  // effectiveDuration, fps, moveNeedle are read from their current values
  // at tick time via closure — they're stable enough for a playback session.

  /* ── toggle ────────────────────────────────────────────────────────────── */

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  /* ── Space bar ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── scrub (click & drag) ──────────────────────────────────────────────── */

  const frameFromClientX = useCallback(
    (clientX: number): number => {
      const rect = lanesContainerRef.current?.getBoundingClientRect();
      if (!rect || effectiveDuration <= 0) return 0;
      const clipAreaLeft = rect.left + LABEL_WIDTH;
      const clipAreaWidth = rect.width - LABEL_WIDTH;
      const x = Math.min(Math.max(clientX - clipAreaLeft, 0), clipAreaWidth);
      return Math.round((x / clipAreaWidth) * effectiveDuration);
    },
    [effectiveDuration],
  );

  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = lanesContainerRef.current?.getBoundingClientRect();
      if (!rect || e.clientX < rect.left + LABEL_WIDTH) return;
      isDraggingRef.current = true;

      // Pause during scrub
      setIsPlaying(false);

      const frame = frameFromClientX(e.clientX);
      internalFrameRef.current = frame;
      onScrubRef.current(frame);
      setDisplayFrame(frame);
      moveNeedle(frame);

      const onMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const f = frameFromClientX(ev.clientX);
        internalFrameRef.current = f;
        onScrubRef.current(f);
        setDisplayFrame(f);
        moveNeedle(f);
      };
      const onUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [frameFromClientX, moveNeedle],
  );

  /* ── track label indices ───────────────────────────────────────────────── */

  let vIdx = 0;
  let aIdx = 0;
  const labelIndices: number[] = tracks.map((t) => {
    if (t.type === 'video') return vIdx++;
    return aIdx++;
  });

  const totalHeight = Math.max(tracks.length * LANE_HEIGHT, LANE_HEIGHT);
  const playheadPct = frameToPct(displayFrame, effectiveDuration);

  /* ── render ────────────────────────────────────────────────────────────── */

  return (
    <div
      data-testid="record-timeline"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 120,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 12,
        background: 'rgba(8,8,8,0.96)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.75)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={togglePlay}
            disabled={effectiveDuration <= 0}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: 'none',
              background: isPlaying ? 'rgba(255,112,67,0.20)' : 'rgba(255,255,255,0.06)',
              color: isPlaying ? '#ff7043' : 'rgba(255,255,255,0.70)',
              cursor: effectiveDuration > 0 ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              padding: 0,
              opacity: effectiveDuration > 0 ? 1 : 0.35,
            }}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? '\u23F8' : '\u25B6'}
          </button>
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
        </div>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.50)',
            userSelect: 'none',
          }}
        >
          {formatTimecode(displayFrame / fps)}
        </span>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <TimelineRuler durationFrames={effectiveDuration} fps={fps} />

        {/* ── Track lanes ─────────────────────────────────────────────────── */}
        <div
          ref={lanesContainerRef}
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
            const lbl = trackLabel(track, labelIndices[i] ?? i);

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
                    {lbl}
                  </span>
                </div>

                {/* Clip blocks */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                  {track.clips.map((clip) => {
                    const asset = assetMap.get(clip.assetId);
                    const dur = clip.timelineOut - clip.timelineIn;
                    if (effectiveDuration <= 0 || dur <= 0) return null;

                    const leftPct = frameToPct(clip.timelineIn, effectiveDuration);
                    const widthPct = frameToPct(dur, effectiveDuration);
                    const isActive = !activeAssetId || clip.assetId === activeAssetId;
                    const dimOpacity = isActive ? 0.85 : 0.25;
                    const bg = isVideo
                      ? `linear-gradient(to right, rgba(108,191,255,${dimOpacity}), rgba(27,97,189,${dimOpacity}))`
                      : `linear-gradient(to right, rgba(255,189,110,${dimOpacity}), rgba(221,128,42,${dimOpacity}))`;
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
                          background: bg,
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

          {/* Empty state */}
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

          {/* Playhead needle — positioned imperatively during playback */}
          {effectiveDuration > 0 && (
            <div
              ref={needleRef}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: pctToLeft(playheadPct),
                width: 2,
                background: '#ff7043',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
                transform: 'translateX(-1px)',
                pointerEvents: 'none',
                zIndex: 4,
              }}
            />
          )}

          {/* Playhead handle (circle at top) — also imperative */}
          {effectiveDuration > 0 && (
            <div
              ref={needleHandleRef}
              style={{
                position: 'absolute',
                top: 2,
                left: pctToLeft(playheadPct),
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
      </div>
    </div>
  );
}
