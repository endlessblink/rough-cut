import React from 'react';
import { buildTimelineTracks } from './timeline-clips.mjs';
import { moveClipById, removeClipById, reorderTrackById, trimClipById, updateTrackById } from './clip-mutations.mjs';
import { TimelineRuler } from './timeline-ruler';
import { isTypingTarget } from './keyboard.mjs';
import { snapFrameToClipEdges, snapFrameToClipEdgesExcept } from './snap.mjs';
import { createDragSession, timelineInFromPointerFrame, trackIdFromClientY, updateDragSession } from './drag-session.mjs';
import { createTrimSession, updateTrimSession } from './trim-session.mjs';
import type { NleProject } from './types';
import type { TrimEdge, TrimSession } from './trim-session.mjs';

export function NleTimeline({
  project,
  playheadFrame,
  durationFrames,
  fps,
  selectedClipId,
  onPlayheadFrameChange,
  onSelectedClipChange,
  onProjectChange,
  onSplit,
}: {
  project: NleProject | null;
  playheadFrame: number;
  durationFrames: number;
  fps: number;
  selectedClipId: string | null;
  onPlayheadFrameChange: (frame: number) => void;
  onSelectedClipChange: (clipId: string | null) => void;
  onProjectChange?: (next: NleProject) => void;
  onSplit: () => void;
}) {
  // The "bodies column" is the body-only strip (no headers). Click→frame
  // math measures it directly, so clicks at the visual start of the
  // bodies land on frame 0 without an off-by-header-width error.
  const bodiesRef = React.useRef<HTMLDivElement | null>(null);
  const [trimSession, setTrimSession] = React.useState<TrimSession | null>(null);
  const [dragSession, setDragSession] = React.useState<any | null>(null);

  function frameFromClientX(clientX: number, snap: boolean, excludeClipId: string | null = null): number {
    const el = bodiesRef.current;
    if (!el || durationFrames <= 0) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const frame = Math.round(ratio * durationFrames);
    if (!snap || !project) return frame;
    const threshold = 6 * (durationFrames / rect.width);
    return excludeClipId
      ? snapFrameToClipEdgesExcept(frame, project, threshold, excludeClipId)
      : snapFrameToClipEdges(frame, project, threshold);
  }

  // Pointer-drag scrub: install global pointermove/up listeners on
  // pointerdown so drags continue when the cursor leaves the bodies area.
  function startScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    // Clip clicks select, not scrub — bail when the press lands on a clip.
    if (target?.closest('[data-clip-id]')) return;
    e.preventDefault();
    onSelectedClipChange(null);
    onPlayheadFrameChange(frameFromClientX(e.clientX, true));
    const handleMove = (ev: PointerEvent) => onPlayheadFrameChange(frameFromClientX(ev.clientX, true));
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function handleClipClick(e: React.MouseEvent, blockId: string | null) {
    e.stopPropagation();
    if (blockId) onSelectedClipChange(blockId);
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
    const handleMove = (ev: PointerEvent) => {
      latestFrame = frameFromClientX(ev.clientX, true);
      latestSession = updateTrimSession(latestSession, latestFrame);
      setTrimSession(latestSession);
      onPlayheadFrameChange(latestFrame);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setTrimSession(null);
      const commitFrame = latestSession?.snapFrame ?? latestFrame;
      const next = trimClipById(project, blockId, edge, commitFrame);
      if (next !== project) {
        onProjectChange(next as unknown as NleProject);
      }
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function startClipDrag(e: React.PointerEvent<HTMLDivElement>, blockId: string | null) {
    if (e.button !== 0 || !project || !blockId || !onProjectChange) return;
    if ((e.target as HTMLElement | null)?.closest('.nleClipTrimHandle')) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectedClipChange(blockId);
    const initialSession = createDragSession(project, blockId, frameFromClientX(e.clientX, false), durationFrames);
    if (!initialSession) return;
    let latestSession = initialSession;
    setDragSession(latestSession);
    const handleMove = (ev: PointerEvent) => {
      const rawPointerFrame = frameFromClientX(ev.clientX, false);
      const rawTimelineIn = timelineInFromPointerFrame(latestSession, rawPointerFrame);
      const snappedTimelineIn = frameFromClientXForDragLeft(rawTimelineIn, blockId);
      const targetTrackId = trackIdFromClientY(ev.clientY) ?? latestSession.targetTrackId;
      latestSession = updateDragSession(latestSession, project, { timelineIn: snappedTimelineIn, targetTrackId });
      setDragSession(latestSession);
      onPlayheadFrameChange(Math.max(0, snappedTimelineIn));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setDragSession(null);
      if (!latestSession?.valid) return;
      const next = moveClipById(project, blockId, latestSession.preview.timelineIn, latestSession.preview.trackId);
      if (next !== project) onProjectChange(next as unknown as NleProject);
      onSelectedClipChange(blockId);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }

  function frameFromClientXForDragLeft(frame: number, clipId: string): number {
    const el = bodiesRef.current;
    if (!el || !project) return frame;
    const threshold = 6 * (durationFrames / el.getBoundingClientRect().width);
    return snapFrameToClipEdgesExcept(frame, project, threshold, clipId);
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
  const trackRows = project ? buildTimelineTracks(project) : [];

  return (
    <div className="nleTimeline" data-ui-region="nle-timeline">
      <div className="nleTimelineLanes">
        <div className="nleLaneHeaders">
          <div className="nleTimelineRulerSpacer" />
          {trackRows.length === 0 ? (
            <div className="nleTrackLaneHeader empty" data-track-kind="empty">
              Empty
            </div>
          ) : trackRows.map((track) => (
            <div key={track.id} className="nleTrackLaneHeader" data-track-kind={track.kind} style={{ '--nle-track-height': `${track.height}px` } as React.CSSProperties}>
              <span className="nleTrackLaneLabel">{track.label}</span>
              <span className="nleTrackLaneMeta">
                {track.locked ? 'LOCKED' : track.muted ? 'MUTED' : track.enabled ? track.kind : 'OFF'}
              </span>
              <span className="nleTrackControls">
                <button type="button" aria-label={`Move ${track.label} up`} onClick={() => commitTrackReorder(track.id, 'up')}>↑</button>
                <button type="button" aria-label={`Move ${track.label} down`} onClick={() => commitTrackReorder(track.id, 'down')}>↓</button>
                <button type="button" aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.label}`} aria-pressed={track.locked} onClick={() => commitTrackPatch(track.id, { locked: !track.locked })}>L</button>
                {track.kind === 'audio' ? <button type="button" aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.label}`} aria-pressed={track.muted} onClick={() => commitTrackPatch(track.id, { muted: !track.muted })}>M</button> : null}
                <button type="button" aria-label={`Cycle ${track.label} height`} onClick={() => commitTrackPatch(track.id, { height: nextTrackHeight(track) })}>H</button>
              </span>
            </div>
          ))}
        </div>
        <div
          ref={bodiesRef}
          className="nleLaneBodies"
          data-ui-region="nle-lane-bodies"
          onPointerDown={startScrub}
        >
          <TimelineRuler
            bodiesRef={bodiesRef}
            durationFrames={durationFrames}
            fps={fps}
            onSeekFrame={(clientX) => onPlayheadFrameChange(frameFromClientX(clientX, true))}
          />
          {trackRows.length === 0 ? (
            <div className="nleTrackLaneBody empty" data-track-kind="empty">
              <span className="nleTrackLaneEmpty">Import media or generate an asset to start building the timeline</span>
            </div>
          ) : trackRows.map((track) => (
            <div key={track.id} className="nleTrackLaneBody" data-track-kind={track.kind} data-track-id={track.id} style={{ '--nle-track-height': `${track.height}px` } as React.CSSProperties}>
              {track.blocks.length === 0 ? (
                <span className="nleTrackLaneEmpty">No clips yet</span>
              ) : (
                track.blocks.map((block, index) => {
                  const selected = block.id !== null && block.id === selectedClipId;
                  const trimPreview = block.id !== null && block.id === trimSession?.clipId ? trimSession.preview : null;
                  const dragPreview = block.id !== null && block.id === dragSession?.clipId ? dragSession.preview : null;
                  const activePreview = trimPreview ?? (dragPreview?.trackId === track.id ? dragPreview : null);
                  const isDraggingSource = dragPreview && dragPreview.trackId !== track.id;
                  const leftPct = activePreview && durationFrames > 0 ? Math.max(0, Math.min(100, (activePreview.timelineIn / durationFrames) * 100)) : block.leftPct;
                  const widthPct = activePreview && durationFrames > 0 ? Math.max(0, Math.min(100 - leftPct, ((activePreview.timelineOut - activePreview.timelineIn) / durationFrames) * 100)) : block.widthPct;
                  return (
                    <div
                      key={block.id ?? `${track.id}-${index}`}
                      className={`nleClipBlock ${block.enabled && track.enabled ? '' : 'disabled'} ${selected ? 'selected' : ''} ${trimPreview ? 'trimming' : ''} ${dragPreview ? 'dragging' : ''} ${isDraggingSource ? 'draggingSource' : ''} ${dragSession?.invalidReason ? 'invalidDrop' : ''}`}
                      data-clip-id={block.id ?? ''}
                      data-asset-id={block.assetId ?? ''}
                      data-trim-edge={trimPreview ? trimSession?.edge : undefined}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={block.name ?? undefined}
                      onPointerDown={(e) => startClipDrag(e, block.id)}
                      onClick={(e) => handleClipClick(e, block.id)}
                    >
                      {selected ? (
                        <button
                          type="button"
                          role="slider"
                          className="nleClipTrimHandle left"
                          aria-label="Trim selected clip start"
                          aria-valuemin={0}
                          aria-valuemax={Math.max(0, block.timelineOut - 1)}
                          aria-valuenow={Math.round(trimPreview?.timelineIn ?? block.timelineIn)}
                          onPointerDown={(e) => startTrim(e, block.id, 'left')}
                        />
                      ) : null}
                      <span className="nleClipBlockLabel">{block.name ?? 'Clip'}</span>
                      {selected ? (
                        <button
                          type="button"
                          role="slider"
                          className="nleClipTrimHandle right"
                          aria-label="Trim selected clip end"
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
          <div
            className="nlePlayhead"
            style={{ left: `${playheadPct}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
