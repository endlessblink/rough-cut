// Editor v2 layout (TASK-237 slice 1) — the approved mockup structure
// (docs/mockups/editor-v2-resolve.html): media pool | source viewer |
// program viewer | inspector above a full-width timeline deck.
// Presentation-only reorganization: all state, playback, keyboard, and
// mutation logic stays in NleShell / the existing harness-passing modules.
import React from 'react';
import { FilmStrip, Pause, Play } from '@phosphor-icons/react';
import {
  DEFAULT_STABILIZATION_STRENGTH,
  draftTimelineDuration,
  draftTimelineFrame,
  getSourceStabilization,
  setSourceStabilization,
  timelineFrameForDraftFrame,
  type CleanupDraftProjection,
  type ProjectDocument,
} from '@rough-cut/project-model';
import { MediaPool } from './media-pool';
import { TranscriptPanel } from './transcript-panel';
import { shortProjectName } from './media-pool-model.mjs';
import { assetLabel } from '../nle/asset-format.mjs';
import { NleProgramMonitor } from '../nle/program-monitor';
import { NleTransport } from '../nle/transport';
import { NleTimeline } from '../nle/nle-timeline';
import { buildTimelineTracks } from '../nle/timeline-clips.mjs';
import { updateTrackById } from '../nle/clip-mutations.mjs';
import { formatTimecode } from '../nle/project-shape.mjs';
import type { NleEditMode } from '../nle/mode-toolbar';
import type { NleProject } from '../nle/types';
import { rippleDeleteRecordingRange } from '../recording-timeline.mjs';
import {
  findStabilizationTarget,
  stabilizationStatusLabel,
} from './stabilization-inspector-model.mjs';
import { finalizeCleanupDraftProject } from './cleanup-finalize.mjs';

type StabilizationStatus = {
  phase: 'idle' | 'queued' | 'analyzing' | 'encoding' | 'ready' | 'cancelled' | 'unsupported' | 'failed';
  progress?: number;
  error?: string;
};

const EMPTY_CLEANUP_DRAFT: CleanupDraftProjection = {
  removals: [],
  compressions: [],
};

export function EditorV2Layout({
  project,
  playheadFrame,
  durationFrames,
  fps,
  isPlaying,
  playbackRate,
  selectedClipId,
  editMode,
  canSplit,
  onSplit,
  onEditModeChange,
  onPlayheadFrameChange,
  onPlayingChange,
  onPlaybackRateChange,
  onSelectedClipChange,
  onProjectChange,
  topbarExtras,
}: {
  project: NleProject;
  playheadFrame: number;
  durationFrames: number;
  fps: number;
  isPlaying: boolean;
  playbackRate: number;
  selectedClipId: string | null;
  editMode: NleEditMode;
  canSplit: boolean;
  onSplit: () => void;
  onEditModeChange: (mode: NleEditMode) => void;
  onPlayheadFrameChange: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onPlaybackRateChange: (rate: number) => void;
  onSelectedClipChange: (clipId: string | null) => void;
  onProjectChange?: (
    next: NleProject,
    options?: { history?: boolean; persist?: boolean },
  ) => void;
  topbarExtras?: React.ReactNode;
}) {
  const [stabilizedUrls, setStabilizedUrls] = React.useState<Record<string, string>>({});
  const [stabilizationStatus, setStabilizationStatus] = React.useState<Record<string, StabilizationStatus>>({});
  const [browserTab, setBrowserTab] = React.useState<'media' | 'transcript'>('media');
  const [cleanupDraft, setCleanupDraft] =
    React.useState<CleanupDraftProjection>(EMPTY_CLEANUP_DRAFT);
  const cleanupDraftRef = React.useRef<CleanupDraftProjection>(cleanupDraft);
  const playheadFrameRef = React.useRef(playheadFrame);
  const onPlayheadFrameChangeRef = React.useRef(onPlayheadFrameChange);
  onPlayheadFrameChangeRef.current = onPlayheadFrameChange;
  const activeStabilizationJob = React.useRef<{ jobId: string; sourceId: string } | null>(null);
  const preparedStabilizationKey = React.useRef<Record<string, string>>({});
  const selected = React.useMemo(() => {
    if (!selectedClipId) return null;
    for (const track of buildTimelineTracks(project)) {
      const block = track.blocks.find((item: { id: string | null }) => item.id === selectedClipId);
      if (block) return { block, track };
    }
    return null;
  }, [project, selectedClipId]);
  const stabilizationTarget = React.useMemo(
    () => findStabilizationTarget(project, selected?.block),
    [project, selected],
  );
  const stabilizationEffect = stabilizationTarget
    ? getSourceStabilization(
      project.document.timeline as ProjectDocument['timeline'],
      stabilizationTarget.sourceId,
    )
    : null;
  const stabilizationEnabled = stabilizationEffect?.enabled === true;
  const effectStrength = Number(stabilizationEffect?.params?.strength);
  const stabilizationStrength = Number.isFinite(effectStrength)
    ? effectStrength
    : DEFAULT_STABILIZATION_STRENGTH;
  const transcriptWordCount = (
    project.document as unknown as ProjectDocument
  ).transcript?.words.length ?? 0;
  const draftProject = React.useMemo(
    () => projectWithCleanupDraft(project, cleanupDraft),
    [cleanupDraft, project],
  );
  const draftDurationFrames = React.useMemo(
    () => draftTimelineDuration(cleanupDraft, durationFrames),
    [cleanupDraft, durationFrames],
  );
  const hasCleanupDraft =
    cleanupDraft.removals.length > 0 || cleanupDraft.compressions.length > 0;
  React.useEffect(() => {
    playheadFrameRef.current = playheadFrame;
  }, [playheadFrame]);
  const updateCleanupDraft = React.useCallback(
    (next: CleanupDraftProjection) => {
      const current = cleanupDraftRef.current;
      if (sameCleanupDraft(current, next)) return;
      const basePlayheadFrame = timelineFrameForDraftFrame(
        current,
        playheadFrameRef.current,
        durationFrames,
      );
      cleanupDraftRef.current = next;
      setCleanupDraft(next);
      const nextPlayheadFrame = draftTimelineFrame(next, basePlayheadFrame);
      playheadFrameRef.current = nextPlayheadFrame;
      onPlayheadFrameChangeRef.current(nextPlayheadFrame);
    },
    [durationFrames],
  );
  const finalizeCleanupDraft = React.useCallback(() => {
    if (!onProjectChange) return;
    const next = finalizeCleanupDraftProject(project, cleanupDraftRef.current);
    if (next === project) return;
    cleanupDraftRef.current = EMPTY_CLEANUP_DRAFT;
    setCleanupDraft(EMPTY_CLEANUP_DRAFT);
    onProjectChange(next, { history: true, persist: true });
  }, [onProjectChange, project]);

  React.useEffect(() => {
    if (transcriptWordCount === 0 && browserTab === 'transcript') setBrowserTab('media');
  }, [browserTab, transcriptWordCount]);

  React.useEffect(() => window.roughCut.onStabilizationProgress((progress) => {
    setStabilizationStatus((current) => ({
      ...current,
      [progress.sourceId]: {
        phase: progress.phase,
        progress: progress.progress,
      },
    }));
    activeStabilizationJob.current = { jobId: progress.jobId, sourceId: progress.sourceId };
  }), []);

  React.useEffect(() => {
    if (!stabilizationTarget || !stabilizationEnabled) return undefined;
    const { sourceId } = stabilizationTarget;
    const prepareKey = `${sourceId}:${stabilizationStrength}`;
    if (preparedStabilizationKey.current[sourceId] === prepareKey) return undefined;
    let disposed = false;
    const timer = window.setTimeout(async () => {
      const support = await window.roughCut.getStabilizationSupport();
      if (disposed) return;
      if (!support.supported) {
        setStabilizationStatus((current) => ({
          ...current,
          [sourceId]: { phase: 'unsupported', error: support.reason || 'Stabilization is unavailable' },
        }));
        return;
      }
      setStabilizationStatus((current) => ({
        ...current,
        [sourceId]: { phase: 'queued', progress: 0 },
      }));
      try {
        const result = await window.roughCut.prepareStabilization({
          document: project.document as unknown as ProjectDocument,
          projectPath: project.path,
          sourceId,
          strength: stabilizationStrength,
        });
        if (disposed) return;
        preparedStabilizationKey.current[sourceId] = prepareKey;
        setStabilizedUrls((current) => ({ ...current, [sourceId]: result.proxyUrl }));
        setStabilizationStatus((current) => ({
          ...current,
          [sourceId]: { phase: 'ready', progress: 1 },
        }));
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setStabilizationStatus((current) => ({
          ...current,
          [sourceId]: {
            phase: message.toLowerCase().includes('cancel') ? 'cancelled' : 'failed',
            error: message,
          },
        }));
      }
    }, 250);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [
    project.document,
    project.path,
    stabilizationEnabled,
    stabilizationStrength,
    stabilizationTarget,
  ]);

  const enabledPreviewUrls = React.useMemo(() => {
    let mediaUrl: string | null = null;
    let cameraUrl: string | null = null;
    const sources = (
      project.document.timeline as ProjectDocument['timeline'] | undefined
    )?.sources ?? [];
    for (const source of sources) {
      const effect = getSourceStabilization(
        project.document.timeline as ProjectDocument['timeline'],
        source.id,
      );
      const url = effect?.enabled ? stabilizedUrls[source.id] : null;
      if (!url) continue;
      const target = findStabilizationTarget(project, { mediaId: source.id, assetId: source.assetId });
      if (target?.isCamera) cameraUrl = url;
      else mediaUrl = url;
    }
    return { mediaUrl, cameraUrl };
  }, [project, stabilizedUrls]);

  function commitTrackPatch(trackId: string, patch: Record<string, unknown>) {
    if (!onProjectChange) return;
    const next = updateTrackById(project, trackId, patch);
    if (next !== project) onProjectChange(next as unknown as NleProject);
  }

  function commitStabilization(enabled: boolean, strength = stabilizationStrength) {
    if (!onProjectChange || !stabilizationTarget) return;
    const timeline = setSourceStabilization(
      project.document.timeline as ProjectDocument['timeline'],
      stabilizationTarget.sourceId,
      { enabled, strength },
    );
    if (!enabled) {
      const job = activeStabilizationJob.current;
      const jobId = job?.sourceId === stabilizationTarget.sourceId ? job.jobId : null;
      if (jobId) {
        void window.roughCut.cancelStabilization(jobId);
        activeStabilizationJob.current = null;
      }
    }
    onProjectChange({
      ...project,
      document: { ...project.document, timeline },
    } as unknown as NleProject);
  }

  return (
    <div
      className="ev2Root"
      data-ui-region="editor-v2"
      data-cleanup-draft-removals={cleanupDraft.removals.length}
      data-cleanup-draft-duration={draftDurationFrames}
    >
      <EditingActionBar
        hasTranscript={transcriptWordCount > 0}
        onOpenTranscript={() => setBrowserTab('transcript')}
      />
      <div className="ev2Upper">
        <section className="ev2Pane ev2Media" aria-label="Project browser">
          <div className="ev2BrowserTabs" role="tablist" aria-label="Project browser">
            <button
              type="button"
              role="tab"
              aria-selected={browserTab === 'media'}
              onClick={() => setBrowserTab('media')}
            >
              Media
            </button>
            <button
              type="button"
              role="tab"
              aria-label="Edit transcript"
              aria-selected={browserTab === 'transcript'}
              title={transcriptWordCount === 0 ? 'Open transcript panel; no transcript yet' : 'Open transcript editing'}
              onClick={() => setBrowserTab('transcript')}
            >
              Edit transcript
            </button>
          </div>
          {browserTab === 'transcript' ? (
            <TranscriptPanel
              document={project.document as unknown as ProjectDocument}
              projectPath={project.path}
              playheadFrame={playheadFrame}
              fps={fps}
              durationFrames={durationFrames}
              isPlaying={isPlaying}
              onSeek={onPlayheadFrameChange}
              onPlayingChange={onPlayingChange}
              playbackRate={playbackRate}
              onPlaybackRateChange={onPlaybackRateChange}
              onDraftProjectionChange={updateCleanupDraft}
              onFinalizeDraft={finalizeCleanupDraft}
              onDocumentChange={
                onProjectChange
                  ? (nextDocument) =>
                      onProjectChange(
                        {
                          ...project,
                          document: nextDocument,
                        } as unknown as NleProject,
                        { history: false, persist: true },
                      )
                  : undefined
              }
            />
          ) : (
            <MediaPool project={project} />
          )}
        </section>

        <SourceViewer project={project} fps={fps} />

        <section className="ev2Pane ev2Program" aria-label="Timeline viewer">
          <div className="ev2ProgramBody">
            <span className="ev2ViewerTag">{shortProjectName(project.document.name) || 'Timeline'}</span>
            <NleProgramMonitor
              project={draftProject}
              playheadFrame={playheadFrame}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              fps={fps}
              durationFrames={draftDurationFrames}
              onPlayheadFrameChange={onPlayheadFrameChange}
              onPlayingChange={onPlayingChange}
              mediaUrlOverride={enabledPreviewUrls.mediaUrl}
              cameraMediaUrlOverride={enabledPreviewUrls.cameraUrl}
            />
          </div>
          <NleTransport
            playheadFrame={playheadFrame}
            durationFrames={draftDurationFrames}
            fps={fps}
            isPlaying={isPlaying}
            onTogglePlay={() => onPlayingChange(!isPlaying)}
            onPlayheadFrameChange={onPlayheadFrameChange}
            canSplit={canSplit}
            onSplit={onSplit}
          />
        </section>

        <section className="ev2Pane ev2Inspector" aria-label="Inspector">
          {selected ? (
            <div className="ev2InspectorBody">
              <div className="ev2InspGroup">
                <p className="ev2InspTitle">CLIP</p>
                <div className="ev2InspRow"><span>In</span><code>{formatTimecode(selected.block.timelineIn, fps)}</code></div>
                <div className="ev2InspRow"><span>Out</span><code>{formatTimecode(selected.block.timelineOut, fps)}</code></div>
                <div className="ev2InspRow"><span>Duration</span><code>{formatTimecode(selected.block.timelineOut - selected.block.timelineIn, fps)}</code></div>
                <div className="ev2InspRow"><span>Track</span><code>{selected.track.label}</code></div>
              </div>
              {stabilizationTarget ? (
                <div className="ev2InspGroup ev2Stabilization">
                  <p className="ev2InspTitle">STABILIZATION</p>
                  <div className="ev2InspRow">
                    <span>Stabilize video</span>
                    <button
                      type="button"
                      className="ev2Toggle"
                      role="switch"
                      aria-checked={stabilizationEnabled}
                      aria-label={`${stabilizationEnabled ? 'Disable' : 'Enable'} video stabilization`}
                      onClick={() => commitStabilization(!stabilizationEnabled)}
                    />
                  </div>
                  <label className="ev2StabilizationStrength">
                    <span>Strength</span>
                    <output>{stabilizationStrength}</output>
                    <span
                      className="rangeControl"
                      style={{ '--range-progress': `${stabilizationStrength}%` } as React.CSSProperties}
                    >
                      <span className="rangeVisual" aria-hidden="true">
                        <span className="rangeFill" />
                        <span className="rangeThumb" />
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={stabilizationStrength}
                        disabled={!stabilizationEnabled}
                        aria-label="Stabilization strength"
                        onChange={(event) => commitStabilization(true, Number(event.currentTarget.value))}
                      />
                    </span>
                  </label>
                  <p
                    className={`ev2StabilizationStatus ${
                      stabilizationStatus[stabilizationTarget.sourceId]?.phase === 'failed'
                      || stabilizationStatus[stabilizationTarget.sourceId]?.phase === 'unsupported'
                        ? 'error'
                        : ''
                    }`}
                    aria-live="polite"
                  >
                    {stabilizationEnabled
                      ? stabilizationStatusLabel(
                        stabilizationStatus[stabilizationTarget.sourceId] ?? { phase: 'idle' },
                      )
                      : 'Original video'}
                  </p>
                </div>
              ) : null}
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
          project={draftProject}
          playheadFrame={playheadFrame}
          durationFrames={draftDurationFrames}
          fps={fps}
          isPlaying={isPlaying}
          selectedClipId={selectedClipId}
          editMode={editMode}
          onEditModeChange={onEditModeChange}
          onPlayheadFrameChange={onPlayheadFrameChange}
          onSelectedClipChange={onSelectedClipChange}
          onProjectChange={hasCleanupDraft ? undefined : onProjectChange}
          onSplit={onSplit}
          topbarExtras={topbarExtras}
        />
      </div>
    </div>
  );
}

function EditingActionBar({
  hasTranscript,
  onOpenTranscript,
}: {
  hasTranscript: boolean;
  onOpenTranscript: () => void;
}) {
  const focusSurface = (selector: string) => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <section className="ev2ActionBar" aria-label="Editing actions" data-editing-entry="true">
      <div className="ev2ActionBarIntro">
        <strong>Editing actions</strong>
        <span>Choose what you want to change</span>
      </div>
      <div className="ev2ActionBarItems">
        <button
          type="button"
          className="ev2ActionBarItem primary"
          aria-label="Edit transcript timing"
          title={hasTranscript ? 'Select transcript words to change timing' : 'Open the transcript panel'}
          onClick={onOpenTranscript}
        >
          <strong>Transcript</strong>
          <small>{hasTranscript ? 'Select words · cut timing' : 'Open transcript panel'}</small>
        </button>
        <button
          type="button"
          className="ev2ActionBarItem"
          aria-label="Edit timeline clips"
          onClick={() => focusSurface('[data-ui-region="nle-timeline"]')}
        >
          <strong>Timeline</strong>
          <small>Trim · split · move clips</small>
        </button>
        <button
          type="button"
          className="ev2ActionBarItem"
          aria-label="Edit selected clip settings"
          onClick={() => focusSurface('[aria-label="Inspector"]')}
        >
          <strong>Inspector</strong>
          <small>Adjust the selected clip</small>
        </button>
      </div>
    </section>
  );
}

function projectWithCleanupDraft(
  project: NleProject,
  projection: CleanupDraftProjection,
): NleProject {
  if (projection.removals.length === 0) return project;
  const document = project.document as unknown as ProjectDocument;
  const recordingAssetId =
    document.assets.find((asset) => asset.type === 'recording')?.id ?? null;
  if (!recordingAssetId) return project;
  const nextDocument = [...projection.removals]
    .sort((left, right) => right.startFrame - left.startFrame)
    .reduce(
      (current, range) =>
        rippleDeleteRecordingRange(current, {
          assetId: recordingAssetId,
          startFrame: range.startFrame,
          endFrame: range.endFrame,
        }) as ProjectDocument,
      document,
    );
  return {
    ...project,
    document: nextDocument,
  } as unknown as NleProject;
}

function sameCleanupDraft(
  left: CleanupDraftProjection,
  right: CleanupDraftProjection,
): boolean {
  return (
    JSON.stringify(left.removals) === JSON.stringify(right.removals) &&
    JSON.stringify(left.compressions) === JSON.stringify(right.compressions)
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
  // The source pane previews the primary recording — name it like the media
  // pool does ("recording #1"), not by the project's machine-generated id.
  const primaryAsset = (project.document.assets ?? [])[0];
  const sourceLabel = primaryAsset ? assetLabel(primaryAsset, 0) : 'No media';

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
      <div className="ev2SourceBody">
        <span className="ev2ViewerTag">{sourceLabel}</span>
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
