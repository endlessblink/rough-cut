import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

test('styled video preview reads cursor events through the recording asset accessor', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /getCursorEvents\(document\)/);
  assert.doesNotMatch(source, /assets\?\.\[0\].*cursorEvents/s);
});

test('styled video preview draws cursor from source media time without changing video resolver asset', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /cursorAtTimeMs\(cursorEvents, \(cursorFrame \/ fps\) \* 1000, fps\)/);
  assert.doesNotMatch(source, /preferredPlaybackAssetId: recordingAssetId/);
});

test('styled video preview can resolve timeline-time playback through the shared resolver', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /timeMode\?: PreviewTimeMode/);
  assert.match(source, /resolveTimelinePreviewFrame\(document, currentFrame/);
  assert.match(source, /resolveTimelineFrame\(project\.document as unknown as ProjectDocument, timelineFrame\)/);
  assert.match(source, /if \(timeMode === 'timeline' && !screenLayer\)/);
  assert.match(source, /if \(timeMode === 'timeline'\) return;/);
  assert.match(source, /controlledPlaying !== undefined \|\| !isPlaying/);
  assert.match(source, /video\.pause\(\);\n\s+cameraVideo\?\.pause\(\);\n\s+return;/);
  assert.match(source, /expectedSourceTime = Math\.max\(0, screenLayer\.sourceFrame \/ fps\)/);
  assert.doesNotMatch(source, /nextTimelineFrame = currentFrame \+ \(sourceFrame - screenLayer\.sourceFrame\)/);
});

test('styled video preview uses the canvas as the only visible edited playback compositor', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const css = readFileSync(join(here, 'styles.css'), 'utf8');

  assert.match(source, /className="hiddenSource"/);
  assert.match(source, /className=\{`styledPreviewCanvas/);
  assert.doesNotMatch(source, /nativePlaybackActive/);
  assert.doesNotMatch(source, /nativePlaybackRendered/);
  assert.doesNotMatch(source, /nativePlaybackPhase/);
  assert.doesNotMatch(source, /nativePlaybackSurface/);
  assert.doesNotMatch(source, /nativePlaybackVideo/);
  assert.doesNotMatch(source, /publishNativePlaybackLayout/);
  assert.doesNotMatch(source, /nativePlaybackBackdrop/);
  assert.doesNotMatch(source, /screenTransformRef/);
  assert.doesNotMatch(css, /\.nativePlaybackBackdrop/);
  assert.doesNotMatch(css, /\.nativePlaybackSurface/);
  assert.doesNotMatch(css, /\.nativeCameraPlaybackSurface/);
  assert.doesNotMatch(css, /\.nativePlaybackActive \.styledPreviewCanvas\s*{[^}]*opacity:\s*0/s);
  assert.doesNotMatch(css, /\.nativePlaybackRendered \.styledPreviewCanvas\s*{[^}]*opacity:\s*0/s);
});

test('styled video preview keeps resolving and drawing zoom frames while timeline playback is active', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /if \(video\.seeking \|\| video\.readyState < 2\) \{\n\s+rafId = window\.requestAnimationFrame\(tick\);/);
  assert.match(source, /const frame = resolveCurrentFrame\(currentFrame\)/);
  assert.match(source, /resolveTimelinePreviewFrame\(document, currentFrame/);
  assert.match(source, /ctx\.translate\(sourceWidth \/ 2 \+ offsetX, sourceHeight \/ 2 \+ offsetY\)/);
  assert.match(source, /ctx\.scale\(scale, scale\)/);
  assert.match(source, /ctx\.drawImage\(video, 0, 0, sourceWidth, sourceHeight\)/);
});

test('styled video preview surfaces offscreen cursor state without clamping cursor draw', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /getCursorBoundsStatus\(cursorPos, sourceWidth, sourceHeight\)/);
  assert.match(source, /cursorBounds\?\.inside !== false/);
  assert.match(source, /cursorOffscreenHint/);
  assert.doesNotMatch(source, /drawCursorPath\(ctx, Math\.max/);
});

test('styled video preview publishes resolved layout for export parity', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /export type ResolvedPreviewLayout/);
  assert.match(source, /onResolvedLayoutChange\?: \(layout: ResolvedPreviewLayout\) => void/);
  assert.match(source, /publishResolvedLayout\(resolvedScreenFrame, cameraRectRef\.current, canvasWidth, canvasHeight\)/);
  assert.match(source, /rectToNormalizedFrame\(screenFrame, canvasWidth, canvasHeight\)/);
  assert.match(source, /rectToNormalizedFrame\(cameraFrame, canvasWidth, canvasHeight\)/);
});

test('recording editor export merges the live preview layout into the export document', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');

  assert.match(source, /documentOverride: ProjectState\['document'\] \| null = null/);
  assert.match(source, /document: documentOverride \?\? project\.document/);
  assert.match(source, /const resolvedPreviewLayoutRef = React\.useRef<ResolvedPreviewLayout \| null>\(null\)/);
  assert.match(source, /mergeResolvedPreviewLayout\(project\.document, recordingAsset\.id, resolvedPreviewLayoutRef\.current\)/);
  assert.match(source, /onResolvedLayoutChange=\{\(layout\) => \{ resolvedPreviewLayoutRef\.current = layout; \}\}/);
  assert.match(source, /onExportMode\(mode, documentForExport\)/);
});
