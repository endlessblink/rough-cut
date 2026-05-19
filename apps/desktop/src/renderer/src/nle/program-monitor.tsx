import type { NleProject } from './types';
import { frameToSeconds, secondsToFrame } from './project-shape.mjs';
import { StyledVideoPreview } from '../styled-video-preview';

export function NleProgramMonitor({
  project,
  playheadFrame,
  isPlaying,
  fps,
  durationFrames,
  onPlayheadFrameChange,
  onPlayingChange,
}: {
  project: NleProject;
  playheadFrame: number;
  isPlaying: boolean;
  fps: number;
  durationFrames: number;
  onPlayheadFrameChange: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
}) {
  const src = project.mediaUrl ?? '';

  if (!src) {
    return (
      <div className="nleProgramMonitor empty" data-ui-region="nle-monitor">
        <p>No media yet</p>
      </div>
    );
  }

  return (
    <div className="nleProgramMonitor" data-ui-region="nle-monitor">
      <StyledVideoPreview
        project={project as unknown as Parameters<typeof StyledVideoPreview>[0]['project']}
        seekTimeSec={frameToSeconds(playheadFrame, fps)}
        isPlaying={isPlaying}
        showControls={false}
        timeMode="timeline"
        onPlayingChange={onPlayingChange}
        onCurrentTimeChange={(seconds) => {
          const frame = secondsToFrame(seconds, fps);
          onPlayheadFrameChange(Math.max(0, Math.min(durationFrames, frame)));
        }}
      />
    </div>
  );
}
