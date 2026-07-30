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
  assert.match(shell, /deltaFrames = \(\(nowMs - lastMs\) \/ 1000\) \* fps \* playbackRate/);
});
