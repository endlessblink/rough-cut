import React from 'react';
import { Scissors as PhosphorScissors, Trash as PhosphorTrash, X as PhosphorX } from '@phosphor-icons/react';
import { captionTextDirection, getCaptions, removeCaption, setActiveCaptionTrack, splitCaption, updateCaption } from '../../shared/captions.mjs';
import { frameRangeToPlacement } from './timeline-rail.mjs';

/** Which subtitle line is selected: shared by the timeline lane and the Captions panel. */
export const CaptionSelectionContext = React.createContext<{ selectedId: string | null; select: (id: string | null) => void }>({
  selectedId: null,
  select: () => undefined,
});

export interface CaptionSection {
  sourceIn: number;
  sourceOut: number;
  timelineIn?: number;
}

/** A line's place on the timeline: through the first clip that still shows part of it. */
export function placeCaption(cue: { startFrame: number; endFrame: number }, sections: CaptionSection[]) {
  const section = sections.find((item) => cue.endFrame > item.sourceIn && cue.startFrame < item.sourceOut);
  if (!section) return null;
  const base = section.timelineIn ?? 0;
  return {
    section,
    startFrame: base + Math.max(0, cue.startFrame - section.sourceIn),
    endFrame: base + Math.min(cue.endFrame, section.sourceOut) - section.sourceIn,
  };
}

/** Source frame under a timeline frame, or null when no clip shows that moment. */
export function sourceFrameAtTimeline(timelineFrame: number, sections: CaptionSection[], fallbackSections = sections) {
  const section = fallbackSections.find((item) => {
    const base = item.timelineIn ?? 0;
    return timelineFrame >= base && timelineFrame < base + (item.sourceOut - item.sourceIn);
  });
  return section ? section.sourceIn + (timelineFrame - (section.timelineIn ?? 0)) : null;
}

type DragMode = 'move' | 'start' | 'end';

export function CaptionsLane({
  document,
  fps,
  durationSec,
  sections,
  playheadFrame,
  onChange,
  onSeek,
  autoFocusId,
  onAutoFocusDone,
}: {
  document: unknown;
  fps: number;
  durationSec: number;
  sections: CaptionSection[];
  playheadFrame: number;
  onChange: (next: unknown) => void;
  onSeek: (frame: number) => void;
  autoFocusId: string | null;
  onAutoFocusDone: () => void;
}) {
  const { selectedId, select } = React.useContext(CaptionSelectionContext);
  const { cues } = getCaptions(document);
  const [preview, setPreview] = React.useState<{ id: string; document: unknown } | null>(null);
  const shownDocument = preview?.document ?? document;
  const shownCues = preview ? getCaptions(shownDocument).cues : cues;

  const placed = shownCues.flatMap((cue) => {
    const spot = placeCaption(cue, sections);
    return spot ? [{ cue, spot }] : [];
  });

  function beginDrag(cue: { id: string; startFrame: number; endFrame: number }, mode: DragMode, event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (event.button !== 0) return;
    select(cue.id);
    const track = (event.currentTarget as HTMLElement).closest('.laneTrack') as HTMLElement | null;
    const width = track?.getBoundingClientRect().width ?? 0;
    const totalFrames = Math.max(1, Math.round(durationSec * fps));
    if (width <= 0) return;
    const startX = event.clientX;
    let moved = false;
    let latest: unknown = document;
    const frameDelta = (clientX: number) => Math.round(((clientX - startX) / width) * totalFrames);
    const move = (moveEvent: PointerEvent) => {
      if (!moved && Math.abs(moveEvent.clientX - startX) < 4) return;
      moved = true;
      const delta = frameDelta(moveEvent.clientX);
      const patch = mode === 'move'
        ? { startFrame: cue.startFrame + delta, endFrame: cue.endFrame + delta }
        : mode === 'start'
          ? { startFrame: cue.startFrame + delta }
          : { endFrame: cue.endFrame + delta };
      latest = updateCaption(document, cue.id, patch);
      setPreview({ id: cue.id, document: latest });
    };
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      setPreview(null);
      if (commit && moved && latest !== document) onChange(latest);
      else if (!moved) {
        const spot = placeCaption(cue, sections);
        if (spot) onSeek(spot.startFrame);
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  const selected = placed.find((item) => item.cue.id === selectedId) ?? null;

  const { tracks, activeTrack } = getCaptions(document);

  // The editor bubble closes on a click anywhere outside it, the subtitle blocks and the caption list.
  React.useEffect(() => {
    if (!selectedId) return undefined;
    // The click that selected (or just added) a line must not close its own bubble: React can run this
    // effect while that very event is still travelling up to the window.
    const armedAt = performance.now();
    const close = (event: PointerEvent) => {
      if (event.timeStamp <= armedAt) return;
      const target = event.target as Element | null;
      if (target?.closest?.('.captionEditorChip, .captionBlock, .captionLaneSwitch, .captionCueList, .captionsPanel')) return;
      select(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [selectedId, select]);

  return (
    <>
      {tracks.length > 1 ? (
        // Always-visible language switch: which caption set shows in the video and the export.
        <div className="captionLaneSwitch" role="group" aria-label="Caption language" onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              aria-pressed={activeTrack === track.id}
              onClick={() => onChange(setActiveCaptionTrack(document, track.id))}
            >
              {track.id === 'original' ? 'As spoken' : track.label}
            </button>
          ))}
        </div>
      ) : null}
      {placed.length === 0 ? <span className="captionsLaneHint" aria-hidden="true">Click here to add a subtitle</span> : null}
      {placed.map(({ cue, spot }) => {
        const placement = frameRangeToPlacement(spot.startFrame, spot.endFrame, fps, durationSec);
        const isSelected = cue.id === selectedId;
        return (
          <div
            key={cue.id}
            role="button"
            tabIndex={0}
            aria-label={`Subtitle: ${cue.text || 'empty'}`}
            className={`captionBlock${isSelected ? ' selectedCaption' : ''}${preview?.id === cue.id ? ' dragging' : ''}`}
            data-caption-id={cue.id}
            style={{ left: `${placement.left}%`, width: `${placement.width}%` }}
            onPointerDown={(event) => beginDrag(cue, 'move', event)}
            onKeyDown={(event) => {
              if ((event.key === 'Delete' || event.key === 'Backspace') && event.target === event.currentTarget) {
                event.preventDefault();
                event.stopPropagation();
                onChange(removeCaption(document, cue.id));
                select(null);
              }
            }}
          >
            <span className="captionBlockText" dir={captionTextDirection(cue.text)}>{cue.text || '…'}</span>
            <span className="captionHandle captionHandleStart" onPointerDown={(event) => beginDrag(cue, 'start', event)} aria-hidden="true" />
            <span className="captionHandle captionHandleEnd" onPointerDown={(event) => beginDrag(cue, 'end', event)} aria-hidden="true" />
          </div>
        );
      })}
      {selected ? (() => {
        const placement = frameRangeToPlacement(selected.spot.startFrame, selected.spot.endFrame, fps, durationSec);
        const canSplit = playheadFrame > selected.spot.startFrame + 6 && playheadFrame < selected.spot.endFrame - 6;
        return (
          <div
            className="captionEditorChip"
            style={{ left: `${Math.min(placement.left, 62)}%` }}
            role="group"
            aria-label="Edit subtitle"
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <input
              key={`${selected.cue.id}:${selected.cue.text}`}
              type="text"
              dir={captionTextDirection(selected.cue.text)}
              className="captionEditorInput"
              defaultValue={selected.cue.text}
              placeholder="Type the subtitle (Hebrew or English)"
              aria-label="Subtitle text"
              autoFocus={autoFocusId === selected.cue.id}
              ref={(input) => { if (input && autoFocusId === selected.cue.id) { input.focus(); onAutoFocusDone(); } }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') { event.currentTarget.value = selected.cue.text; event.currentTarget.blur(); select(null); }
              }}
              onBlur={(event) => {
                const text = event.currentTarget.value;
                if (text !== selected.cue.text) onChange(updateCaption(document, selected.cue.id, { text }));
              }}
            />
            <button
              type="button"
              className="captionEditorButton"
              title="Split at the playhead"
              aria-label="Split subtitle at the playhead"
              disabled={!canSplit}
              onClick={() => {
                const sourceFrame = sourceFrameAtTimeline(playheadFrame, sections);
                if (sourceFrame === null) return;
                const result = splitCaption(document, selected.cue.id, sourceFrame);
                if (result) onChange(result.document);
              }}
            ><PhosphorScissors size={14} weight="duotone" /></button>
            <button
              type="button"
              className="captionEditorButton"
              title="Delete this subtitle"
              aria-label="Delete subtitle"
              onClick={() => { onChange(removeCaption(document, selected.cue.id)); select(null); }}
            ><PhosphorTrash size={14} weight="duotone" /></button>
            <button
              type="button"
              className="captionEditorButton"
              title="Close (Esc)"
              aria-label="Close subtitle editor"
              onClick={() => select(null)}
            ><PhosphorX size={14} weight="bold" /></button>
          </div>
        );
      })() : null}
    </>
  );
}
