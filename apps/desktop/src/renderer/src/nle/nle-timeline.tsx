import React from 'react';
import { NLE_TRACK_LANES } from './asset-format.mjs';
import { buildLaneClips } from './timeline-clips.mjs';
import type { NleLaneClipBlock, NleLaneKind } from './timeline-clips.mjs';
import { removeClipById, splitClipById } from './clip-mutations.mjs';
import { TimelineRuler } from './timeline-ruler';
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
}: {
  project: NleProject | null;
  playheadFrame: number;
  durationFrames: number;
  fps: number;
  selectedClipId: string | null;
  onPlayheadFrameChange: (frame: number) => void;
  onSelectedClipChange: (clipId: string | null) => void;
  onProjectChange?: (next: NleProject) => void;
}) {
  // The "bodies column" is the body-only strip (no headers). Click→frame
  // math measures it directly, so clicks at the visual start of the
  // bodies land on frame 0 without an off-by-header-width error.
  const bodiesRef = React.useRef<HTMLDivElement | null>(null);

  function frameFromClientX(clientX: number): number {
    const el = bodiesRef.current;
    if (!el || durationFrames <= 0) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * durationFrames);
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
    onPlayheadFrameChange(frameFromClientX(e.clientX));
    const handleMove = (ev: PointerEvent) => onPlayheadFrameChange(frameFromClientX(ev.clientX));
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

  // Keyboard: Delete removes selection, S splits selection at playhead.
  // Bail when the user is typing into a form field.
  React.useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return target.isContentEditable;
    }
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
        const next = splitClipById(project, selectedClipId, playheadFrame);
        if (next !== project && onProjectChange) {
          onProjectChange(next as unknown as NleProject);
          onSelectedClipChange(null);
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [project, playheadFrame, selectedClipId, onProjectChange, onSelectedClipChange]);

  const playheadPct =
    durationFrames > 0 ? Math.max(0, Math.min(100, (playheadFrame / durationFrames) * 100)) : 0;

  return (
    <div className="nleTimeline" data-ui-region="nle-timeline">
      <div className="nleTimelineLanes">
        <div className="nleLaneHeaders" aria-hidden="true">
          <div className="nleTimelineRulerSpacer" />
          {NLE_TRACK_LANES.map((lane) => (
            <div key={lane.kind} className="nleTrackLaneHeader" data-track-kind={lane.kind}>
              {lane.label}
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
            onSeekFrame={(clientX) => onPlayheadFrameChange(frameFromClientX(clientX))}
          />
          {NLE_TRACK_LANES.map((lane) => {
            const blocks: NleLaneClipBlock[] = project
              ? buildLaneClips(project, lane.kind as NleLaneKind)
              : [];
            return (
              <div key={lane.kind} className="nleTrackLaneBody" data-track-kind={lane.kind}>
                {blocks.length === 0 ? (
                  <span className="nleTrackLaneEmpty">No clips yet</span>
                ) : (
                  blocks.map((block, index) => {
                    const selected = block.id !== null && block.id === selectedClipId;
                    return (
                      <div
                        key={block.id ?? `${lane.kind}-${index}`}
                        className={`nleClipBlock ${block.enabled ? '' : 'disabled'} ${selected ? 'selected' : ''}`}
                        data-clip-id={block.id ?? ''}
                        data-asset-id={block.assetId ?? ''}
                        style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%` }}
                        title={block.name ?? undefined}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => handleClipClick(e, block.id)}
                      >
                        <span className="nleClipBlockLabel">{block.name ?? 'Clip'}</span>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
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
