import React from 'react';
import { buildTimelineTracks } from './timeline-clips.mjs';
import { removeClipById, trimClipById } from './clip-mutations.mjs';
import { TimelineRuler } from './timeline-ruler';
import { isTypingTarget } from './keyboard.mjs';
import { snapFrameToClipEdges } from './snap.mjs';
import type { NleProject } from './types';

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

  function frameFromClientX(clientX: number, snap: boolean): number {
    const el = bodiesRef.current;
    if (!el || durationFrames <= 0) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const frame = Math.round(ratio * durationFrames);
    return snap && project ? snapFrameToClipEdges(frame, project, 6 * (durationFrames / rect.width)) : frame;
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

  function startTrim(e: React.PointerEvent<HTMLButtonElement>, blockId: string | null, edge: 'left' | 'right') {
    if (e.button !== 0 || !project || !blockId || !onProjectChange) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectedClipChange(blockId);
    let latestFrame = frameFromClientX(e.clientX, false);
    const handleMove = (ev: PointerEvent) => {
      latestFrame = frameFromClientX(ev.clientX, false);
      onPlayheadFrameChange(latestFrame);
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      const next = trimClipById(project, blockId, edge, latestFrame);
      if (next !== project) {
        onProjectChange(next as unknown as NleProject);
      }
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
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
        <div className="nleLaneHeaders" aria-hidden="true">
          <div className="nleTimelineRulerSpacer" />
          {trackRows.length === 0 ? (
            <div className="nleTrackLaneHeader empty" data-track-kind="empty">
              Empty
            </div>
          ) : trackRows.map((track) => (
            <div key={track.id} className="nleTrackLaneHeader" data-track-kind={track.kind}>
              <span>{track.label}</span>
              <span className="nleTrackLaneMeta">
                {track.locked ? 'LOCKED' : track.muted ? 'MUTED' : track.enabled ? track.kind : 'OFF'}
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
            <div key={track.id} className="nleTrackLaneBody" data-track-kind={track.kind}>
              {track.blocks.length === 0 ? (
                <span className="nleTrackLaneEmpty">No clips yet</span>
              ) : (
                track.blocks.map((block, index) => {
                  const selected = block.id !== null && block.id === selectedClipId;
                  return (
                    <div
                      key={block.id ?? `${track.id}-${index}`}
                      className={`nleClipBlock ${block.enabled && track.enabled ? '' : 'disabled'} ${selected ? 'selected' : ''}`}
                      data-clip-id={block.id ?? ''}
                      data-asset-id={block.assetId ?? ''}
                      style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%` }}
                      title={block.name ?? undefined}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => handleClipClick(e, block.id)}
                    >
                      {selected ? (
                        <button
                          type="button"
                          className="nleClipTrimHandle left"
                          aria-label="Trim selected clip start"
                          onPointerDown={(e) => startTrim(e, block.id, 'left')}
                        />
                      ) : null}
                      <span className="nleClipBlockLabel">{block.name ?? 'Clip'}</span>
                      {selected ? (
                        <button
                          type="button"
                          className="nleClipTrimHandle right"
                          aria-label="Trim selected clip end"
                          onPointerDown={(e) => startTrim(e, block.id, 'right')}
                        />
                      ) : null}
                    </div>
                  );
                })
              )}
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
