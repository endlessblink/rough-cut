import type { NleProject } from './types';
import { frameToSeconds, secondsToFrame } from './project-shape.mjs';
import { StyledVideoPreview } from '../styled-video-preview';

export function NleProgramMonitor({
  project,
  playheadFrame,
  isPlaying,
  playbackRate = 1,
  fps,
  durationFrames,
  onPlayheadFrameChange,
  onPlayingChange,
  mediaUrlOverride,
  cameraMediaUrlOverride,
}: {
  project: NleProject;
  playheadFrame: number;
  isPlaying: boolean;
  playbackRate?: number;
  fps: number;
  durationFrames: number;
  onPlayheadFrameChange: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
  mediaUrlOverride?: string | null;
  cameraMediaUrlOverride?: string | null;
}) {
  const src = mediaUrlOverride ?? project.mediaUrl ?? '';

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
        playbackRate={playbackRate}
        showControls={false}
        timeMode="timeline"
        onPlayingChange={onPlayingChange}
        onCurrentTimeChange={(seconds) => {
          const frame = secondsToFrame(seconds, fps);
          onPlayheadFrameChange(Math.max(0, Math.min(durationFrames, frame)));
        }}
        mediaUrlOverride={mediaUrlOverride}
        cameraMediaUrlOverride={cameraMediaUrlOverride}
      />
    </div>
  );
}
