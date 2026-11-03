import React from 'react';
import {
  AUDIO_VOLUME_MAX,
  getClipAudioLevel,
  getRecordingAudioLevel,
  resolveAudioLevel,
  type AudioLevel,
  type ProjectDocument,
  type ResolvedAudioLevel,
} from '@rough-cut/project-model';
import type { ClipGainOverride } from './audio-volume.mjs';

// Volume in the Audio tab: the recording's track (one level for its whole
// sound) and the clip selected on the timeline. While a slider moves only the
// live preview changes (gain nodes, no reload); letting go saves through the
// normal undo/save path, like Clean voice's Amount.

export type AudioVolumeController = {
  /** What the Track section shows: the slider while dragging, else the saved level. */
  track: ResolvedAudioLevel;
  /** What the Selected clip section shows; null when no recording clip is selected. */
  clip: ResolvedAudioLevel | null;
  selectedClipCount: number;
  /** Only an added clip (not part of the recording) is selected. */
  addedClipSelected: boolean;
  setTrackDraft: (volume: number) => void;
  commitTrack: (patch: AudioLevel) => void;
  setClipDraft: (volume: number) => void;
  commitClip: (patch: AudioLevel) => void;
  /** Master gain the preview plays: 0 when the track is muted. */
  previewTrackGain: number;
  /** Clips whose slider is moving right now, at the level being dragged. */
  clipGainOverride: ClipGainOverride | null;
};

export const AudioVolumeContext = React.createContext<AudioVolumeController | null>(null);

type ClipDocument = Pick<ProjectDocument, 'settings' | 'timeline'>;

function existingClipIds(document: ClipDocument | null | undefined, ids: readonly string[]) {
  const known = new Set((document?.timeline?.tracks ?? []).flatMap((track) => track.clips.map((clip) => clip.id)));
  return ids.filter((id) => known.has(id));
}

export function useAudioVolumeController({
  document,
  selectedClipIds,
  addedClipSelected = false,
  onCommitTrack,
  onCommitClip,
}: {
  document: ClipDocument | null | undefined;
  selectedClipIds: readonly string[];
  addedClipSelected?: boolean;
  onCommitTrack: (patch: AudioLevel) => void;
  onCommitClip: (clipIds: readonly string[], patch: AudioLevel) => void;
}): AudioVolumeController {
  const [trackDraft, setTrackDraftState] = React.useState<number | null>(null);
  const [clipDraft, setClipDraftState] = React.useState<{ key: string; volume: number } | null>(null);
  const savedTrack = getRecordingAudioLevel(document?.settings);
  const clipIds = existingClipIds(document, selectedClipIds);
  const clipKey = clipIds.join('|');
  const savedClip = clipIds.length > 0 ? getClipAudioLevel(document, clipIds[0]) : null;

  const commitTrackRef = React.useRef(onCommitTrack);
  commitTrackRef.current = onCommitTrack;
  const commitClipRef = React.useRef(onCommitClip);
  commitClipRef.current = onCommitClip;
  const clipIdsRef = React.useRef(clipIds);
  clipIdsRef.current = clipIds;

  // A different selection drops a half-finished drag on the old one.
  React.useEffect(() => setClipDraftState(null), [clipKey]);

  const setTrackDraft = React.useCallback((volume: number) => setTrackDraftState(resolveAudioLevel({ volume }).volume), []);
  const commitTrack = React.useCallback((patch: AudioLevel) => {
    setTrackDraftState(null);
    commitTrackRef.current(patch);
  }, []);
  const setClipDraft = React.useCallback((volume: number) => {
    setClipDraftState({ key: clipIdsRef.current.join('|'), volume: resolveAudioLevel({ volume }).volume });
  }, []);
  const commitClip = React.useCallback((patch: AudioLevel) => {
    setClipDraftState(null);
    if (clipIdsRef.current.length > 0) commitClipRef.current(clipIdsRef.current, patch);
  }, []);

  const track = trackDraft === null ? savedTrack : { ...savedTrack, volume: trackDraft };
  const activeClipDraft = clipDraft && clipDraft.key === clipKey ? clipDraft : null;
  const clip = savedClip ? (activeClipDraft ? { ...savedClip, volume: activeClipDraft.volume } : savedClip) : null;
  const previewTrackGain = track.muted ? 0 : track.volume;
  const clipGainOverride = React.useMemo<ClipGainOverride | null>(
    () => (activeClipDraft && clip ? { clipIds: clipKey.split('|'), gain: clip.muted ? 0 : activeClipDraft.volume } : null),
    [activeClipDraft, clip?.muted, clipKey],
  );

  return {
    track,
    clip,
    selectedClipCount: clipIds.length,
    addedClipSelected: clipIds.length === 0 && addedClipSelected,
    setTrackDraft,
    commitTrack,
    setClipDraft,
    commitClip,
    previewTrackGain,
    clipGainOverride,
  };
}

export function AudioVolumePanel({ disabled = false }: { disabled?: boolean }) {
  const controller = React.useContext(AudioVolumeContext);
  if (!controller) return null;
  const { track, clip, selectedClipCount, addedClipSelected } = controller;
  const clipHint = clip
    ? selectedClipCount > 1 ? `Sets all ${selectedClipCount} selected clips.` : 'Only this clip. Double-click the slider for 100%.'
    : addedClipSelected
      ? 'Added clips keep their own sound for now.'
      : 'Select a clip on the timeline.';

  return (
    <>
      <section className="capPanel audioLevelPanel" aria-label="Track volume" data-ui-region="track-volume-panel" data-muted={track.muted || undefined}>
        <header className="capHead">
          <h2>Track volume</h2>
          <span className="audioLevelActions">
            {(track.muted || track.volume !== 1) ? <button type="button" className="capLink" disabled={disabled} onClick={() => controller.commitTrack({ volume: 1, muted: false })}>Reset</button> : null}
            <MuteSwitch muted={track.muted} disabled={disabled} label="Mute the recording's sound" onChange={(muted) => controller.commitTrack({ muted })} />
          </span>
        </header>
        <VolumeSlider
          name="Track volume"
          level={track}
          disabled={disabled}
          onDraft={controller.setTrackDraft}
          onCommit={(volume) => controller.commitTrack({ volume })}
        />
      </section>
      <section className="capPanel audioLevelPanel" aria-label="Selected clip volume" data-ui-region="clip-volume-panel" data-muted={clip?.muted || undefined} data-has-clip={clip ? 'true' : 'false'}>
        <header className="capHead">
          <h2>Selected clip</h2>
          <span className="audioLevelActions">
            {clip && (clip.muted || clip.volume !== 1) ? <button type="button" className="capLink" disabled={disabled} onClick={() => controller.commitClip({ volume: 1, muted: false })}>Reset</button> : null}
            <MuteSwitch muted={Boolean(clip?.muted)} disabled={disabled || !clip} label="Mute the selected clip" onChange={(muted) => controller.commitClip({ muted })} />
          </span>
        </header>
        <VolumeSlider
          name="Clip volume"
          level={clip ?? { volume: 1, muted: false }}
          disabled={disabled || !clip}
          onDraft={controller.setClipDraft}
          onCommit={(volume) => controller.commitClip({ volume })}
        />
        <p className="capMessage" aria-live="polite">{clipHint}</p>
      </section>
    </>
  );
}

function MuteSwitch({ muted, disabled, label, onChange }: { muted: boolean; disabled: boolean; label: string; onChange: (muted: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={muted}
      aria-label={label}
      className={`capSwitch${muted ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!muted)}
    >
      <span>Mute</span><i aria-hidden="true" />
    </button>
  );
}

const SLIDER_MAX_PERCENT = Math.round(AUDIO_VOLUME_MAX * 100);

function VolumeSlider({ name, level, disabled, onDraft, onCommit }: {
  name: string;
  level: ResolvedAudioLevel;
  disabled: boolean;
  onDraft: (volume: number) => void;
  onCommit: (volume: number) => void;
}) {
  const percent = Math.round(level.volume * 100);
  const commit = (event: React.SyntheticEvent<HTMLInputElement>) => onCommit(Number(event.currentTarget.value) / 100);
  return (
    <label className="rangeField audioLevelSlider" title="Double-click to set 100%">
      <span>Volume</span>
      <span className="rangeControl" style={{ '--range-progress': `${(percent / SLIDER_MAX_PERCENT) * 100}%` } as React.CSSProperties}>
        <span className="rangeVisual" aria-hidden="true">
          <span className="rangeFill" />
          <span className="rangeThumb" />
        </span>
        <input
          type="range"
          min={0}
          max={SLIDER_MAX_PERCENT}
          step={1}
          value={percent}
          disabled={disabled}
          aria-label={name}
          aria-valuetext={level.muted ? `${percent}%, muted` : `${percent}%`}
          onInput={(event) => onDraft(Number(event.currentTarget.value) / 100)}
          onChange={(event) => onDraft(Number(event.currentTarget.value) / 100)}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          onDoubleClick={() => onCommit(1)}
          onWheelCapture={(event) => { event.preventDefault(); event.currentTarget.blur(); }}
        />
      </span>
      <output>{percent}%</output>
    </label>
  );
}
