import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(import.meta.dirname, 'main.tsx'), 'utf8');
const templates = readFileSync(join(import.meta.dirname, '../../../../../packages/project-model/src/recording-templates.ts'), 'utf8');
const recordingTimeline = readFileSync(join(import.meta.dirname, 'recording-timeline.mjs'), 'utf8');
const styles = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');
const interactionHarness = readFileSync(join(import.meta.dirname, '../../../../../scripts/recording-editor-interactions-playwright.mjs'), 'utf8');
const hostRunner = readFileSync(join(import.meta.dirname, '../../../../../scripts/host-readiness-runner.sh'), 'utf8');
const packageLinux = readFileSync(join(import.meta.dirname, '../../../../../scripts/package-linux.mjs'), 'utf8');
const errorMatrix = readFileSync(join(import.meta.dirname, '../../../../../docs/rough-cut-linked-boundary-error-matrix.md'), 'utf8');

test('recording editor makes the whole timeline surface seekable', () => {
  assert.match(source, /className="visualTimeline"[\s\S]+onPointerDownCapture=\{handleTimelineSurfacePointerDown\}/);
  assert.match(source, /function handleTimelineSurfacePointerDown[\s\S]+beginSeekDrag\(track, event\.currentTarget/);
  assert.match(source, /function beginClipMoveDrag[\s\S]+onScrubStart\(\)[\s\S]+onScrub\(/);
  assert.match(source, /const maxIn = Math\.max\(minIn, next \? Math\.round\(next\.timelineIn \?\? 0\) - duration : sourceFrameDuration - duration\)/);
  assert.match(source, /const \[timelineScrubbing, setTimelineScrubbing\]/);
  assert.match(source, /function handleTimelineScrubStart\(\)[\s\S]+setTimelineScrubbing\(true\)[\s\S]+setPreviewPlaying\(false\)/);
  assert.match(source, /function handleTimelineScrubEnd\(nextTimeSec: number\)[\s\S]+setTimelineScrubbing\(false\)[\s\S]+setTimelineSeekSec\(nextTimeSec\)/);
  assert.match(source, /<VideoPreview[\s\S]+scrubbing=\{timelineScrubbing\}/);
});

test('recording editor keeps controls outside the seek surface', () => {
  const toolbarAt = source.indexOf('data-ui-region="timeline-toolbar"');
  const viewportAt = source.indexOf('className={`timelineViewport');
  assert.ok(toolbarAt >= 0 && viewportAt >= 0 && toolbarAt < viewportAt);
});

test('recording editor makes the attached audio clip visible', () => {
  assert.match(source, /label="Audio" className="audioLane"/);
  assert.match(source, /model\.lanes\.audio\.map\(\(region, index\) => \{[\s\S]+className=\{`presenceRegion audioRegion/);
  assert.match(source, /data-recording-audio-clip-id=\{region\.id\}/);
  assert.match(source, /getClipVisual\(\{[\s\S]+kind: 'waveform'/);
  assert.match(source, /className="audioWaveform"/);
  assert.match(source, /className="audioSilenceGuide"/);
  assert.match(source, /function linkedScreenRegionForAudio\([\s\S]+timelineIn[\s\S]+timelineOut/);
  assert.match(source, /const linkedSelected = Boolean\(linkedScreen && selectedScreenClipIds\.includes\(linkedScreen\.id\)\)/);
  assert.match(source, /function audioRegionStyle\([\s\S]+linkedScreenRegionForAudio\(region\)[\s\S]+frameRangeToPlacement/);
  assert.match(source, /data-recording-linked-screen-clip-id=\{linkedScreen\?\.id \?\? ''\}/);
  assert.doesNotMatch(source, /model\.lanes\.screen\[index\] \?\? linkedScreenRegionForAudio/);
  assert.doesNotMatch(source, /selectedScreenClipId === model\.lanes\.screen\[index\]\?\.id/);
  assert.match(styles, /\.audioLane \.presenceRegion\s*\{[\s\S]+background:\s*#1b405c/);
  assert.match(styles, /\.audioWaveform\s*\{[\s\S]+filter:\s*drop-shadow/);
  assert.match(styles, /\.audioSilenceGuide\s*\{[\s\S]+border-top:\s*1px dashed/);
  assert.match(source, /function audioWaveformStyle\(timelineIn\?\: number\)[\s\S]+backgroundSize: `\$\{timelineTrackWidthPx\}px 100%`[\s\S]+backgroundPosition: `\$\{-Math\.round\(startFrame \* pixelsPerFrame\)\}px center`/);
  assert.match(source, /backgroundImage: `url\("\$\{waveformUrl\}"\)`, \.\.\.audioWaveformStyle\(region\.timelineIn \?\? linkedScreen\?\.timelineIn\)/);
  assert.match(styles, /\.linkedAudioRegion\s*\{[\s\S]+box-shadow:/);
  assert.match(source, /selectedScreenClipIds\.includes\(region\.id\)/);
  assert.match(source, /event\.shiftKey \? \(current\.includes\(region\.id\)/);
  assert.match(source, /clipCutBoundary/);
  assert.match(styles, /\.clipCutBoundary\s*\{[\s\S]+box-shadow:/);
  assert.match(source, /const waveformWidthPx = Math\.max\(1024, Math\.min\(16384/);
});

test('recording editor derives both lane roots from canonical frame ranges', () => {
  assert.match(source, /function screenRegionStyle\([\s\S]+frameRangeToPlacement\(region\.timelineIn \?\? 0, region\.timelineOut \?\? region\.timelineIn \?\? 1, fps, model\.durationSec\)/);
  assert.match(source, /function audioRegionStyle\([\s\S]+frameRangeToPlacement\(region\.timelineIn \?\? 0, region\.timelineOut \?\? region\.timelineIn \?\? 1, fps, model\.durationSec\)/);
  assert.doesNotMatch(source, /function audioRegionStyle[\s\S]+return \{ left: region\.left/);
  assert.match(errorMatrix, /DOM rectangles look aligned but the screenshot is visibly split/);
  assert.match(errorMatrix, /Independent SCREEN\/AUDIO pixel scan/);
});

test('recording editor keeps Space for playback and does not let camera buttons swallow it', () => {
  assert.doesNotMatch(source, /closest\('input, textarea, select, button, \[contenteditable="true"\]\)/);
  assert.match(source, /event\.key\.toLowerCase\(\) === 's'[\s\S]+splitAtPlayhead/);
  assert.match(source, /if \(pendingSeekRef\.current !== null \|\| seekingRef\.current\)[\s\S]+await \(seekInFlightRef\.current \?\? flushPendingExternalSeek\(\)\)[\s\S]+await video\.play\(\)/);
  assert.match(source, /onSeeked=\{handleSeekSettled\}/);
});

test('recording editor E2E targets the real 33-minute recording used for acceptance', () => {
  assert.match(hostRunner, /REAL_PROJECT_PATH=.*rough-cut-2026-07-25T12-18-16-524Z\.roughcut/);
});

test('dock launcher isolates each packaged renderer build from stale Electron processes', () => {
  assert.match(packageLinux, /BUNDLE_ID=.*basename/);
  assert.match(packageLinux, /PROFILE_ROOT=.*rough-cut-mvp\/dock\/\$BUNDLE_ID/);
  assert.match(packageLinux, /--user-data-dir=\$PROFILE_ROOT/);
  assert.match(interactionHarness, /const dockLaunchPath = join\(artifactRoot, 'dock-launch\.sh'\)/);
  assert.match(interactionHarness, /executablePath: dockLaunchPath/);
  assert.match(interactionHarness, /Installed Rough Cut desktop entry is not bound to the current dock launcher/);
  assert.match(interactionHarness, /Exec=env ROUGH_CUT_DOCK_LAUNCH=1/);
  assert.match(interactionHarness, /readPaintedBoundaryEvidence/);
  assert.match(interactionHarness, /Painted SCREEN\/AUDIO boundary pixels diverged/);
  assert.match(packageLinux, /package-identity\.json/);
});

test('recording editor keeps template choices readable in the setup board', () => {
  assert.match(styles, /\.templateGrid\s*\{[\s\S]+grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.templateCardLabel\s*\{[\s\S]+text-overflow:\s*ellipsis/);
  assert.match(styles, /\.templateCardMeta\s*\{[\s\S]+text-overflow:\s*ellipsis/);
});

test('recording editor exposes a true 16:9 vertical-camera and horizontal-screen template', () => {
  assert.match(templates, /label: 'Side-by-side · 16:9'[\s\S]+layoutLabel: 'Vertical camera \+ horizontal screen'[\s\S]+aspectRatio: '16:9'/);
  assert.match(templates, /cameraFrame: \{ x: 0\.105, y: 0\.17, w: 0\.245, h: 0\.66 \}[\s\S]+screenFrame: \{ x: 0\.385, y: 0\.30, w: 0\.53, h: 0\.40 \}/);
  assert.match(source, /const builtIn = applyRecordingTemplatePreset\(background, templateId\)[\s\S]+const applied = builtIn[\s\S]+recordingTemplateOverrides\[templateId\]/);
});

test('recording editor preserves the pre-template aspect for original restore', () => {
  assert.match(source, /recordingEditOriginalAspectRatio/);
  assert.match(source, /recordingEditOriginalAspectRatio: project\.document\.settings\?\.aspectRatio \?\? 'auto'/);
  assert.match(recordingTimeline, /const originalAspectRatio = inferOriginalRecordingAspectRatio\(recording\.metadata\)/);
  assert.match(recordingTimeline, /inferOriginalRecordingAspectRatio\(recording\.metadata\)/);
});

test('recording editor supports exact point cuts by click and keyboard', () => {
  assert.match(source, /Math\.abs\(endFrame - startFrame\) < 2\)[\s\S]+onSplitAtFrame\?\.\(startFrame\)/);
  assert.match(source, /event\.key\.toLowerCase\(\) === 's'[\s\S]+splitAtPlayhead/);
  assert.match(source, /onSplitAtFrame=\{splitAtFrame\}/);
  assert.match(source, /aria-label="Split at playhead"[\s\S]+onClick=\{\(\) => void onSplitAtPlayhead\?\.\(\)\}/);
  assert.match(source, /aria-label="Restore original recording"/);
  assert.match(source, /onSplitAtPlayhead=\{splitAtPlayhead\}/);
  assert.match(source, /aria-label="Range cut mode"[\s\S]+onCutModeToggle/);
  const rangeToolbar = source.match(/aria-label="Range cut mode"[\s\S]{0,500}/)?.[0] ?? '';
  assert.match(rangeToolbar, />Range<\/button>/);
  assert.doesNotMatch(rangeToolbar, /PhosphorScissors/);
  assert.match(styles, /\.timelineRangeButton\s*\{[\s\S]+min-width:\s*3\.25rem[\s\S]+width:\s*auto/);
});

test('recording editor cancels clip moves without committing them', () => {
  assert.match(source, /const cancel = \(\) => \{[\s\S]+setClipDragPreview\(null\)[\s\S]+removeEventListener\('pointercancel', cancel\)/);
  assert.match(source, /if \(moved && latestIn !== initialIn\) onMoveClip/);
  assert.match(source, /function beginClipMoveDrag[\s\S]+const startClientX = event\.clientX[\s\S]+Math\.abs\(moveEvent\.clientX - startClientX\) < 4[\s\S]+if \(moved && latestIn !== initialIn\) onMoveClip/);
  assert.match(interactionHarness, /Normal clip click changed the timeline structure/);
  assert.match(source, /function beginClipTrimDrag[\s\S]+Math\.abs\(moveEvent\.clientX - startClientX\) < 4[\s\S]+const commitFrame = moved \? latestFrame : null/);
  assert.match(source, /function beginClipTrimDrag[\s\S]+window\.addEventListener\('pointercancel', cancel/);
});

test('recording editor exposes trim handles only on the selected clip', () => {
  assert.match(source, /selectedScreenClipId === region\.id \? <button type="button" role="slider" className="trimHandle trimHandleStart"/);
  assert.match(source, /selectedScreenClipId === region\.id \? <button type="button" role="slider" className="trimHandle trimHandleEnd"/);
  assert.match(styles, /\.clipBar:not\(\.selectedClip\) \.trimHandle\s*\{[\s\S]+pointer-events:\s*none/);
});

test('recording editor keeps trim guidance local to the selected clip', () => {
  assert.match(source, /selectedScreenClipId === region\.id && trimDragPreview\?\.clipId === region\.id \? <span className="trimAvailabilityGuide"/);
  assert.match(styles, /\.trimAvailabilityGuide\s*\{[\s\S]+pointer-events:\s*none[\s\S]+position:\s*absolute/);
  assert.match(interactionHarness, /Adjacent layer changed after trim commit/);
});

test('recording editor protects the other core gesture contracts', () => {
  assert.match(source, /trimDragPreview[\s\S]+deltaFrames/);
  assert.match(source, /rippleDeleteRecordingRange/);
  assert.match(source, /event\.key === '\['[\s\S]+setTrimStartToPlayhead/);
  assert.match(source, /event\.key === '\]'[\s\S]+setTrimEndToPlayhead/);
  assert.match(source, /!event\.ctrlKey && !event\.metaKey[\s\S]+applyTimelineViewportZoom\(event\.deltaY < 0 \? 1 : -1\)/);
  assert.match(source, /pendingScrollLeftRef\.current = 0/);
  assert.match(source, /const renderedTrack = viewport\.querySelector<HTMLElement>\('\.screenLane \.laneTrack'\)\?\.getBoundingClientRect\(\)/);
  assert.match(source, /const renderedPpf = renderedTrack[\s\S]+renderedTrack\.width \/ timelineDurationFrames/);
  assert.match(source, /const zoomAnchorScreenXRef = React\.useRef<number \| null>\(null\)/);
  assert.match(source, /const currentScreenX = playhead[\s\S]+el\.scrollLeft \+ currentScreenX - anchorScreenX/);
  assert.match(interactionHarness, /drag-to-play verification/);
  assert.match(interactionHarness, /releasedTimelineSec/);
  assert.match(interactionHarness, /afterDragPlayback\.currentTime < releasedTimeSec/);
  assert.match(interactionHarness, /readPreviewMediaEvidence/);
  assert.match(interactionHarness, /initialPreviewMedia\.hasVisibleMedia/);
  assert.match(interactionHarness, /postSeekPreviewMedia\.hasVisibleMedia/);
  assert.match(interactionHarness, /const assertLinkedLaneGeometry = \(label, lanes\) =>[\s\S]+left Screen and Audio boundaries misaligned/);
  assert.match(interactionHarness, /audioByScreenId = new Map\(lanes\.audio\.map/);
  assert.match(interactionHarness, /repeated timeline-start cuts/);
  assert.match(interactionHarness, /repeatedBoundaryScreenshotPath/);
  assert.match(interactionHarness, /repeatedCutEvidence/);
  assert.match(interactionHarness, /assertLinkedLaneGeometry\('S split', await readLinkedLaneBoxes\(\)\)/);
  assert.match(interactionHarness, /const initialLinkedLanes = await readLinkedLaneBoxes\(\)/);
  assert.match(interactionHarness, /assertLinkedLaneGeometry\('initial loaded timeline', initialLinkedLanes\)/);
  assert.match(source, /data-recording-linked-lane-boundaries=\{model\.linkedLaneBoundaryMismatches\?\.length === 0 \? 'pass' : 'fail'\}/);
  assert.match(interactionHarness, /data-recording-linked-lane-boundaries/);
  assert.match(interactionHarness, /recording-editor-linked-boundaries\.png/);
  assert.match(interactionHarness, /boundaryScreenshotPath/);
  assert.match(interactionHarness, /readRenderedCutEvidence/);
  assert.match(interactionHarness, /evidence\.boundaries\.length !== evidence\.screen\.length - 1/);
  assert.match(interactionHarness, /selectedScreenClipIds/);
  assert.match(interactionHarness, /markerErrorPx/);
  assert.match(interactionHarness, /edgeErrorPx/);
  assert.match(interactionHarness, /boundaryErrorPx/);
  assert.match(interactionHarness, /boundaryZoomScreenshotPath/);
  assert.match(interactionHarness, /interactionReportPath/);
});

test('recording editor makes clip selection and ripple deletion unmistakable', () => {
  assert.match(source, /selectedScreenClipId/);
  assert.match(source, /className=\{`clipBar \$\{selectedScreenClipIds\.includes\(region\.id\) \? 'selectedClip' : ''\}/);
  assert.match(source, /const separated = \(placement: \{ left: number; width: number \}\)/);
  assert.match(source, /width: `max\(0px, calc\(\$\{placement\.width\}% - 2px\)\)`/);
  assert.doesNotMatch(source, /clipDeleteButton|Delete screen clip/);
  assert.match(source, /function deleteScreenClip\(clipId: string\)[\s\S]+onAddCutBetween\(sourceIn, sourceOut\)/);
  assert.match(source, /event\.key === 'Delete' \|\| event\.key === 'Backspace'[\s\S]+deleteScreenClip\(selectedScreenClipId\)/);
  assert.match(source, /className="clipBody"[\s\S]+onKeyDown=\{\(event\) => \{ if \(\(event\.key === 'Delete' \|\| event\.key === 'Backspace'\)/);
  assert.match(styles, /\.clipBar\.selectedClip\s*\{[\s\S]+box-shadow:/);
  assert.match(styles, /\.projectEditor\.setupClosed\s*\{[\s\S]+grid-template-columns:\s*4rem 0 minmax\(0, 1fr\) 21rem/);
  assert.doesNotMatch(styles, /\.projectEditor\.timelineFocus > \.setupBoard/);
  assert.doesNotMatch(styles, /\.projectEditor\.timelineFocus > \.inspector/);
  assert.match(styles, /\.playhead\s*\{[\s\S]+width: 3px/);
  assert.match(styles, /\.screenLane \.laneTrack\s*\{[\s\S]+background:\s*#111c2c/);
  assert.match(styles, /\.clipBar\.selectedClip\s*\{[\s\S]+box-shadow: inset 0 0 0 2px #8fc2ff/);
  assert.match(source, /Trimming is an edge edit, not a ripple edit/);
  assert.match(source, /const baseline = trimDragPreview \? trimDragBaseline\.find/);
  assert.match(source, /const baseline = trimDragPreview \? trimDragBaseline\.find\(\(clip\) => clip\.id === clipId\)/);
});

test('recording editor makes the left panel state explicit', () => {
  assert.match(source, /data-panel-state=\{panelOpen \? 'expanded' : 'collapsed'\}/);
  assert.match(source, /aria-label=\{panelOpen \? 'Collapse tool panel' : 'Expand tool panel'\}/);
  assert.match(source, /title=\{panelOpen \? 'Collapse tool panel' : 'Expand tool panel'\}/);
  assert.match(styles, /\.toolPanelToggle\s*\{[\s\S]+min-height:\s*3\.15rem/);
  assert.match(styles, /\.toolPanelToggle\[aria-pressed="true"\]/);
});

test('recording editor makes the right export panel state explicit', () => {
  assert.match(source, /data-inspector-state=\{inspectorOpen \? 'expanded' : 'collapsed'\}/);
  assert.match(source, /className="inspectorRailToggle"/);
  assert.match(source, /aria-label=\{inspectorOpen \? 'Hide export panel' : 'Show export panel'\}/);
  assert.match(source, /title=\{inspectorOpen \? 'Hide export panel' : 'Show export panel'\}/);
  assert.match(styles, /\.projectEditor\.inspectorClosed\s*\{[\s\S]+minmax\(0, 0\)/);
  assert.match(styles, /\.inspectorRailToggle\s*\{[\s\S]+position:\s*absolute[\s\S]+right:\s*0/);
  assert.match(styles, /\.inspectorRailToggle\[aria-pressed="true"\]/);
});

test('selecting on the timeline never reopens side panels the user hid', () => {
  // 2026-09-26: with both panels hidden, clicking the playhead or a clip
  // re-opened the left panel. Only an explicit tool pick may reveal it.
  assert.match(source, /onActiveToolChange\('camera', \{ revealPanel: false \}\)/);
  assert.match(source, /onActiveToolChange\('timeline', \{ revealPanel: false \}\)/);
  assert.match(source, /if \(options\?\.revealPanel !== false\) setSetupBoardOpen\(true\);/);
  // Re-clicking the view tab you are already on keeps your panel layout.
  assert.match(source, /if \(nextView === 'editor' && activeAppView !== 'editor'\) \{\n\s+setSetupBoardOpen\(true\);/);
});
