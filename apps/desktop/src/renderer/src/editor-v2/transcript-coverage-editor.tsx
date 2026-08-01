import React from 'react';
import {
  transcriptCoverageBlockIndexAtFrame,
  type TranscriptCoverageBlock,
} from './transcript-coverage.mjs';

type Selection = { anchor: number; focus: number };

export function TranscriptCoverageEditor({
  blocks,
  fps,
  playheadFrame,
  onSeek,
  onPlayingChange,
  onCorrectText,
  onRemove,
}: {
  blocks: readonly TranscriptCoverageBlock[];
  fps: number;
  playheadFrame: number;
  onSeek: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onCorrectText: () => void;
  onRemove: (blocks: readonly TranscriptCoverageBlock[]) => void;
}) {
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [previewRange, setPreviewRange] = React.useState<{
    startFrame: number;
    endFrame: number;
    started: boolean;
  } | null>(null);
  const dragging = React.useRef(false);
  const activeBlockRef = React.useRef<HTMLButtonElement | null>(null);
  const activeBlockIndex = transcriptCoverageBlockIndexAtFrame(blocks, playheadFrame);
  const selectedRange = selection
    ? {
        start: Math.min(selection.anchor, selection.focus),
        end: Math.max(selection.anchor, selection.focus),
      }
    : null;
  const selectedBlocks = selectedRange
    ? blocks.slice(selectedRange.start, selectedRange.end + 1)
    : [];
  const selectedStart = selectedBlocks[0]?.startFrame ?? null;
  const selectedEnd = selectedBlocks.at(-1)?.endFrame ?? null;
  const pauseCount = blocks.filter((block) => block.kind === 'pause').length;
  const reviewCount = blocks.filter(
    (block) => block.kind === 'unrecognized',
  ).length;

  React.useEffect(() => {
    const stopDragging = () => {
      dragging.current = false;
    };
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

  React.useEffect(() => setSelection(null), [blocks]);
  React.useLayoutEffect(() => {
    activeBlockRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeBlockIndex]);
  React.useEffect(() => {
    if (!previewRange) return;
    if (
      !previewRange.started &&
      playheadFrame >= previewRange.startFrame &&
      playheadFrame < previewRange.endFrame
    ) {
      setPreviewRange({ ...previewRange, started: true });
      return;
    }
    if (previewRange.started && playheadFrame >= previewRange.endFrame) {
      onPlayingChange(false);
      setPreviewRange(null);
    }
  }, [onPlayingChange, playheadFrame, previewRange]);

  const playRange = React.useCallback(
    (startFrame: number, endFrame: number) => {
      setPreviewRange({ startFrame, endFrame, started: false });
      onSeek(startFrame);
      onPlayingChange(true);
    },
    [onPlayingChange, onSeek],
  );

  return (
    <section
      className="ev2TranscriptCoverageEditor"
      aria-label="Edit the full recording from its transcript"
      data-coverage-blocks={blocks.length}
      data-unrecognized-blocks={reviewCount}
    >
      <header className="ev2TranscriptCoverageHeader">
        <div>
          <strong>Edit the full recording</strong>
          <span>
            Every interval is selectable. Words, pauses, and audio that needs
            review all stay on the timeline.
          </span>
        </div>
        <button type="button" onClick={onCorrectText}>
          Correct words
        </button>
      </header>
      <div className="ev2TranscriptCoverageSummary" aria-live="polite">
        <span>{pauseCount.toLocaleString()} pauses</span>
        <span className={reviewCount > 0 ? 'needsReview' : undefined}>
          {reviewCount.toLocaleString()} audio gaps to review
        </span>
        <span>Click to select · double-click to play · drag across blocks</span>
      </div>
      <div
        className="ev2TranscriptCoverageBlocks"
        dir="rtl"
        role="listbox"
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            (event.key === 'Delete' || event.key === 'Backspace') &&
            selectedBlocks.length > 0
          ) {
            event.preventDefault();
            onRemove(selectedBlocks);
          }
          if (
            event.key === 'Enter' &&
            selectedStart !== null &&
            selectedEnd !== null
          ) {
            event.preventDefault();
            playRange(selectedStart, selectedEnd);
          }
          if (event.key === 'Escape') setSelection(null);
        }}
      >
        {blocks.map((block, index) => {
          const selected =
            selectedRange !== null &&
            index >= selectedRange.start &&
            index <= selectedRange.end;
          const active = index === activeBlockIndex;
          return (
            <button
              ref={active ? activeBlockRef : null}
              key={`${block.kind}:${block.startFrame}:${block.endFrame}:${index}`}
              type="button"
              role="option"
              aria-selected={selected}
              aria-current={active ? 'true' : undefined}
              aria-label={
                block.kind === 'word'
                  ? `Seek to ${block.text}`
                  : `Seek to ${coverageBlockLabel(block, fps)}`
              }
              className={`ev2TranscriptCoverageBlock ${block.kind}`}
              title={coverageBlockTitle(block, fps)}
              data-kind={block.kind}
              data-start-frame={block.startFrame}
              data-end-frame={block.endFrame}
              onPointerDown={(event) => {
                dragging.current = true;
                onPlayingChange(false);
                onSeek(block.startFrame);
                setSelection((current) => ({
                  anchor:
                    event.shiftKey && current ? current.anchor : index,
                  focus: index,
                }));
              }}
              onPointerEnter={() => {
                if (!dragging.current) return;
                setSelection((current) =>
                  current ? { ...current, focus: index } : { anchor: index, focus: index },
                );
              }}
              onDoubleClick={() => {
                playRange(block.startFrame, block.endFrame);
              }}
            >
              {coverageBlockLabel(block, fps)}
            </button>
          );
        })}
      </div>
      <footer className="ev2TranscriptCoverageFooter">
        <span>
          {selectedBlocks.length > 0
            ? `${selectedBlocks.length} block${
                selectedBlocks.length === 1 ? '' : 's'
              } selected · ${formatDuration(
                (selectedEnd ?? 0) - (selectedStart ?? 0),
                fps,
              )}`
            : 'Select anything you want removed from the recording.'}
        </span>
        <div>
          <button
            type="button"
            disabled={selectedStart === null}
            onClick={() => {
              if (selectedStart === null) return;
              playRange(selectedStart, selectedEnd ?? selectedStart + 1);
            }}
          >
            Play selection
          </button>
          <button
            type="button"
            className="danger"
            disabled={selectedBlocks.length === 0}
            onClick={() => onRemove(selectedBlocks)}
          >
            Remove from recording
          </button>
        </div>
      </footer>
    </section>
  );
}

function coverageBlockLabel(block: TranscriptCoverageBlock, fps: number) {
  if (block.kind === 'word') return block.text;
  const duration = formatDuration(block.endFrame - block.startFrame, fps);
  if (block.kind === 'pause') return `Pause ${duration}`;
  if (block.kind === 'music') return `Music ${duration}`;
  if (block.kind === 'noise') return `Noise ${duration}`;
  return `Review audio ${duration}`;
}

function coverageBlockTitle(block: TranscriptCoverageBlock, fps: number) {
  const action = 'Double-click to play · click or drag to select';
  if (block.kind === 'word') {
    return `${block.text} · ${formatDuration(
      block.endFrame - block.startFrame,
      fps,
    )} · ${action}`;
  }
  return `${coverageBlockLabel(block, fps)} · ${action}`;
}

function formatDuration(frames: number, fps: number) {
  const seconds = frames / Math.max(1, fps);
  if (seconds < 1) return `${Math.round(seconds * 1_000)}ms`;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}
