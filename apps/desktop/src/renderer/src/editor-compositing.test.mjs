/**
 * Regressions for "the Editor is a window onto the one timeline".
 *
 * Every assertion here stands for something that was actually broken and that a
 * screenshot alone would not have caught. Each test says what the user saw.
 *
 * These are source-shape assertions, in the style of the other guards in this
 * folder: the behaviour lives inside a requestAnimationFrame loop driving a
 * canvas from decoded video, which no unit test can stand up. They are a tripwire
 * for the specific mistake, not a proof of correctness — the real check is still
 * launching the packaged app and looking at it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..', '..');

const preview = () => readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
const surface = () => readFileSync(join(here, 'freecut-editor-surface.tsx'), 'utf8');
const styles = () => readFileSync(join(here, 'styles.css'), 'utf8');
const vendored = (relative) => readFileSync(join(repoRoot, 'vendor', 'freecut', 'src', relative), 'utf8');

// --- The user saw: a clip added in the Editor did not appear at all. ---------
// The draw loop is created once and is not restarted when layers change, so
// reading the props directly meant it drew the (empty) stack it started with.

test('the draw loop reads Editor layers through refs, never captured props', () => {
  const source = preview();

  assert.match(source, /overlayLayersAboveRef\.current/);
  assert.match(source, /overlayLayersBelowRef\.current/);
  // The props themselves must not be read inside the loop.
  assert.doesNotMatch(source, /drawEditorOverlayLayers\([^)]*overlayLayersAbove,/);
  assert.doesNotMatch(source, /drawEditorOverlayLayers\([^)]*overlayLayersBelow,/);
});

test('changing the layer stack repaints a parked playhead', () => {
  const source = preview();

  // Same frame as last time means "already drawn" and the loop skips the draw,
  // so a layer added while paused would appear only after the next seek.
  assert.match(source, /overlayLayersKey/);
  assert.match(source, /previewInteractionDirtyRef\.current = true;[\s\S]{0,400}\}, \[overlayLayersKey\]\)/);
});

// --- The user saw: "a layer above the screen recording appears under it". ----
// Track order is z-order. The recording is a clip on a track like any other, so
// nothing belonging to it may be painted after a track above it — its camera
// bubble was, and showed through a covering layer.

test('layers above the recording draw after the whole recording composite', () => {
  const source = preview();

  // The Canvas2D path is the last of the two draw paths in this file; the
  // accelerated one above it has its own call, covered by the next test.
  const aboveAt = source.lastIndexOf("overlayLayersAboveRef.current, renderFrame, editorLayerMediaRef.current, 'above'");
  const cameraPipAt = source.lastIndexOf("markDrawPhase('camera-pip')");
  assert.ok(aboveAt > 0 && cameraPipAt > 0, 'expected both the above-layer pass and the camera PiP phase');
  assert.ok(
    aboveAt > cameraPipAt,
    'layers above the recording must be drawn after its camera PiP, or the PiP covers them',
  );
});

test('the accelerated playback path draws Editor layers too', () => {
  const source = preview();

  // This path returns early, before the Canvas2D path below it. Without its own
  // call, every layer vanished the moment playback went accelerated.
  const acceleratedAt = source.indexOf("markDrawPhase('accelerated-frame')");
  assert.ok(acceleratedAt > 0);
  const beforeAccelerated = source.slice(0, acceleratedAt);
  assert.match(
    beforeAccelerated.slice(beforeAccelerated.lastIndexOf('acceleratedTimelineFrameCompositor')),
    /drawEditorOverlayLayers\([\s\S]*?'above'/,
  );
});

test('layers below the recording draw before it', () => {
  const source = preview();

  const belowAt = source.indexOf("overlayLayersBelowRef.current, renderFrame, editorLayerMediaRef.current, 'below'");
  const screenAt = source.indexOf("markDrawPhase('screen-video')");
  assert.ok(belowAt > 0 && screenAt > 0);
  assert.ok(belowAt < screenAt, 'a layer below the recording must be covered by it');
});

// --- The user saw: the covering layer flickering away on every jump. ---------

test('an Editor video layer holds its last frame while a seek is in flight', () => {
  const source = preview();

  // A seek drops readyState to 1 for a moment. Skipping the draw there let the
  // recording show through a layer that is supposed to be covering it.
  assert.match(source, /overlayLayerFrameCache/);
  assert.match(source, /held-last-frame/);
  assert.match(source, /else if \(cached\) ctx\.drawImage\(cached/);
});

test('a frame that finishes decoding later still gets shown', () => {
  const source = preview();

  // A paused preview only draws when something marks it dirty, and a decoder
  // completing is not a timeline event.
  assert.match(source, /markOverlayLayerDirty/);
  assert.match(source, /'loadeddata', 'seeked', 'canplay'/);
});

// --- The user saw: playback crawling with a layer on an upper track. ---------

test('Editor layers play with the timeline instead of seeking every frame', () => {
  const source = preview();

  // Seeking once per drawn frame makes every frame wait on a fresh decode.
  assert.match(source, /if \(playing\) \{[\s\S]{0,200}video\.play\(\)/);
  assert.match(source, /drift > 0\.35/);
});

// --- The user saw: "the border is still there... it seems duplicated". -------
// The shared preview canvas insets itself and rounds its corners, so a ring of
// the Editor's own picture stayed visible around Rough Cut's.

test('the compositor fills the Editor viewer exactly, with nothing showing behind', () => {
  const css = styles();

  const scoped = css.slice(css.indexOf('.freecutProgramOverlay'));
  assert.ok(scoped.length > 0, 'expected overlay-scoped rules');
  assert.match(scoped, /\.freecutProgramOverlay \.styledPreviewCanvas[\s\S]{0,400}max-width: 100%/);
  assert.match(scoped, /\.freecutProgramOverlay \.styledPreviewCanvas[\s\S]{0,400}border-radius: 0/);
  assert.match(scoped, /\.freecutProgramOverlay \{[\s\S]{0,200}background: #000/);
});

test('the host positions its compositor over the Editor viewer rectangle', () => {
  const source = surface();

  assert.match(source, /className="freecutProgramOverlay"/);
  assert.match(source, /left: viewer\.rect\.x/);
  assert.match(source, /pointerEvents: 'none'/);
});

// --- The user saw: the recording still on screen past the end of the clip. ---
// It was being composited at the raw playhead time, so where the clip sits, what
// it is trimmed to and any hole cut in it made no difference to the picture.

test('the compositor is given the recording\'s own time, not the playhead\'s', () => {
  const source = surface();

  assert.match(source, /seekTimeSec=\{resolveRecordingTimeSec\(viewer\)/);
  assert.match(source, /recordingAbsent=\{resolveRecordingTimeSec\(viewer\) === null\}/);
  // The arithmetic must come from the shared module, not a second copy here.
  assert.match(source, /from '\.\/editor-timeline-placement\.mjs'/);
});

test('an empty timeline position renders empty, with the layers on it still drawn', () => {
  const source = preview();

  assert.match(source, /recordingAbsentRef\.current/);
  const gapBranch = source.slice(source.indexOf('recordingAbsentRef.current) {'), source.indexOf('recordingAbsentRef.current) {') + 1600);
  // Black, not the styled backdrop: the background belongs to how the recording
  // is presented, and where the recording does not reach there is nothing.
  assert.match(gapBranch, /fillStyle = '#000'/);
  assert.match(gapBranch, /fillRect\(0, 0, canvasWidth, canvasHeight\)/);
  // Clips on other tracks are still there and still in order.
  const belowAt = gapBranch.indexOf("'below'");
  const aboveAt = gapBranch.indexOf("'above'");
  assert.ok(belowAt > 0 && aboveAt > belowAt, 'both groups draw over the empty frame, in track order');
});

// --- The user heard: the Recording edit and Editor timelines at once. --------

test('the embedded Editor never sounds; the host compositor is the one output', () => {
  const helper = vendored('runtime/composition-runtime/utils/embedded-preview-audio.ts');
  assert.match(helper, /window\.parent !== window/);

  // Every path that puts sound on a preview element must ask first. An
  // unconditional unmute on any of these is the echo coming back.
  for (const file of [
    'runtime/composition-runtime/components/video-audio-context.ts',
    'runtime/composition-runtime/components/video-content.tsx',
    'runtime/composition-runtime/components/pitch-corrected-audio.tsx',
    'features/timeline/utils/timeline-audio-skim.ts',
  ]) {
    const source = vendored(file);
    assert.match(source, /shouldSilenceEmbeddedPreviewAudio/, `${file} must consult the embed check`);
    assert.doesNotMatch(
      source,
      /^\s*(video|element|audio|media)\.muted = false$/m,
      `${file} unmutes a preview element unconditionally`,
    );
  }
});

// --- The trap that made two of the fixes above look like they did nothing. ---

test('packaging rebuilds the embedded Editor when its source is newer', () => {
  const packager = readFileSync(join(repoRoot, 'scripts', 'package-linux.mjs'), 'utf8');

  // Shipping a dist older than its source means the app runs code that is no
  // longer in the tree, and every conclusion drawn from that run is about the
  // wrong build.
  assert.match(packager, /newestMtime/);
  assert.match(packager, /sourceMtime > distMtime/);
});
