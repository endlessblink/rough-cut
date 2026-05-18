import { formatTimecode } from './project-shape.mjs';

export function NleTransport({
  playheadFrame,
  durationFrames,
  fps,
  isPlaying,
  onTogglePlay,
  onPlayheadFrameChange,
}: {
  playheadFrame: number;
  durationFrames: number;
  fps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPlayheadFrameChange: (frame: number) => void;
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
      <div className="nleTransportTime" aria-live="off">
        <span className="nleTransportTimeCurrent">{formatTimecode(playheadFrame, fps)}</span>
        <span className="nleTransportTimeSep">/</span>
        <span className="nleTransportTimeTotal">{formatTimecode(durationFrames, fps)}</span>
      </div>
    </div>
  );
}
