import { formatTimecode } from './project-shape.mjs';

export function NleTransport({
  playheadFrame,
  durationFrames,
  fps,
  isPlaying,
  onTogglePlay,
  onPlayheadFrameChange,
  canSplit,
  onSplit,
}: {
  playheadFrame: number;
  durationFrames: number;
  fps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPlayheadFrameChange: (frame: number) => void;
  canSplit: boolean;
  onSplit: () => void;
}) {
  return (
    <div className="nleTransport" data-ui-region="nle-transport">
      <button
        type="button"
        className="nleTransportButton"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <button
        type="button"
        className="nleTransportButton secondary"
        onClick={() => onPlayheadFrameChange(0)}
        aria-label="Go to start"
        title="Go to start"
      >
        ⏮
      </button>
      <button
        type="button"
        className="nleTransportButton secondary"
        onClick={onSplit}
        disabled={!canSplit}
        aria-label="Split at playhead"
        title="Split at playhead"
      >
        <span aria-hidden="true">✂</span>
        <span className="nleTransportButtonText">Split</span>
      </button>
      <div className="nleTransportTime" aria-live="off">
        <span className="nleTransportTimeCurrent">{formatTimecode(playheadFrame, fps)}</span>
        <span className="nleTransportTimeSep">/</span>
        <span className="nleTransportTimeTotal">{formatTimecode(durationFrames, fps)}</span>
      </div>
    </div>
  );
}
