// Editor v2 layout (TASK-237 slice 1) — the approved mockup structure
// (docs/mockups/editor-v2-resolve.html): media pool | source viewer |
// program viewer | inspector above a full-width timeline deck.
// Presentation-only reorganization: all state, playback, keyboard, and
// mutation logic stays in NleShell / the existing harness-passing modules.
import React from 'react';
import { FilmStrip, Pause, Play } from '@phosphor-icons/react';
import { MediaPool } from './media-pool';
import { NleProgramMonitor } from '../nle/program-monitor';
import { NleTransport } from '../nle/transport';
import { NleTimeline } from '../nle/nle-timeline';
import { buildTimelineTracks } from '../nle/timeline-clips.mjs';
import { updateTrackById } from '../nle/clip-mutations.mjs';
import { formatTimecode } from '../nle/project-shape.mjs';
import type { NleEditMode } from '../nle/mode-toolbar';
import type { NleProject } from '../nle/types';

export function EditorV2Layout({
  project,
  playheadFrame,
  durationFrames,
  fps,
  isPlaying,
  selectedClipId,
  editMode,
  canSplit,
  onSplit,
  onEditModeChange,
  onPlayheadFrameChange,
  onPlayingChange,
  onSelectedClipChange,
  onProjectChange,
  topbarExtras,
}: {
  project: NleProject;
  playheadFrame: number;
  durationFrames: number;
  fps: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  editMode: NleEditMode;
  canSplit: boolean;
  onSplit: () => void;
  onEditModeChange: (mode: NleEditMode) => void;
  onPlayheadFrameChange: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSelectedClipChange: (clipId: string | null) => void;
  onProjectChange?: (next: NleProject) => void;
  topbarExtras?: React.ReactNode;
}) {
  const selected = React.useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of buildTimelineTracks(project)) {
      const block = track.blocks.find((item: { id: string | null }) => item.id === selectedClipId);
      if (block) return { block, track };
    }
    return null;
  }, [project, selectedClipId]);

  function commitTrackPatch(trackId: string, patch: Record<string, unknown>) {
    if (!onProjectChange) return;
    const next = updateTrackById(project, trackId, patch);
    if (next !== project) onProjectChange(next as unknown as NleProject);
  }

  return (
    <div className="ev2Root" data-ui-region="editor-v2">
      <div className="ev2Upper">
        <section className="ev2Pane ev2Media" aria-label="Media pool">
          <header className="ev2PaneHead">MEDIA POOL</header>
          <MediaPool project={project} />
        </section>

        <SourceViewer project={project} fps={fps} />

        <section className="ev2Pane ev2Program" aria-label="Timeline viewer">
          <header className="ev2PaneHead">
            TIMELINE
            <span className="ev2PaneHeadMeta">{project.document.name || 'Untitled'}</span>
          </header>
          <div className="ev2ProgramBody">
            <NleProgramMonitor
              project={project}
              playheadFrame={playheadFrame}
              isPlaying={isPlaying}
              fps={fps}
              durationFrames={durationFrames}
              onPlayheadFrameChange={onPlayheadFrameChange}
              onPlayingChange={onPlayingChange}
            />
          </div>
          <NleTransport
            playheadFrame={playheadFrame}
            durationFrames={durationFrames}
            fps={fps}
            isPlaying={isPlaying}
            onTogglePlay={() => onPlayingChange(!isPlaying)}
            onPlayheadFrameChange={onPlayheadFrameChange}
            canSplit={canSplit}
            onSplit={onSplit}
          />
        </section>

        <section className="ev2Pane ev2Inspector" aria-label="Inspector">
          <header className="ev2PaneHead">
            INSPECTOR
            {selected ? <span className="ev2PaneHeadMeta">{selected.block.name ?? 'Clip'}</span> : null}
          </header>
          {selected ? (
            <div className="ev2InspectorBody">
              <div className="ev2InspGroup">
                <p className="ev2InspTitle">CLIP</p>
                <div className="ev2InspRow"><span>In</span><code>{formatTimecode(selected.block.timelineIn, fps)}</code></div>
                <div className="ev2InspRow"><span>Out</span><code>{formatTimecode(selected.block.timelineOut, fps)}</code></div>
                <div className="ev2InspRow"><span>Duration</span><code>{formatTimecode(selected.block.timelineOut - selected.block.timelineIn, fps)}</code></div>
                <div className="ev2InspRow"><span>Track</span><code>{selected.track.label}</code></div>
              </div>
              <div className="ev2InspGroup">
                <p className="ev2InspTitle">TRACK</p>
                <div className="ev2InspRow">
                  <span>Lock</span>
                  <button
                    type="button"
                    className="ev2Toggle"
                    role="switch"
                    aria-checked={selected.track.locked}
                    aria-label={`${selected.track.locked ? 'Unlock' : 'Lock'} ${selected.track.label}`}
                    onClick={() => commitTrackPatch(selected.track.id, { locked: !selected.track.locked })}
                  />
                </div>
                {selected.track.kind === 'audio' ? (
                  <div className="ev2InspRow">
                    <span>Mute</span>
                    <button
                      type="button"
                      className="ev2Toggle"
                      role="switch"
                      aria-checked={selected.track.muted}
                      aria-label={`${selected.track.muted ? 'Unmute' : 'Mute'} ${selected.track.label}`}
                      onClick={() => commitTrackPatch(selected.track.id, { muted: !selected.track.muted })}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="ev2InspectorEmpty">
              <FilmStrip aria-hidden="true" />
              <p>Select a clip to inspect it</p>
            </div>
          )}
        </section>
      </div>

      <div className="ev2TimelineDeck">
        <NleTimeline
          project={project}
          playheadFrame={playheadFrame}
          durationFrames={durationFrames}
          fps={fps}
          selectedClipId={selectedClipId}
          editMode={editMode}
          onEditModeChange={onEditModeChange}
          onPlayheadFrameChange={onPlayheadFrameChange}
          onSelectedClipChange={onSelectedClipChange}
          onProjectChange={onProjectChange}
          onSplit={onSplit}
          topbarExtras={topbarExtras}
        />
      </div>
    </div>
  );
}

// Slice-1 source viewer: previews the project's primary recording with a
// real play/pause. Source-side I/O marking + insert/overwrite arrive in a
// later slice (controls only appear once they work — DESIGN.md rule).
function SourceViewer({ project, fps }: { project: NleProject; fps: number }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [timeSec, setTimeSec] = React.useState(0);
  const src = project.mediaUrl ?? '';

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }

  return (
    <section className="ev2Pane ev2Source" aria-label="Source viewer">
      <header className="ev2PaneHead">
        SOURCE
        <span className="ev2PaneHeadMeta">{project.document.name || 'recording'}</span>
      </header>
      <div className="ev2SourceBody">
        {src ? (
          <video
            ref={videoRef}
            className="ev2SourceVideo"
            src={src}
            preload="metadata"
            muted
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setTimeSec(e.currentTarget.currentTime)}
          />
        ) : (
          <div className="ev2SourceEmpty">No media</div>
        )}
      </div>
      <div className="ev2SourceBar">
        <button
          type="button"
          className="ev2SourcePlay"
          aria-label={playing ? 'Pause source' : 'Play source'}
          onClick={togglePlay}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <code className="ev2SourceTime">{formatTimecode(Math.round(timeSec * fps), fps)}</code>
      </div>
    </section>
  );
}
