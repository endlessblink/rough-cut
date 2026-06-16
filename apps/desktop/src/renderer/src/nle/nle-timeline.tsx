import React from 'react';
import { buildTimelineTracks } from './timeline-clips.mjs';
import { addGeneratedAssetToNewTrack, addGeneratedAssetToTrack, canSplitClipById, consumeLastCommandError, moveClipById, removeClipById, reorderTrackById, rightClipIdAfterSplit, rippleTrimClipById, splitClipById, updateTrackById } from './clip-mutations.mjs';
import { TimelineRuler } from './timeline-ruler';
import { NleModeToolbar } from './mode-toolbar';
import { ArrowsVertical, CaretDown, CaretUp, CornersIn, Eye, EyeSlash, LockSimple, Minus, Plus, SpeakerSimpleSlash } from '@phosphor-icons/react';
import type { NleEditMode } from './mode-toolbar';
import { isTypingTarget } from './keyboard.mjs';
import { snapFrameToClipEdges, snapFrameToClipEdgesExcept } from './snap.mjs';
import { createDragSession, timelineInFromPointerFrame, trackIdFromClientY, updateDragSession } from './drag-session.mjs';
import { formatTimecode } from './project-shape.mjs';
import { clipSourceFilePath, filmstripBackground, filmstripTileBucket, pickVisual, waveformBackground, waveformWidthBucket } from './clip-visuals-style.mjs';
import type { ClipVisualMeta } from './clip-visuals-style.mjs';
import { createTrimSession, updateTrimSession } from './trim-session.mjs';
import {
  contentWidthPx,
  frameAtClientX,
  resolvePixelsPerFrame,
  scrollLeftForAnchor,
  scrollLeftForPlayheadFollow,
  snapThresholdFrames,
  stepScrollLeftTowardTarget,
  zoomStep,
} from './timeline-viewport.mjs';
import type { NleProject } from './types';
import type { TrimEdge, TrimSession } from './trim-session.mjs';

export function NleTimeline({
  project,
  playheadFrame,
  durationFrames,
  fps,
  isPlaying = false,
  selectedClipId,
  editMode,
  onEditModeChange,
  onPlayheadFrameChange,
  onSelectedClipChange,
  onProjectChange,
  onSplit,
  topbarExtras,
}: {
  project: NleProject | null;
  playheadFrame: number;
  durationFrames: number;
  fps: number;
  isPlaying?: boolean;
  selectedClipId: string | null;
  editMode: NleEditMode;
  onEditModeChange: (mode: NleEditMode) => void;
  onPlayheadFrameChange: (frame: number) => void;
  onSelectedClipChange: (clipId: string | null) => void;
  onProjectChange?: (next: NleProject) => void;
  onSplit: () => void;
  topbarExtras?: React.ReactNode;
}) {
  // The "bodies column" is the body-only strip (no headers) and the
  // horizontal-scroll container. Inside it, the content strip is sized to
  // durationFrames * pixelsPerFrame; clip/tick/playhead percentages resolve
  // against that zoomed width, so percent positioning stays frame-exact.
  // Click→frame math measures the CONTENT rect (its left edge already
  // accounts for scroll), so clicks land on the right frame at any zoom.
  const bodiesRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const pendingScrollLeftRef = React.useRef<number | null>(null);
  const [trimSession, setTrimSession] = React.useState<TrimSession | null>(null);
  const [dragSession, setDragSession] = React.useState<any | null>(null);
  const [generatedDropTarget, setGeneratedDropTarget] = React.useState<{ trackId: string; valid: boolean } | null>(null);
  // null = fit-to-width (default; first paint matches the pre-zoom layout).
  const [zoomPpf, setZoomPpf] = React.useState<number | null>(null);
  const [viewWidthPx, setViewWidthPx] = React.useState(0);
  // Surfaced command failure (a rejected trim/move used to be silent).
  const [commandError, setCommandError] = React.useState<string | null>(null);
  const commandErrorTimerRef = React.useRef<number | null>(null);
  const pendingPlayheadFrameRef = React.useRef<number | null>(null);
  const pendingPlayheadRafRef = React.useRef<number | null>(null);

  function scheduleGesturePlayheadFrameChange(frame: number) {
    pendingPlayheadFrameRef.current = Math.max(0, frame);
    if (pendingPlayheadRafRef.current !== null) return;
    pendingPlayheadRafRef.current = window.requestAnimationFrame(() => {
      pendingPlayheadRafRef.current = null;
      const nextFrame = pendingPlayheadFrameRef.current;
      pendingPlayheadFrameRef.current = null;
      if (nextFrame !== null) onPlayheadFrameChange(nextFrame);
    });
  }

  function flushGesturePlayheadFrameChange(frame: number | null = pendingPlayheadFrameRef.current) {
    if (pendingPlayheadRafRef.current !== null) {
      window.cancelAnimationFrame(pendingPlayheadRafRef.current);
      pendingPlayheadRafRef.current = null;
    }
    pendingPlayheadFrameRef.current = null;
    if (frame !== null) onPlayheadFrameChange(Math.max(0, frame));
  }

  function flashCommandError(message: string) {
    if (commandErrorTimerRef.current !== null) window.clearTimeout(commandErrorTimerRef.current);
    setCommandError(message);
    commandErrorTimerRef.current = window.setTimeout(() => {
      setCommandError(null);
      commandErrorTimerRef.current = null;
    }, 3200);
  }
  React.useEffect(() => () => {
    if (commandErrorTimerRef.current !== null) window.clearTimeout(commandErrorTimerRef.current);
    if (pendingPlayheadRafRef.current !== null) window.cancelAnimationFrame(pendingPlayheadRafRef.current);
  }, []);

  // Commit helper: a same-reference result is either a benign no-op or a
  // rejected command — consume the error mailbox to tell them apart.
  function commitOrSurface(next: unknown) {
    if (!project || !onProjectChange) return false;
    if (next !== project) {
      onProjectChange(next as unknown as NleProject);
      return true;
    }
    const error = consumeLastCommandError();
    if (error) flashCommandError(error.message);
    return false;
  }

  // --- Captured pointer gestures -------------------------------------------
  // One gesture at a time. setPointerCapture keeps every pointermove/up/
  // cancel on the pressed element (no window-listener leaks), pointercancel
  // aborts without committing, and unmount/project-switch tears the active
  // gesture down so a clip can never get stuck in dragging/trimming state.
  const activeGestureRef = React.useRef<(() => void) | null>(null);

  function beginGesture(
    e: React.PointerEvent<Element>,
    handlers: { onMove?: (ev: PointerEvent) => void; onEnd?: (ev: PointerEvent) => void; onAbort?: () => void },
  ) {
    activeGestureRef.current?.();
    const el = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const handleMove = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) handlers.onMove?.(ev);
    };
    const cleanup = () => {
      el.removeEventListener('pointermove', handleMove);
      el.removeEventListener('pointerup', handleUp);
      el.removeEventListener('pointercancel', handleCancel);
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        // capture already released (or never granted) — nothing to undo
      }
      activeGestureRef.current = null;
    };
    const handleUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      handlers.onEnd?.(ev);
    };
    const handleCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      handlers.onAbort?.();
    };
    activeGestureRef.current = () => {
      cleanup();
      handlers.onAbort?.();
    };
    el.addEventListener('pointermove', handleMove);
    el.addEventListener('pointerup', handleUp);
    el.addEventListener('pointercancel', handleCancel);
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // capture unsupported — element listeners still receive bubbled events
    }
  }

  const projectRefForTeardown = project;
  React.useEffect(() => () => {
    activeGestureRef.current?.();
  }, [projectRefForTeardown]);

  React.useEffect(() => {
    const el = bodiesRef.current;
    if (!el) return;
    const update = () => setViewWidthPx(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pixelsPerFrame = resolvePixelsPerFrame(zoomPpf, viewWidthPx, durationFrames);
  const timelineContentWidth = contentWidthPx(durationFrames, pixelsPerFrame);
  const zoomedIn = zoomPpf !== null && timelineContentWidth > viewWidthPx + 1;
  const trackRows = React.useMemo(() => project ? buildTimelineTracks(project) : [], [project]);
  const playheadFollowContentXRef = React.useRef(0);
  playheadFollowContentXRef.current = Math.max(0, Math.min(durationFrames, playheadFrame)) * pixelsPerFrame;

  // Clip media visuals (filmstrips / waveforms) — one cached strip per
  // source, fetched once and sliced per clip in CSS. Requests are deduped
  // across renders; failures degrade to the flat block (no retry storm).
  const [clipVisuals, setClipVisuals] = React.useState<Record<string, ClipVisualMeta>>({});
  const requestedVisualsRef = React.useRef<Set<string>>(new Set());
  // Unmount guard only. Edits re-run the fetch effect, and naive per-run
  // cancellation dropped strips that resolved mid-edit (split during load →
  // permanently flat clips, since the dedupe set blocked retries).
  const visualsAliveRef = React.useRef(true);
  React.useEffect(() => () => { visualsAliveRef.current = false; }, []);
  React.useEffect(() => {
    requestedVisualsRef.current = new Set();
    setClipVisuals({});
  }, [project?.path]);
  React.useEffect(() => {
    const projectPath = project?.path;
    if (!projectPath) return;
    const bridge = (window as Window & { roughCut?: { getClipVisual?: (payload: Record<string, unknown>) => Promise<ClipVisualMeta> } }).roughCut;
    if (!bridge?.getClipVisual) return;
    for (const track of trackRows) {
      const kind = track.kind === 'audio' ? 'waveform' : track.kind === 'video' ? 'filmstrip' : null;
      if (!kind) continue;
      for (const block of track.blocks) {
        const sourcePath = clipSourceFilePath(project, block.mediaId);
        if (!sourcePath) continue;
        const durationSec = Math.max(1, Number(block.sourceDurationFrames ?? durationFrames) / fps);
        // Resolution follows the zoom bucket so tiles stay ~screen-sized
        // (crisp) instead of squashing a fixed strip into the scale.
        const bucket = kind === 'filmstrip'
          ? filmstripTileBucket(durationSec, fps, pixelsPerFrame)
          : waveformWidthBucket(durationSec, fps, pixelsPerFrame);
        const key = `${kind}:${sourcePath}:${bucket}`;
        if (requestedVisualsRef.current.has(key)) continue;
        requestedVisualsRef.current.add(key);
        const sizing = kind === 'filmstrip' ? { targetTiles: bucket } : { targetWidthPx: bucket };
        bridge.getClipVisual({ projectPath, sourcePath, kind, durationSec, ...sizing })
          .then((meta) => {
            if (visualsAliveRef.current && meta?.url) setClipVisuals((prev) => ({ ...prev, [key]: meta }));
          })
          .catch((error) => {
            // keep the flat block; the key stays "requested" so we don't loop
            console.warn('[nle:clip-visuals] failed', key, String(error));
          });
      }
    }
  }, [project?.path, trackRows, durationFrames, fps, pixelsPerFrame]);

  // Apply anchor-preserving scroll after a zoom re-render, once the content
  // width has actually changed.
  React.useLayoutEffect(() => {
    const el = bodiesRef.current;
    if (!el || pendingScrollLeftRef.current === null) return;
    el.scrollLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
  }, [pixelsPerFrame]);

  React.useEffect(() => {
    const el = bodiesRef.current;
    if (!isPlaying || !el) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let rafId = 0;
    const tick = () => {
      const target = scrollLeftForPlayheadFollow(playheadFollowContentXRef.current, el.scrollLeft, el.clientWidth, timelineContentWidth);
      const next = reducedMotion
        ? target
        : stepScrollLeftTowardTarget(el.scrollLeft, target, { viewWidthPx: el.clientWidth });
      if (Math.abs(next - el.scrollLeft) >= 0.5) el.scrollLeft = next;
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, timelineContentWidth]);

  function applyZoom(direction: 1 | -1, anchorFrame: number, pointerOffsetPx: number | null) {
    const next = zoomStep(pixelsPerFrame, direction, viewWidthPx, durationFrames);
    const nextPpf = resolvePixelsPerFrame(next, viewWidthPx, durationFrames);
    const offset = pointerOffsetPx ?? viewWidthPx / 2;
    pendingScrollLeftRef.current = next === null ? 0 : scrollLeftForAnchor(anchorFrame, nextPpf, offset);
    setZoomPpf(next);
  }

  // Ctrl/Cmd+wheel zooms toward the cursor. Native listener because React
  // attaches wheel passively and preventDefault would be ignored.
  React.useEffect(() => {
    const el = bodiesRef.current;
    if (!el) return;
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const content = contentRef.current;
      const container = bodiesRef.current;
      if (!content || !container) return;
      const anchorFrame = frameAtClientX(e.clientX, content.getBoundingClientRect().left, pixelsPerFrame, durationFrames);
      applyZoom(e.deltaY < 0 ? 1 : -1, anchorFrame, e.clientX - container.getBoundingClientRect().left);
    }
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  });

  function frameFromClientX(clientX: number, snap: boolean, excludeClipId: string | null = null): number {
    const el = contentRef.current;
    if (!el || durationFrames <= 0 || pixelsPerFrame <= 0) return 0;
    const frame = frameAtClientX(clientX, el.getBoundingClientRect().left, pixelsPerFrame, durationFrames);
    if (!snap || !project) return frame;
    const threshold = snapThresholdFrames(pixelsPerFrame);
    return excludeClipId
      ? snapFrameToClipEdgesExcept(frame, project, threshold, excludeClipId)
      : snapFrameToClipEdges(frame, project, threshold);
  }

  // Pointer-drag scrub. Pointer capture keeps the drag alive when the
  // cursor leaves the bodies area; pointercancel simply ends it.
  function startScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    // Clip clicks select, not scrub — bail when the press lands on a clip.
    if (target?.closest('[data-clip-id]')) return;
    e.preventDefault();
    onSelectedClipChange(null);
    onPlayheadFrameChange(frameFromClientX(e.clientX, true));
    beginGesture(e, {
      onMove: (ev) => onPlayheadFrameChange(frameFromClientX(ev.clientX, true)),
    });
  }

  function startTrim(e: React.PointerEvent<HTMLButtonElement>, blockId: string | null, edge: TrimEdge) {
    if (e.button !== 0 || !project || !blockId || !onProjectChange) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectedClipChange(blockId);
    let latestFrame = frameFromClientX(e.clientX, true);
    let latestSession = createTrimSession(project, blockId, edge, latestFrame, durationFrames);
    if (!latestSession) return;
    setTrimSession(latestSession);
    beginGesture(e, {
      onMove: (ev) => {
        latestFrame = frameFromClientX(ev.clientX, true);
        latestSession = updateTrimSession(latestSession, latestFrame);
        setTrimSession(latestSession);
        scheduleGesturePlayheadFrameChange(latestFrame);
      },
      onEnd: () => {
        setTrimSession(null);
        const commitFrame = latestSession?.snapFrame ?? latestFrame;
        flushGesturePlayheadFrameChange(commitFrame);
        commitOrSurface(rippleTrimClipById(project, blockId, edge, commitFrame));
      },
      onAbort: () => {
        setTrimSession(null);
        flushGesturePlayheadFrameChange(null);
      },
    });
  }

  // A press on a clip selects immediately; a MOVE beyond the threshold
  // starts the drag session. A plain click (jitter included) never commits
  // a move — at fit zoom on a long timeline, 2px of jitter used to move the
  // clip a full second (reproduced by scripts/visual-nle-clips-playwright.mjs).
  const DRAG_THRESHOLD_PX = 4;

  // Blade mode: a press on a clip cuts it at the cursor frame — no prior
  // selection needed, no drag. Exact position (unsnapped) so the cut lands
  // where the user pointed.
  function bladeClipAt(e: React.PointerEvent<HTMLDivElement>, blockId: string) {
    if (!project) return;
    const frame = frameFromClientX(e.clientX, false);
    if (!canSplitClipById(project, blockId, frame)) {
      flashCommandError('Place the blade inside a clip to cut.');
      return;
    }
    const next = splitClipById(project, blockId, frame);
    if (commitOrSurface(next)) {
      onSelectedClipChange(rightClipIdAfterSplit(next, blockId, frame));
    }
  }

  function startClipDrag(e: React.PointerEvent<HTMLDivElement>, blockId: string | null) {
    if (e.button !== 0 || !project || !blockId || !onProjectChange) return;
    if ((e.target as HTMLElement | null)?.closest('.nleClipTrimHandle')) return;
    e.preventDefault();
    e.stopPropagation();
    if (editMode === 'blade') {
      bladeClipAt(e, blockId);
      return;
    }
    onSelectedClipChange(blockId);
    const downX = e.clientX;
    const downY = e.clientY;
    let latestSession: any = null;
    beginGesture(e, {
      onMove: (ev) => {
        if (!latestSession) {
          if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < DRAG_THRESHOLD_PX) return;
          latestSession = createDragSession(project, blockId, frameFromClientX(downX, false), durationFrames);
          if (!latestSession) return;
        }
        const rawPointerFrame = frameFromClientX(ev.clientX, false);
        const rawTimelineIn = timelineInFromPointerFrame(latestSession, rawPointerFrame);
        const snappedTimelineIn = frameFromClientXForDragLeft(rawTimelineIn, blockId);
        const targetTrackId = trackIdFromClientY(ev.clientY) ?? latestSession.targetTrackId;
        latestSession = updateDragSession(latestSession, project, { timelineIn: snappedTimelineIn, targetTrackId });
        setDragSession(latestSession);
        scheduleGesturePlayheadFrameChange(snappedTimelineIn);
      },
      onEnd: () => {
        setDragSession(null);
        if (!latestSession) return; // pure click — selection already happened
        flushGesturePlayheadFrameChange(latestSession.preview.timelineIn);
        if (!latestSession.valid) {
          if (latestSession.invalidReason) flashCommandError(`Cannot drop clip here (${latestSession.invalidReason}).`);
          return;
        }
        commitOrSurface(moveClipById(project, blockId, latestSession.preview.timelineIn, latestSession.preview.trackId));
        onSelectedClipChange(blockId);
      },
      onAbort: () => {
        setDragSession(null);
        flushGesturePlayheadFrameChange(null);
      },
    });
  }

  function frameFromClientXForDragLeft(frame: number, clipId: string): number {
    if (!project || pixelsPerFrame <= 0) return frame;
    return snapFrameToClipEdgesExcept(frame, project, snapThresholdFrames(pixelsPerFrame), clipId);
  }

  function commitTrackPatch(trackId: string, patch: Record<string, unknown>) {
    if (!project || !onProjectChange) return;
    const next = updateTrackById(project, trackId, patch);
    if (next !== project) onProjectChange(next as unknown as NleProject);
  }

  function commitTrackReorder(trackId: string, direction: 'up' | 'down') {
    if (!project || !onProjectChange) return;
    const next = reorderTrackById(project, trackId, direction);
    if (next !== project) onProjectChange(next as unknown as NleProject);
  }

  function nextTrackHeight(track: { height?: number }) {
    const current = Number(track.height ?? 60);
    if (current < 52) return 60;
    if (current < 72) return 84;
    return 44;
  }

  function generatedAssetFromDrag(event: React.DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData('application/x-rough-cut-ai-asset');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { id?: string; kind?: string } & Record<string, unknown>;
    } catch {
      return null;
    }
  }

  function isGeneratedAssetCompatible(asset: { kind?: string } | null, track: { kind: string; locked?: boolean }) {
    if (!asset || track.locked) return false;
    if (asset.kind === 'audio') return track.kind === 'audio';
    if (asset.kind === 'image' || asset.kind === 'video') return track.kind === 'video';
    if (asset.kind === 'motion-graphics') return track.kind === 'motion-graphics';
    return false;
  }

  function handleGeneratedDragOver(event: React.DragEvent<HTMLDivElement>, track: { id: string; kind: string; locked?: boolean }) {
    // HTML5 DnD must not interleave with an active pointer gesture.
    if (activeGestureRef.current) return;
    const asset = generatedAssetFromDrag(event);
    if (!asset) return;
    const valid = isGeneratedAssetCompatible(asset, track);
    event.preventDefault();
    event.dataTransfer.dropEffect = valid ? 'copy' : 'none';
    setGeneratedDropTarget({ trackId: track.id, valid });
  }

  function handleGeneratedDrop(event: React.DragEvent<HTMLDivElement>, track: { id: string; kind: string; locked?: boolean }) {
    if (activeGestureRef.current) return;
    const asset = generatedAssetFromDrag(event);
    setGeneratedDropTarget(null);
    if (!project || !onProjectChange || !asset || !isGeneratedAssetCompatible(asset, track)) return;
    event.preventDefault();
    commitOrSurface(addGeneratedAssetToTrack(project, asset, track.id, frameFromClientX(event.clientX, true)));
  }

  // Ghost channels: empty V/A lanes below the real tracks (the deck reads as
  // a multi-track editor, not dead space). Dropping media onto one creates
  // the track and places the clip in a single commit.
  function handleGhostDragOver(event: React.DragEvent<HTMLDivElement>, kind: 'video' | 'audio') {
    if (activeGestureRef.current) return;
    const asset = generatedAssetFromDrag(event);
    if (!asset) return;
    const valid = isGeneratedAssetCompatible(asset, { kind, locked: false });
    event.preventDefault();
    event.dataTransfer.dropEffect = valid ? 'copy' : 'none';
    setGeneratedDropTarget({ trackId: `ghost-${kind}`, valid });
  }

  function handleGhostDrop(event: React.DragEvent<HTMLDivElement>, kind: 'video' | 'audio') {
    if (activeGestureRef.current) return;
    const asset = generatedAssetFromDrag(event);
    setGeneratedDropTarget(null);
    if (!project || !onProjectChange || !asset || !isGeneratedAssetCompatible(asset, { kind, locked: false })) return;
    event.preventDefault();
    commitOrSurface(addGeneratedAssetToNewTrack(project, asset, kind, frameFromClientX(event.clientX, true)));
  }

  // Keyboard: Delete removes selection, S splits selection at playhead.
  // Bail when the user is typing into a form field.
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (!project) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        const next = removeClipById(project, selectedClipId);
        if (next !== project && onProjectChange) {
          onProjectChange(next as unknown as NleProject);
          onSelectedClipChange(null);
        }
      } else if ((e.key === 's' || e.key === 'S') && selectedClipId) {
        e.preventDefault();
        onSplit();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [project, selectedClipId, onProjectChange, onSelectedClipChange, onSplit]);

  const playheadPct =
    durationFrames > 0 ? Math.max(0, Math.min(100, (playheadFrame / durationFrames) * 100)) : 0;
  // Resolve-style track tags: video numbered bottom-up (V1 is the bottom
  // video lane), other kinds top-down. Rows arrive top-track-first.
  const trackTags = React.useMemo(() => {
    const tags = new Map<string, string>();
    const byKind: Record<string, string[]> = {};
    for (const track of trackRows) {
      (byKind[track.kind] ??= []).push(track.id);
    }
    for (const [kind, ids] of Object.entries(byKind)) {
      const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : kind === 'captions' ? 'C' : 'M';
      ids.forEach((id, index) => {
        tags.set(id, `${prefix}${kind === 'video' ? ids.length - index : index + 1}`);
      });
    }
    return tags;
  }, [trackRows.map((track) => `${track.kind}:${track.id}`).join('|')]);
  // One empty channel per kind keeps the deck reading as a multi-track
  // editor and gives drops a target that creates the track on demand.
  const ghostChannels: ReadonlyArray<{ kind: 'video' | 'audio'; tag: string; label: string }> = trackRows.length === 0
    ? []
    : [
        { kind: 'video', tag: `V${trackRows.filter((track) => track.kind === 'video').length + 1}`, label: 'Video' },
        { kind: 'audio', tag: `A${trackRows.filter((track) => track.kind === 'audio').length + 1}`, label: 'Audio' },
      ];
  const selectedBlock = trackRows.flatMap((track) => track.blocks.map((block) => ({ ...block, trackLabel: track.label, trackKind: track.kind }))).find((block) => block.id === selectedClipId) ?? null;

  function edgeLimitState(block: { sourceIn?: number | null; sourceOut?: number | null; sourceDurationFrames?: number | null }, edge: 'left' | 'right') {
    if (edge === 'left') return Number(block.sourceIn) <= 0 ? 'source-start' : 'free';
    const sourceOut = Number(block.sourceOut);
    const duration = Number(block.sourceDurationFrames);
    return Number.isFinite(sourceOut) && Number.isFinite(duration) && sourceOut >= duration ? 'source-end' : 'free';
  }

  return (
    <div className="nleTimeline" data-ui-region="nle-timeline">
      <div className="nleTimelineTopbar">
        <div className="nleTimelineTitle">
          <p className="eyebrow">Sequence</p>
          <strong>{selectedBlock ? `${selectedBlock.trackLabel} clip` : 'Timeline'}</strong>
        </div>
        <NleModeToolbar mode={editMode} onModeChange={onEditModeChange} />
        <span className="nleToolbarSep" aria-hidden="true" />
        <span className="nleTimecode" aria-label="Playhead timecode">
          {formatTimecode(playheadFrame, fps)}
          <i> / {formatTimecode(durationFrames, fps)}</i>
        </span>
        {commandError ? (
          <span className="nleCommandError" role="alert">{commandError}</span>
        ) : null}
        <div className="nleTimelineZoom" role="group" aria-label="Timeline zoom">
          <button
            type="button"
            aria-label="Zoom timeline out"
            disabled={!zoomedIn}
            onClick={() => applyZoom(-1, playheadFrame, null)}
          >
            <Minus aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom timeline in"
            onClick={() => applyZoom(1, playheadFrame, null)}
          >
            <Plus aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Fit timeline"
            disabled={!zoomedIn}
            onClick={() => {
              pendingScrollLeftRef.current = 0;
              setZoomPpf(null);
            }}
          >
            <CornersIn aria-hidden="true" />
          </button>
        </div>
        {topbarExtras}
      </div>
      <div className="nleTimelineLanes">
        <div className="nleLaneHeaders">
          <div className="nleTimelineRulerSpacer" />
          {trackRows.length === 0 ? (
            <div className="nleTrackLaneHeader empty" data-track-kind="empty">
              Empty
            </div>
          ) : trackRows.map((track) => (
            <div key={track.id} className="nleTrackLaneHeader" data-track-kind={track.kind} data-track-disabled={track.enabled ? undefined : 'true'} style={{ '--nle-track-height': `${track.height}px` } as React.CSSProperties}>
              <span className="nleTrackTag">{trackTags.get(track.id) ?? track.kind.charAt(0).toUpperCase()}</span>
              <span className="nleTrackLaneLabel" title={track.label}>{track.label}</span>
              <span className="nleTrackControls">
                {/* Reorder + height are secondary: revealed on hover/focus so
                    the track name keeps its room (mockup grammar). */}
                <span className="nleTrackControlsSecondary">
                  <button type="button" aria-label={`Move ${track.label} up`} title="Move track up" onClick={() => commitTrackReorder(track.id, 'up')}><CaretUp aria-hidden="true" /></button>
                  <button type="button" aria-label={`Move ${track.label} down`} title="Move track down" onClick={() => commitTrackReorder(track.id, 'down')}><CaretDown aria-hidden="true" /></button>
                  <button type="button" aria-label={`Cycle ${track.label} height`} title="Cycle track height" onClick={() => commitTrackPatch(track.id, { height: nextTrackHeight(track) })}><ArrowsVertical aria-hidden="true" /></button>
                </span>
                <button type="button" aria-label={`${track.enabled ? 'Hide' : 'Show'} ${track.label}`} aria-pressed={!track.enabled} title={track.enabled ? 'Hide track' : 'Show track'} onClick={() => commitTrackPatch(track.id, { enabled: !track.enabled })}>{track.enabled ? <Eye aria-hidden="true" /> : <EyeSlash aria-hidden="true" />}</button>
                <button type="button" aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.label}`} aria-pressed={track.locked} title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => commitTrackPatch(track.id, { locked: !track.locked })}><LockSimple aria-hidden="true" /></button>
                {track.kind === 'audio' ? <button type="button" aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.label}`} aria-pressed={track.muted} title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => commitTrackPatch(track.id, { muted: !track.muted })}><SpeakerSimpleSlash aria-hidden="true" /></button> : null}
              </span>
            </div>
          ))}
          {ghostChannels.map((ghost) => (
            <div key={`ghost-head-${ghost.kind}`} className="nleTrackLaneHeader ghost" data-track-kind={ghost.kind}>
              <span className="nleTrackTag">{ghost.tag}</span>
              <span className="nleTrackLaneLabel">{ghost.label}</span>
            </div>
          ))}
        </div>
        <div
          ref={bodiesRef}
          className="nleLaneBodies"
          data-ui-region="nle-lane-bodies"
          data-edit-mode={editMode}
          data-zoomed={zoomedIn ? 'true' : undefined}
          onPointerDown={startScrub}
        >
          <div
            ref={contentRef}
            className="nleLaneContent"
            style={timelineContentWidth > 0 ? { width: `${timelineContentWidth}px` } : undefined}
          >
          <TimelineRuler
            bodiesRef={contentRef}
            durationFrames={durationFrames}
            fps={fps}
            onSeekFrame={(clientX) => onPlayheadFrameChange(frameFromClientX(clientX, true))}
          />
          {trackRows.length === 0 ? (
            <div className="nleTrackLaneBody empty" data-track-kind="empty">
              <span className="nleTrackLaneEmpty">Import media or generate an asset to start building the timeline</span>
            </div>
          ) : trackRows.map((track) => (
            <div
              key={track.id}
              className={`nleTrackLaneBody ${generatedDropTarget?.trackId === track.id ? generatedDropTarget.valid ? 'generatedDropValid' : 'generatedDropInvalid' : ''}`}
              data-track-kind={track.kind}
              data-track-id={track.id}
              style={{ '--nle-track-height': `${track.height}px` } as React.CSSProperties}
              onDragOver={(event) => handleGeneratedDragOver(event, track)}
              onDragLeave={() => setGeneratedDropTarget((target) => target?.trackId === track.id ? null : target)}
              onDrop={(event) => handleGeneratedDrop(event, track)}
            >
              {track.blocks.length === 0 ? (
                <span className="nleTrackLaneEmpty">No clips yet</span>
              ) : (
                track.blocks.map((block, index) => {
                  const selected = block.id !== null && block.id === selectedClipId;
                  const trimPreview = block.id !== null ? (trimSession?.previews?.[block.id] ?? null) : null;
                  const dragPreview = block.id !== null && block.id === dragSession?.clipId ? dragSession.preview : null;
                  const activePreview = trimPreview ?? (dragPreview?.trackId === track.id ? dragPreview : null);
                  const isDraggingSource = dragPreview && dragPreview.trackId !== track.id;
                  const leftPct = activePreview && durationFrames > 0 ? Math.max(0, Math.min(100, (activePreview.timelineIn / durationFrames) * 100)) : block.leftPct;
                  const widthPct = activePreview && durationFrames > 0 ? Math.max(0, Math.min(100 - leftPct, ((activePreview.timelineOut - activePreview.timelineIn) / durationFrames) * 100)) : block.widthPct;
                  const leftLimit = edgeLimitState(block, 'left');
                  const rightLimit = edgeLimitState(block, 'right');
                  return (
                    <div
                      key={block.id ?? `${track.id}-${index}`}
                      className={`nleClipBlock ${block.enabled && track.enabled ? '' : 'disabled'} ${selected ? 'selected' : ''} ${trimPreview ? 'trimming' : ''} ${dragPreview ? 'dragging' : ''} ${isDraggingSource ? 'draggingSource' : ''} ${dragSession?.invalidReason ? 'invalidDrop' : ''}`}
                      data-clip-id={block.id ?? ''}
                      data-asset-id={block.assetId ?? ''}
                      data-timeline-in={Math.round(block.timelineIn)}
                      data-timeline-out={Math.round(block.timelineOut)}
                      data-selected={selected ? 'true' : undefined}
                      data-trim-edge={block.id === trimSession?.clipId ? trimSession?.edge : undefined}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={block.name ?? undefined}
                      onPointerDown={(e) => startClipDrag(e, block.id)}
                    >
                      {selected && editMode !== 'blade' ? (
                        <button
                          type="button"
                          role="slider"
                          className="nleClipTrimHandle left"
                          data-edge-limit={leftLimit}
                          aria-label="Trim selected clip start"
                          title={leftLimit === 'source-start' ? 'Start of source: drag right to trim, cannot extend left' : 'Trim clip start'}
                          aria-valuemin={0}
                          aria-valuemax={Math.max(0, block.timelineOut - 1)}
                          aria-valuenow={Math.round(trimPreview?.timelineIn ?? block.timelineIn)}
                          onPointerDown={(e) => startTrim(e, block.id, 'left')}
                        />
                      ) : null}
                      {(() => {
                        const visualKind = track.kind === 'audio' ? 'waveform' : track.kind === 'video' ? 'filmstrip' : null;
                        if (!visualKind) return null;
                        const sourcePath = clipSourceFilePath(project, block.mediaId);
                        if (!sourcePath) return null;
                        const blockDurationSec = Math.max(1, Number(block.sourceDurationFrames ?? durationFrames) / fps);
                        const bucket = visualKind === 'filmstrip'
                          ? filmstripTileBucket(blockDurationSec, fps, pixelsPerFrame)
                          : waveformWidthBucket(blockDurationSec, fps, pixelsPerFrame);
                        const meta = pickVisual(clipVisuals, visualKind, sourcePath, bucket);
                        if (!meta) return null;
                        // Live-slide the strip while trimming the left edge.
                        const liveSourceIn = (trimPreview as { sourceIn?: number } | null)?.sourceIn ?? block.sourceIn ?? 0;
                        const view = { sourceInFrames: liveSourceIn, fps, pixelsPerFrame };
                        const style = visualKind === 'filmstrip' ? filmstripBackground(meta, view) : waveformBackground(meta, view);
                        return style ? <span className={`nleClipMedia ${visualKind}`} style={style as React.CSSProperties} aria-hidden="true" /> : null;
                      })()}
                      <span className="nleClipBlockBody" aria-hidden="true" />
                      <span className="nleClipNameBar" aria-hidden="true" />
                      <span className="nleClipBlockLabel">{block.name ?? 'Clip'}</span>
                      {selected && editMode !== 'blade' ? (
                        <button
                          type="button"
                          role="slider"
                          className="nleClipTrimHandle right"
                          data-edge-limit={rightLimit}
                          aria-label="Trim selected clip end"
                          title={rightLimit === 'source-end' ? 'End of source: drag left to trim, cannot extend right' : 'Trim clip end'}
                          aria-valuemin={block.timelineIn + 1}
                          aria-valuemax={durationFrames}
                          aria-valuenow={Math.round(trimPreview?.timelineOut ?? block.timelineOut)}
                          onPointerDown={(e) => startTrim(e, block.id, 'right')}
                        />
                      ) : null}
                    </div>
                  );
                })
              )}
              {dragSession?.preview.trackId === track.id && !track.blocks.some((block) => block.id === dragSession.clipId) ? (
                <div
                  className={`nleClipBlock selected dragging ${dragSession.valid ? '' : 'invalidDrop'}`}
                  data-clip-id={dragSession.clipId}
                  style={{
                    left: `${Math.max(0, Math.min(100, (dragSession.preview.timelineIn / durationFrames) * 100))}%`,
                    width: `${Math.max(0, Math.min(100, ((dragSession.preview.timelineOut - dragSession.preview.timelineIn) / durationFrames) * 100))}%`,
                  }}
                >
                  <span className="nleClipBlockLabel">Clip</span>
                </div>
              ) : null}
            </div>
          ))}
          {ghostChannels.map((ghost) => (
            <div
              key={`ghost-body-${ghost.kind}`}
              className={`nleTrackLaneBody ghost ${generatedDropTarget?.trackId === `ghost-${ghost.kind}` ? generatedDropTarget.valid ? 'generatedDropValid' : 'generatedDropInvalid' : ''}`}
              data-track-kind={ghost.kind}
              data-track-id={`ghost-${ghost.kind}`}
              onDragOver={(event) => handleGhostDragOver(event, ghost.kind)}
              onDragLeave={() => setGeneratedDropTarget((target) => target?.trackId === `ghost-${ghost.kind}` ? null : target)}
              onDrop={(event) => handleGhostDrop(event, ghost.kind)}
            >
              <span className="nleTrackLaneEmpty">Drop to create {ghost.label.toLowerCase()} track</span>
            </div>
          ))}
          <div
            className="nlePlayhead"
            style={{ left: `${playheadPct}%` }}
            aria-hidden="true"
          />
          </div>
        </div>
      </div>
    </div>
  );
}
