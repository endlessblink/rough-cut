import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './cleanup-finalize.test.mjs';
import './manual-review-playback.test.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('Editor v2 panes have no eyebrow header row (banned pattern)', () => {
  const source = readFileSync(join(here, 'editor-v2-layout.tsx'), 'utf8');

  assert.doesNotMatch(source, /ev2PaneHead/);
  assert.match(source, /ev2ViewerTag/);
  assert.match(source, /shortProjectName\(project\.document\.name\)/);
  assert.match(source, /assetLabel\(primaryAsset, 0\)/);
});

test('FreeCut is the single advanced editor surface, and Rough Cut paints its picture', () => {
  const source = readFileSync(join(here, '../freecut-editor-surface.tsx'), 'utf8');

  assert.match(source, /className="freecutEditorFrame"/);
  // One compositor draws every view. This used to assert the opposite — that the
  // surface must NOT mount Rough Cut's preview — back when the Editor drew its
  // own picture from a pre-rendered program feed. Two renderers can never agree
  // (this one has no concept of camera PiP, zoom, click effects or a
  // telemetry-driven cursor), so Rough Cut's compositor now paints over the
  // Editor's viewer and there is only ever one thing drawing.
  assert.match(source, /StyledVideoPreview/);
  assert.match(source, /freecutProgramOverlay/);
  // The Editor's own duplicate chrome stays gone.
  assert.doesNotMatch(source, /freecutEditorModeBar/);
  assert.doesNotMatch(source, />Program</);
  assert.doesNotMatch(source, />Source</);
});

test('Editor v2 inspector starts at content and keeps working toggles', () => {
  const source = readFileSync(join(here, 'editor-v2-layout.tsx'), 'utf8');

  assert.match(source, /ev2InspectorBody/);
  assert.match(source, /role="switch"/);
  assert.match(source, /ev2InspectorEmpty/);
});

test('Editor v2 exposes transcript words as canonical timeline seeks', () => {
  const source = readFileSync(join(here, 'editor-v2-layout.tsx'), 'utf8');
  const transcriptSource = readFileSync(join(here, 'transcript-panel.tsx'), 'utf8');

  assert.match(source, /<TranscriptPanel/);
  assert.match(source, /onSeek=\{onPlayheadFrameChange\}/);
  assert.match(source, /aria-label="Edit transcript"/);
  assert.match(transcriptSource, /createTranscriptTimelineIndex\(document\)/);
  assert.match(
    transcriptSource,
    /transcriptWordEntryAtTimelineFrame\(/,
  );
  assert.match(transcriptSource, /disabled=\{firstTimelineFrame === null\}/);
  assert.match(transcriptSource, /event\.key === 'Enter'/);
  assert.match(transcriptSource, /onSeek\(firstTimelineFrame\)/);
  assert.match(transcriptSource, /ev2TranscriptChunk/);
  assert.match(
    transcriptSource,
    /firstTimelineFrame === null \? 'true' : undefined/,
  );
  assert.match(transcriptSource, /deriveScreenActionLandmarks\(document\)/);
  assert.match(
    transcriptSource,
    /searchScreenActionLandmarks\(landmarks, landmarkQuery\)/,
  );
  assert.match(
    transcriptSource,
    /timelineFrameForScreenActionLandmark\(landmark\)/,
  );
  assert.match(transcriptSource, /aria-label="Search screen actions"/);
  assert.match(transcriptSource, /aria-label="Transcript text editing"/);
  assert.match(transcriptSource, /aria-label="Transcript text editor"/);
  assert.match(transcriptSource, /Save transcript/);
  assert.match(transcriptSource, /Transcribe recording/);
  assert.match(transcriptSource, /Re-transcribe recording/);
  assert.doesNotMatch(transcriptSource, /Sona is converting/);
  assert.match(transcriptSource, /onTranscriptionProgress/);
  assert.match(transcriptSource, /transcribeProject/);
  assert.match(transcriptSource, /Paste transcript/);
  assert.match(transcriptSource, /Existing word timing will be preserved/);
  assert.match(transcriptSource, /className="ev2LandmarkEvidence"/);
  assert.match(transcriptSource, /evidenceSourceLabel\(evidence\.source\)/);
  assert.match(transcriptSource, /data-edit-surface-map="true"/);
  assert.match(transcriptSource, /data-edit-surface="transcript-words"/);
  assert.match(transcriptSource, /Transcript wording is read-only/);
  assert.match(source, /data-editing-entry="true"/);
  assert.match(source, /aria-label="Edit transcript timing"/);
  assert.match(source, /aria-label="Edit timeline clips"/);
  assert.match(source, /aria-label="Edit selected clip settings"/);
  assert.match(source, /Open transcript panel/);
  assert.doesNotMatch(source, /disabled=\{transcriptWordCount === 0\}/);
  assert.doesNotMatch(source, /disabled=\{!hasTranscript\}/);
  const shellSource = readFileSync(join(here, '../nle/nle-shell.tsx'), 'utf8');
  assert.match(shellSource, /function readEditorV2Preference\(\): boolean \{[\s\S]*?return true;/);
});

test('empty transcripts stay open in a comfortable editing workspace', () => {
  const source = readFileSync(join(here, 'editor-v2-layout.tsx'), 'utf8');
  const styles = readFileSync(join(here, '../styles.css'), 'utf8');

  assert.doesNotMatch(
    source,
    /transcriptWordCount === 0 && browserTab === 'transcript'/,
  );
  assert.match(source, /data-browser-tab=\{browserTab\}/);
  assert.match(styles, /data-browser-tab='transcript'/);
  assert.match(styles, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /data-advanced-tools='false'/);
});

test('cleanup draft persistence stays outside history until one finalize commit', () => {
  const source = readFileSync(join(here, 'editor-v2-layout.tsx'), 'utf8');

  assert.match(
    source,
    /onProjectChange\(next, \{ history: true, persist: true \}\)/,
  );
  assert.match(
    source,
    /\{ history: false, persist: true \}/,
  );
  assert.match(source, /finalizeCleanupDraftProject/);
});

test('transcript review exposes fixed speeds and verifies each manual cut before resuming', () => {
  const transcript = readFileSync(join(here, 'transcript-panel.tsx'), 'utf8');
  const shell = readFileSync(join(here, '../nle/nle-shell.tsx'), 'utf8');

  assert.match(transcript, /REVIEW_PLAYBACK_RATES\.map/);
  assert.match(transcript, /beginJoinVerification\(\{/);
  assert.match(transcript, /onPlaybackRateChange\(1\)/);
  assert.match(transcript, /advanceJoinVerification\(/);
  assert.match(transcript, /onPlaybackRateChange\(transition\.resumeRate\)/);
  assert.match(transcript, /setJoinVerification\(cancelJoinVerification\(joinVerification\)\)/);
  const cleanupReview = readFileSync(
    join(here, 'cleanup-review-panel.tsx'),
    'utf8',
  );
  assert.match(cleanupReview, /if \(!review\.playing\) return/);
  assert.doesNotMatch(shell, /deltaFrames = \(\(nowMs - lastMs\) \/ 1000\) \* fps \* playbackRate/);
});

test('transcript follow repositions the active word after virtualized chunk heights settle', () => {
  const transcript = readFileSync(join(here, 'transcript-panel.tsx'), 'utf8');

  assert.match(
    transcript,
    /const activeChunkTop =\s+activeChunkIndex === null \? null : offsets\[activeChunkIndex\]/,
  );
  assert.match(
    transcript,
    /\}, \[activeChunkTop, activeWordIndex, followPlayback\]\);/,
  );
});
