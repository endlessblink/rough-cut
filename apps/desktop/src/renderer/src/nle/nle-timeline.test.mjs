import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('NLE timeline exposes selected-clip trim handles wired to trim mutation', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');

  assert.match(source, /rippleTrimClipById/);
  assert.match(source, /createTrimSession/);
  assert.match(source, /updateTrimSession/);
  assert.match(source, /setTrimSession\(latestSession\)/);
  assert.match(source, /setTrimSession\(null\)/);
  assert.match(source, /trimSession\?\.previews\?\.\[block\.id\]/);
  assert.match(source, /commitOrSurface\(rippleTrimClipById\(project, blockId, edge, commitFrame\)\)/);
  assert.match(source, /nleClipTrimHandle left/);
  assert.match(source, /nleClipTrimHandle right/);
  assert.match(source, /aria-label="Trim selected clip start"/);
  assert.match(source, /aria-label="Trim selected clip end"/);
  assert.match(source, /data-trim-edge/);
});

test('NLE timeline imports the navigator component instead of its math-only module', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const navigator = readFileSync(join(here, 'timeline-navigator.tsx'), 'utf8');

  assert.match(
    source,
    /import \{ NleTimelineNavigator \} from '\.\/timeline-navigator';/,
  );
  assert.match(navigator, /export function NleTimelineNavigator\(/);
  assert.doesNotMatch(
    source,
    /NleTimelineNavigator.*timeline-navigator-math\.mjs/,
  );
});

test('NLE timeline trim handles are absolute edge hit-zones, not inline content', () => {
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.nleClipTrimHandle\s*{[^}]*position: absolute;/s);
  assert.match(css, /\.nleClipTrimHandle\s*{[^}]*width: 20px;/s);
  assert.match(css, /\.nleClipTrimHandle\.left\s*{[^}]*left: 0;/s);
  assert.match(css, /\.nleClipTrimHandle\.right\s*{[^}]*right: 0;/s);
  assert.doesNotMatch(css, /\.nleClipTrimHandle\s*{[^}]*flex:/s);
});

test('NLE timeline marks source-bound trim handles as constrained', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const clipBuilder = readFileSync(join(here, 'timeline-clips.mjs'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(clipBuilder, /sourceDurationFrames/);
  assert.match(source, /edgeLimitState/);
  assert.match(source, /data-edge-limit=\{leftLimit\}/);
  assert.match(source, /data-edge-limit=\{rightLimit\}/);
  assert.match(css, /\.nleClipTrimHandle\[data-edge-limit="source-start"\]/);
  assert.match(css, /\.nleClipTrimHandle\[data-edge-limit="source-end"\]/);
});

test('NLE program monitor gives vertical recordings real editing space', () => {
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(css, /\.nleProgramMonitor\s*{[^}]*height: clamp\(340px, 52vh, 560px\);/s);
  assert.doesNotMatch(css, /\.nleProgramMonitor\s*{[^}]*aspect-ratio: 16 \/ 9;/s);
  assert.match(css, /\.nleProgramMonitor \.styledPreviewCanvas[\s\S]{0,120}max-height: calc\(100% - 1rem\);/);
});

test('NLE timeline wires local drag sessions and compact track controls', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(source, /createDragSession/);
  assert.match(source, /updateDragSession/);
  assert.match(source, /moveClipById/);
  assert.match(source, /updateTrackById/);
  assert.match(source, /reorderTrackById/);
  assert.match(source, /data-track-id/);
  assert.match(source, /aria-label=\{`Move \$\{track\.label\} up`\}/);
  assert.match(css, /\.nleTrackControls\s*{/);
  assert.match(css, /\.nleClipBlock\.dragging\s*{/);
});

test('NLE timeline accepts generated asset drops on compatible tracks', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');

  assert.match(source, /addGeneratedAssetToTrack/);
  assert.match(source, /application\/x-rough-cut-ai-asset/);
  assert.match(source, /handleGeneratedDragOver/);
  assert.match(source, /handleGeneratedDrop/);
  assert.match(source, /generatedDropValid/);
  assert.match(source, /generatedDropInvalid/);
});

test('NLE shell keeps the right split segment selected after splitting', () => {
  const source = readFileSync(join(here, 'nle-shell.tsx'), 'utf8');

  assert.match(source, /rightClipIdAfterSplit/);
  assert.match(source, /setSelectedClipId\(rightClipIdAfterSplit\(next, selectedClipId, clampedPlayhead\)\)/);
});

test('Home moves the shared playhead and timeline viewport to the start in both editors', () => {
  const nleTimelineSource = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const nleShellSource = readFileSync(join(here, 'nle-shell.tsx'), 'utf8');
  const recordingEditorSource = readFileSync(join(here, '..', 'main.tsx'), 'utf8');

  assert.match(nleTimelineSource, /function handleTimelineHomeKey[\s\S]+event\.key !== 'Home'[\s\S]+isTypingTarget\(event\.target\)[\s\S]+onPlayheadFrameChange\(0\)[\s\S]+bodiesRef\.current\.scrollLeft = 0/);
  assert.doesNotMatch(nleShellSource, /else if \(e\.key === 'Home'\)/);
  assert.match(recordingEditorSource, /function handleTimelineHomeKey[\s\S]+event\.key !== 'Home'[\s\S]+isEditableShortcutTarget\(event\.target\)[\s\S]+onScrubEnd\(0\)[\s\S]+viewportRef\.current\.scrollLeft = 0/);
});

test('NLE timeline ships Editor v2 deck affordances (ghost channels, tags, zoom gating)', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  // Ghost channels create tracks on drop.
  assert.match(source, /addGeneratedAssetToNewTrack/);
  assert.match(source, /handleGhostDragOver/);
  assert.match(source, /handleGhostDrop/);
  assert.match(source, /nleTrackLaneBody ghost/);
  // Track tag chips (V1/A1…) and the one-row header grammar.
  assert.match(source, /nleTrackTag/);
  assert.match(source, /nleTrackControlsSecondary/);
  assert.match(css, /\.nleTrackLaneHeader:hover \.nleTrackControlsSecondary/);
  // Horizontal scroll only exists when zoomed in.
  assert.match(source, /data-zoomed=\{zoomedIn \? 'true' : undefined\}/);
  assert.match(css, /\.nleLaneBodies\[data-zoomed='true'\]\s*{\s*overflow-x: auto;/);
  // Status chips / Legacy toggle relocate into the toolbar via topbarExtras.
  assert.match(source, /topbarExtras/);
});

test('NLE timeline groups tracks into visible sections with real metadata, not placeholder controls', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(source, /const trackSections = React\.useMemo/);
  assert.match(source, /nleTrackSectionHeader/);
  assert.match(source, /nleTrackSectionBand/);
  assert.match(source, /section\.tracks\.length === 1 \? 'track' : 'tracks'/);
  assert.match(source, /track\.blocks\.length === 1 \? 'clip' : 'clips'/);
  assert.match(source, /nleTrackLaneStats/);
  assert.match(source, /addEmptyTrackToProject/);
  assert.match(source, /aria-label=\{`Add \$\{section\.label\.toLowerCase\(\)\} track`\}/);
  assert.match(source, /Drop media here to create/);

  assert.match(css, /\.nleTrackSectionHeader\s*{/);
  assert.match(css, /\.nleTrackSectionBand\s*{/);
  assert.match(css, /\.nleTrackLaneStats\s*{/);
  assert.match(css, /\.nleAddTrackButton\s*{/);

  assert.doesNotMatch(source, /toggleTrackSolo|toggleTrackSyncLock/);
});

test('NLE timeline includes the FreeCut-inspired overview navigator without touching transcript editing', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const navigator = readFileSync(join(here, 'timeline-navigator.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(source, /NleTimelineNavigator/);
  assert.match(source, /data-ui-region=\"nle-timeline\"/);
  assert.match(navigator, /data-ui-region=\"nle-timeline-navigator\"/);
  assert.match(source, /onSeekFrame=\{onPlayheadFrameChange\}/);
  assert.match(navigator, /onSeekFrame\(navigatorFrameAtClientX/);
  assert.match(navigator, /role=\"slider\"/);
  assert.match(css, /\.nleTimelineNavigatorSurface\s*{/);
});

test('NLE toolbar stays premium: centered timecode, no noise, dataset clips', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  // Master timecode is rendered by the timeline and centered as text.
  assert.match(source, /className="nleTimecode"/);
  assert.match(css, /\.nleTimecode\s*{[^}]*position: absolute;/s);
  assert.match(css, /\.nleTimecode\s*{[^}]*left: 50%;/s);
  // Tabular numerals in the UI font — no terminal mono for timecode/ruler.
  assert.match(css, /\.nleTimecode\s*{[^}]*font-variant-numeric: tabular-nums;/s);
  assert.match(css, /\.nleTimelineRulerLabel\s*{[^}]*font-variant-numeric: tabular-nums;/s);
  assert.doesNotMatch(css, /\.nleTimecode\s*{[^}]*monospace/s);
  assert.doesNotMatch(css, /\.nleTimelineRulerLabel\s*{[^}]*monospace/s);
  // Toolbar noise stays deleted: no hint sentence, no In/Out chips.
  assert.doesNotMatch(source, /Select a clip to trim, move, or split/);
  assert.doesNotMatch(source, /nleTimelineHint/);
  // Committed clip range is machine-readable for harnesses/tooling.
  assert.match(source, /data-timeline-in=\{Math\.round\(block\.timelineIn\)\}/);
  assert.match(source, /data-timeline-out=\{Math\.round\(block\.timelineOut\)\}/);
});

test('NLE clip visuals: media spans wired with edit-safe lifecycle', () => {
  const source = readFileSync(join(here, 'nle-timeline.tsx'), 'utf8');
  const clips = readFileSync(join(here, 'timeline-clips.mjs'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  // Strip/wave spans render inside clip blocks, offset by sourceIn.
  assert.match(source, /clipSourceFilePath/);
  assert.match(source, /filmstripBackground/);
  assert.match(source, /waveformBackground/);
  assert.match(source, /nleClipMedia/);
  assert.match(css, /\.nleClipMedia\s*{/);
  assert.match(css, /\.nleClipNameBar\s*{/);
  // Blocks expose mediaId so visuals can resolve the source file.
  assert.match(clips, /\bmediaId,/);
  // REGRESSION (slice 3): per-run effect cancellation dropped strips that
  // resolved mid-edit (split during generation → permanently flat clips).
  // The guard must be unmount-only.
  assert.match(source, /visualsAliveRef\.current = false; }, \[\]\);/);
  assert.doesNotMatch(source, /let cancelled = false;[\s\S]{0,800}getClipVisual/);
  // Failures must warn (not vanish) and never retry-loop.
  assert.match(source, /\[nle:clip-visuals\] failed/);
});

test('NLE shell ships the Ctrl+Shift+D debug state dump (TASK-228)', () => {
  const source = readFileSync(join(here, 'nle-shell.tsx'), 'utf8');

  assert.match(source, /saveDebugDump/);
  assert.match(source, /e\.shiftKey && \(e\.key === 'd' \|\| e\.key === 'D'\)/);
  // The dump carries enough to reconstruct the session in a harness.
  for (const field of ['playheadFrame', 'selectedClipId', 'editMode', 'timeline:', 'playbackDebug']) {
    assert.ok(source.includes(field), `dump includes ${field}`);
  }
  assert.match(source, /nleDebugDumpNotice/);
});

test('NLE playback follows the preview media clock instead of a second free-running clock', () => {
  const source = readFileSync(join(here, 'nle-shell.tsx'), 'utf8');

  assert.doesNotMatch(source, /const deltaFrames = \(\(nowMs - lastMs\) \/ 1000\) \* fps \* playbackRate/);
  assert.doesNotMatch(source, /window\.requestAnimationFrame\(tick\)/);
});

test('NLE shell wires undo and redo through shared edit history controls (TASK-229)', () => {
  const shell = readFileSync(join(here, 'nle-shell.tsx'), 'utf8');
  const main = readFileSync(join(here, '..', 'main.tsx'), 'utf8');
  const css = readFileSync(join(here, '..', 'styles.css'), 'utf8');

  assert.match(shell, /canUndo = false/);
  assert.match(shell, /canRedo = false/);
  assert.match(shell, /import \{ EMPTY_EDIT_HISTORY, recordEdit, redoEdit, undoEdit \} from '\.\.\/edit-history\.mjs'/);
  assert.match(shell, /const \[timelineHistory, setTimelineHistory\] = React\.useState<NleEditHistory>/);
  assert.match(shell, /const usesExternalHistory = Boolean\(onUndo \|\| onRedo\)/);
  assert.match(shell, /if \(recordHistory && !usesExternalHistory\) \{[\s\S]*recordEdit\(history, project\) as NleEditHistory/);
  assert.match(shell, /onProjectChange\(next, \{[\s\S]*history: recordHistory && usesExternalHistory,[\s\S]*persist: options\.persist/);
  assert.match(shell, /const result = undoEdit\(timelineHistory, project\)/);
  assert.match(shell, /onProjectChange\(result\.snapshot, \{ history: false \}\)/);
  assert.match(shell, /const result = redoEdit\(timelineHistory, project\)/);
  assert.match(shell, /const historyControls = \(/);
  assert.match(shell, /aria-label="Undo timeline edit"/);
  assert.match(shell, /aria-label="Redo timeline edit"/);
  assert.match(shell, /<ArrowCounterClockwise aria-hidden="true" \/>/);
  assert.match(shell, /<ArrowClockwise aria-hidden="true" \/>/);
  assert.match(shell, /if \(\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === 'z'\)/);
  assert.match(shell, /e\.shiftKey \? requestRedo\(\) : requestUndo\(\)/);
  assert.match(shell, /if \(usesExternalHistory\) return;[\s\S]*e\.preventDefault\(\)/);

  assert.match(main, /onProjectChange=\{\(next, options\) => applyProjectChange\(/);
  assert.match(main, /persist: options\?\.persist/);
  assert.match(main, /canUndo=\{editHistory\.undo\.length > 0\}/);
  assert.match(main, /canRedo=\{editHistory\.redo\.length > 0\}/);
  assert.match(main, /onUndo=\{undoProjectEdit\}/);
  assert.match(main, /onRedo=\{redoProjectEdit\}/);

  assert.match(css, /\.nleHistoryControls\s*{/);
  assert.match(css, /\.nleHistoryButton:disabled\s*{/);
  assert.doesNotMatch(shell, />Undo</);
  assert.doesNotMatch(shell, />Redo</);
});
