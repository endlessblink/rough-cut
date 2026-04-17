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
import { useRef, useCallback, useMemo, useEffect } from 'react';
import type { Track, Asset, ZoomMarker, ZoomMarkerId } from '@rough-cut/project-model';
import { getPlaybackManager } from '../../hooks/use-playback-manager.js';
import { transportStore, useTransportStore } from '../../hooks/use-stores.js';

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface RecordTimelineShellProps {
  tracks: readonly Track[];
  assets: readonly Asset[];
  durationFrames: number;
  fps: number;
  /** When set, highlight clips matching these assets and dim others */
  activeAssetIds?: readonly string[];
  /** Timeline-selected asset for channel targeting */
  selectedAssetId?: string | null;
  /** Select a clip's asset/channel */
  onSelectAsset?: (assetId: string) => void;
  /** Zoom markers for the active recording (auto + manual) */
  zoomMarkers?: readonly ZoomMarker[];
  /** Currently selected zoom marker (null = none selected) */
  selectedZoomMarkerId?: ZoomMarkerId | null;
  /** Add a manual zoom marker at the current playhead */
  onAddZoomMarkerAtPlayhead?: () => void;
  /** Select a zoom marker */
  onSelectZoomMarker?: (id: ZoomMarkerId | null) => void;
  /** Resize a manual zoom marker by dragging its edge handles */
  onResizeZoomMarker?: (
    id: ZoomMarkerId,
    patch: { startFrame?: number; endFrame?: number },
  ) => void;
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

/* ── ZoomTrackRow ──────────────────────────────────────────────────────────── */

function ZoomTrackRow({
  top,
  durationFrames,
  markers,
  selectedMarkerId,
  onSelectMarker,
  onAddMarker,
  onResizeMarker,
}: {
  top: number;
  durationFrames: number;
  markers: readonly ZoomMarker[];
  selectedMarkerId: ZoomMarkerId | null;
  onSelectMarker?: (id: ZoomMarkerId | null) => void;
  onAddMarker?: () => void;
  onResizeMarker?: (id: ZoomMarkerId, patch: { startFrame?: number; endFrame?: number }) => void;
}) {
  const markerAreaRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback(
    (markerId: ZoomMarkerId, edge: 'start' | 'end', downEvent: React.PointerEvent) => {
      downEvent.preventDefault();
      downEvent.stopPropagation();
      const area = markerAreaRef.current;
      if (!area || durationFrames <= 0) return;

      const rect = area.getBoundingClientRect();
      const marker = markers.find((m) => m.id === markerId);
      if (!marker) return;

      const frameFromClient = (clientX: number) => {
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return Math.round(ratio * durationFrames);
      };

      const minGap = 1;
      const onMove = (ev: PointerEvent) => {
        const frame = frameFromClient(ev.clientX);
        if (edge === 'start') {
          const startFrame = Math.max(0, Math.min(frame, marker.endFrame - minGap));
          onResizeMarker?.(markerId, { startFrame });
        } else {
          const endFrame = Math.max(marker.startFrame + minGap, Math.min(frame, durationFrames));
          onResizeMarker?.(markerId, { endFrame });
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [durationFrames, markers, onResizeMarker],
  );

  /**
   * Drag the marker body to move it along the timeline (preserves duration).
   * Distinguishes click (< 3px movement → select) from drag (move position).
   */
  const startMove = useCallback(
    (markerId: ZoomMarkerId, downEvent: React.PointerEvent) => {
      const area = markerAreaRef.current;
      if (!area || durationFrames <= 0) {
        // Fallback: still select on pointerup
        onSelectMarker?.(markerId);
        return;
      }

      const rect = area.getBoundingClientRect();
      const marker = markers.find((m) => m.id === markerId);
      if (!marker) return;

      const startClientX = downEvent.clientX;
      const pixelsPerFrame = rect.width / durationFrames;
      const dur = marker.endFrame - marker.startFrame;
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startClientX;
        if (!moved && Math.abs(dx) < 3) return; // still a click
        moved = true;
        const frameDelta = Math.round(dx / pixelsPerFrame);
        const maxStart = Math.max(0, durationFrames - dur);
        const newStart = Math.max(0, Math.min(maxStart, marker.startFrame + frameDelta));
        const newEnd = newStart + dur;
        onResizeMarker?.(markerId, { startFrame: newStart, endFrame: newEnd });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (!moved) onSelectMarker?.(markerId);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [durationFrames, markers, onResizeMarker, onSelectMarker],
  );
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: LANE_HEIGHT,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
      }}
    >
      {/* Label column with + button */}
      <div
        style={{
          width: LABEL_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          background: 'rgba(0,0,0,0.60)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <button
          data-testid="zoom-add"
          onClick={(e) => {
            e.stopPropagation();
            onAddMarker?.();
          }}
          disabled={!onAddMarker || durationFrames <= 0}
          title="Add zoom marker at playhead"
          style={{
            width: 18,
            height: 18,
            padding: 0,
            border: 'none',
            borderRadius: 3,
            background: 'rgba(255,138,101,0.25)',
            color: 'rgba(255,138,101,0.95)',
            cursor: onAddMarker && durationFrames > 0 ? 'pointer' : 'default',
            fontSize: 13,
            lineHeight: 1,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>
        <span
          style={{
            fontSize: 8,
            fontWeight: 600,
            color: 'rgba(255,138,101,0.70)',
            letterSpacing: '0.04em',
            userSelect: 'none',
          }}
        >
          ZM
        </span>
      </div>

      {/* Marker area */}
      <div ref={markerAreaRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {markers.map((m) => {
          const dur = m.endFrame - m.startFrame;
          if (durationFrames <= 0 || dur <= 0) return null;

          const leftPct = frameToPct(m.startFrame, durationFrames);
          const widthPct = frameToPct(dur, durationFrames);
          const isManual = m.kind === 'manual';
          const selected = m.id === selectedMarkerId;
          const canResize = isManual && !!onResizeMarker;

          const bg = isManual
            ? selected
              ? 'rgba(255,138,101,0.95)'
              : 'rgba(255,138,101,0.70)'
            : 'rgba(108,160,255,0.35)';

          return (
            <div
              key={m.id}
              data-testid="zoom-marker"
              data-marker-kind={m.kind}
              role="button"
              tabIndex={0}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (isManual && onResizeMarker) {
                  startMove(m.id, e);
                } else {
                  onSelectMarker?.(m.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectMarker?.(m.id);
                }
              }}
              title={`${m.kind} · ${Math.round(m.strength * 100)}% · ${m.startFrame}-${m.endFrame}`}
              style={{
                position: 'absolute',
                top: CLIP_TOP,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                minWidth: 4,
                height: CLIP_HEIGHT,
                borderRadius: 4,
                border: selected ? '2px solid rgba(255,255,255,0.90)' : 'none',
                background: bg,
                cursor: isManual ? 'grab' : 'pointer',
                pointerEvents: 'auto',
                zIndex: selected ? 3 : 2,
                boxSizing: 'border-box',
              }}
            >
              {canResize && (
                <>
                  <div
                    data-testid="zoom-marker-resize-start"
                    onPointerDown={(e) => startResize(m.id, 'start', e)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: -3,
                      width: 8,
                      cursor: 'ew-resize',
                      zIndex: 4,
                      background: selected ? 'rgba(255,255,255,0.25)' : 'transparent',
                      borderRadius: 4,
                    }}
                  />
                  <div
                    data-testid="zoom-marker-resize-end"
                    onPointerDown={(e) => startResize(m.id, 'end', e)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      right: -3,
                      width: 8,
                      cursor: 'ew-resize',
                      zIndex: 4,
                      background: selected ? 'rgba(255,255,255,0.25)' : 'transparent',
                      borderRadius: 4,
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── RecordTimelineShell ───────────────────────────────────────────────────── */

export function RecordTimelineShell({
  tracks,
  assets,
  durationFrames,
  fps,
  activeAssetIds,
  selectedAssetId = null,
  onSelectAsset,
  zoomMarkers = [],
  selectedZoomMarkerId = null,
  onAddZoomMarkerAtPlayhead,
  onSelectZoomMarker,
  onResizeZoomMarker,
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

  const isPlaying = useTransportStore((s) => s.isPlaying);

  /* ── DOM refs for imperative playhead needle ───────────────────────────── */

  const needleRef = useRef<HTMLDivElement>(null);
  const needleHandleRef = useRef<HTMLDivElement>(null);
  const lanesContainerRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const displayFrameRef = useRef(transportStore.getState().playheadFrame);

  const effectiveDurationRef = useRef(effectiveDuration);
  useEffect(() => {
    effectiveDurationRef.current = effectiveDuration;
  }, [effectiveDuration]);

  const moveNeedle = useCallback((frame: number) => {
    const pct = frameToPct(frame, effectiveDurationRef.current);
    const left = pctToLeft(pct);
    if (needleRef.current) needleRef.current.style.left = left;
    if (needleHandleRef.current) needleHandleRef.current.style.left = left;
  }, []);

  const syncDisplayedFrame = useCallback(
    (frame: number) => {
      displayFrameRef.current = frame;
      moveNeedle(frame);
      if (timecodeRef.current) {
        timecodeRef.current.textContent = formatTimecode(frame / fps);
      }
    },
    [fps, moveNeedle],
  );

  useEffect(() => {
    syncDisplayedFrame(transportStore.getState().playheadFrame);
  }, [syncDisplayedFrame]);

  useEffect(() => {
    const unsubscribe = transportStore.subscribe((state, prevState) => {
      if (state.playheadFrame === prevState.playheadFrame) return;
      syncDisplayedFrame(state.playheadFrame);
    });
    return unsubscribe;
  }, [syncDisplayedFrame]);

  /* ── toggle ────────────────────────────────────────────────────────────── */

  const togglePlay = useCallback(() => {
    if (effectiveDuration <= 0) return;
    getPlaybackManager().togglePlay();
  }, [effectiveDuration]);

  /* ── Space bar ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (effectiveDuration <= 0) return;
        getPlaybackManager().togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveDuration]);

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
      const playbackManager = getPlaybackManager();
      playbackManager.pause();

      const frame = frameFromClientX(e.clientX);
      playbackManager.seekToFrame(frame);
      syncDisplayedFrame(frame);

      const onMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const f = frameFromClientX(ev.clientX);
        playbackManager.seekToFrame(f);
        syncDisplayedFrame(f);
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

  const totalHeight = Math.max((tracks.length + 1) * LANE_HEIGHT, LANE_HEIGHT * 2);

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
          ref={timecodeRef}
          style={{
            fontSize: 11,
            fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.50)',
            userSelect: 'none',
          }}
        >
          {formatTimecode(displayFrameRef.current / fps)}
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
            overflowX: 'hidden',
            overflowY: 'auto',
            background: 'rgba(7,7,7,0.98)',
            cursor: 'pointer',
            minHeight: Math.min(totalHeight, 170),
          }}
        >
          {/* Lane rows */}
          {/* Zoom track row — FIRST row, above clip tracks for visibility */}
          <ZoomTrackRow
            top={0}
            durationFrames={effectiveDuration}
            markers={zoomMarkers}
            selectedMarkerId={selectedZoomMarkerId}
            onSelectMarker={onSelectZoomMarker}
            onAddMarker={onAddZoomMarkerAtPlayhead}
            onResizeMarker={onResizeZoomMarker}
          />

          {tracks.map((track, i) => {
            const laneTop = (i + 1) * LANE_HEIGHT;
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
                    const isActive =
                      !activeAssetIds?.length || activeAssetIds.includes(clip.assetId);
                    const isSelected = clip.assetId === selectedAssetId;
                    const dimOpacity = isActive ? 0.85 : 0.25;
                    const bg = isVideo
                      ? `linear-gradient(to right, rgba(108,191,255,${dimOpacity}), rgba(27,97,189,${dimOpacity}))`
                      : `linear-gradient(to right, rgba(255,189,110,${dimOpacity}), rgba(221,128,42,${dimOpacity}))`;
                    const label = asset
                      ? (asset.filePath.split('/').pop() ?? asset.filePath)
                      : (clip.name ?? clip.id);

                    return (
                      <div
                        key={clip.id}
                        data-testid="record-timeline-clip"
                        data-asset-id={clip.assetId}
                        data-selected={isSelected ? 'true' : 'false'}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAsset?.(clip.assetId);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectAsset?.(clip.assetId);
                          }
                        }}
                        title={label}
                        style={{
                          position: 'absolute',
                          top: CLIP_TOP,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          height: CLIP_HEIGHT,
                          borderRadius: 4,
                          background: bg,
                          overflow: 'hidden',
                          border: isSelected
                            ? '2px solid rgba(255,255,255,0.9)'
                            : '1px solid rgba(0,0,0,0.18)',
                          boxShadow: isSelected
                            ? '0 0 0 1px rgba(0,0,0,0.55), 0 0 10px rgba(255,255,255,0.12)'
                            : 'none',
                          cursor: 'pointer',
                          pointerEvents: 'auto',
                          boxSizing: 'border-box',
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
                top: 0,
                left: 0,
                right: 0,
                height: LANE_HEIGHT,
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
                left: pctToLeft(frameToPct(displayFrameRef.current, effectiveDuration)),
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
                left: pctToLeft(frameToPct(displayFrameRef.current, effectiveDuration)),
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
