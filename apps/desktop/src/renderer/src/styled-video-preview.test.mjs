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
  assert.match(source, /const parkedTimelineGap = Boolean/);
  assert.match(source, /if \(!parkedTimelineGap && \(video\.seeking \|\| video\.readyState < 2\)\) \{/);
  assert.match(source, /if \(timeMode === 'timeline'\) return;/);
  assert.match(source, /video\.pause\(\);\n\s+cameraVideo\?\.pause\(\);\n\s+return;/);
  assert.doesNotMatch(source, /nextTimelineFrame = currentFrame \+ \(sourceFrame - screenLayer\.sourceFrame\)/);
});

test('styled video preview drives edited timeline playback from decoded rVFC frames without per-frame seek sync', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /requestVideoFrameCallback drives canvas draws from/);
  assert.match(source, /screenVideo\.requestVideoFrameCallback\(\(now, metadata\) => tick\(now, metadata\)\)/);
  assert.match(source, /handleTimelineDecodedFrame\(sourceFrame\)/);
  assert.match(source, /timelineFrameForDecodedSourceFrame\(segment, decodedSourceFrame\)/);
  assert.match(source, /seekTimelineBoundary\(nextSegment\)/);
  assert.match(source, /if \(timeMode !== 'timeline' && Math\.abs\(cameraVideo\.currentTime - expectedCameraTime\)/);
  assert.match(source, /const activeTimelinePlayback = timeMode === 'timeline' && isPlaying/);
  assert.match(source, /ctx\.imageSmoothingQuality = activeTimelinePlayback \? 'low' : 'high'/);
  assert.match(source, /if \(!activeTimelinePlayback && background\.bgShadowEnabled/);
  assert.match(source, /if \(!activeTimelinePlayback && onScreenFrameChange\)/);
  assert.match(source, /const onCurrentTimeChangeRef = React\.useRef\(onCurrentTimeChange\)/);
  assert.match(source, /onCurrentTimeChangeRef\.current\?\.\(nextTime\)/);
  assert.match(source, /const onPlayingChangeRef = React\.useRef\(onPlayingChange\)/);
  assert.match(source, /onPlayingChangeRef\.current\?\.\(false\)/);
  assert.match(source, /if \(timeMode === 'timeline' && isPlaying\) return;\n\s+previewInteractionDirtyRef\.current = true;/);
  assert.match(source, /if \(!activeTimelinePlayback && focalSelection && focalScreenRect\)/);
  assert.match(source, /if \(!activeTimelinePlayback && gapFocal && gapRect\)/);
  assert.match(source, /className=\{`styledPreviewCanvas\$\{!isPlaying && isDraggingCamera \? ' draggingCamera' : ''\}/);
  assert.match(source, /onPointerMove=\{\(event\) => \{\n\s+if \(timeMode === 'timeline' && isPlaying\) return;\n\s+const canvas = canvasRef\.current;/);
  assert.match(source, /onPointerDown=\{\(event\) => \{\n\s+if \(timeMode === 'timeline' && isPlaying\) \{/);
  assert.match(source, /recordPlaybackDebug\('preview-pointerdown-ignored-playing'/);
  assert.match(source, /onPointerUp=\{\(event\) => \{\n\s+if \(timeMode === 'timeline' && isPlaying\) \{/);
  assert.match(source, /recordPlaybackDebug\('preview-pointerup-ignored-playing'/);
  assert.doesNotMatch(source, /syncTimelineScreenVideo/);
  assert.doesNotMatch(source, /decideTimelineVideoSync/);
  assert.doesNotMatch(source, /lastExpectedSourceFrameRef/);
  assert.doesNotMatch(source, /, onCurrentTimeChange, onPlayingChange\]/);
  assert.doesNotMatch(source, /if \(timeMode !== 'timeline' \|\| controlledPlaying !== undefined \|\| !isPlaying\) return undefined;\n\s+let rafId = 0;\n\s+let lastMs: number \| null = null;/);
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

  assert.match(source, /if \(!parkedTimelineGap && \(video\.seeking \|\| video\.readyState < 2\)\) \{/);
  assert.match(source, /recordPlaybackDebug\('render-skip-video-not-ready'/);
  assert.match(source, /const sourceFrameFloat = Math\.max\(0, sourceTime \* fps\)/);
  assert.match(source, /const renderFrame = timeMode === 'timeline' && timelineDecoded/);
  assert.match(source, /const frame = parkedTimelineFrame !== null && parkedTimelinePreviewFrame/);
  assert.match(source, /: resolveCurrentFrame\(renderFrame\)/);
  assert.match(source, /resolveTimelinePreviewFrame\(document, currentFrame/);
  assert.match(source, /const screenSource = resolveScreenSourceViewport\(sourceWidth, sourceHeight, frame\.screenCrop\)/);
  assert.match(source, /resolveZoomMotionBlurPx\(\{/);
  assert.match(source, /screenLayerRenderer\.draw\(\{/);
  assert.match(source, /applyScreenSourceTransform\(ctx, \{/);
  assert.match(source, /const cursorFrame = timeMode === 'timeline' \? screenLayer\?\.sourceFrame \?\? renderFrame : renderFrame/);
});

test('styled video preview routes screen video drawing through the feature-flagged screen-layer renderer', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'screen-layer-renderer.ts'), 'utf8');

  assert.match(source, /createScreenLayerRenderer, type ScreenLayerRenderer, type ScreenLayerRendererKind, type ScreenLayerRendererStats/);
  assert.match(source, /function resolveRequestedScreenLayerRendererKind\(\): ScreenLayerRendererKind/);
  assert.match(source, /ROUGH_CUT_WEBGL_SCREEN_LAYER/);
  assert.match(source, /VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER/);
  assert.match(source, /__roughCutWebglScreenLayer/);
  assert.match(source, /screenLayerRenderer'\) === 'webgl'/);
  assert.match(source, /roughCutWebglScreenLayer/);
  assert.match(source, /const screenLayerRendererRef = React\.useRef<ScreenLayerRenderer \| null>\(null\)/);
  assert.match(source, /createScreenLayerRenderer\(requestedScreenLayerRendererKind\)/);
  assert.match(source, /screenLayerRenderer\.resize\(canvasWidth, canvasHeight\)/);
  assert.match(source, /screenLayerRenderer\.draw\(\{/);
  assert.match(source, /previousTransform: previousMotionFrame\.cameraTransform/);
  assert.match(source, /nextTransform: nextMotionFrame\.cameraTransform/);
  assert.match(source, /canvasWidth,/);
  assert.match(source, /canvasHeight,/);
  assert.match(source, /publishScreenLayerRendererStats\(screenLayerStats\)/);
  assert.match(source, /__roughCutScreenLayerRenderer/);
  assert.match(source, /requestedRendererKind: requestedScreenLayerRendererKind/);
  assert.doesNotMatch(source, /drawZoomMotionSource\(ctx, video, \{/);

  assert.match(rendererSource, /export interface ScreenLayerRenderer/);
  assert.match(rendererSource, /export type ScreenLayerRendererKind = 'canvas2d' \| 'webgl'/);
  assert.match(rendererSource, /readonly kind: ScreenLayerRendererKind/);
  assert.match(rendererSource, /isSupported\(\): boolean/);
  assert.match(rendererSource, /resize\(width: number, height: number\): void/);
  assert.match(rendererSource, /draw\(input: ScreenLayerDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /drawCamera\(input: CameraLayerDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /drawCursorOverlay\(input: CursorLayerDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /getDebugStats\(\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /dispose\(\): void/);
  assert.match(rendererSource, /export class Canvas2DScreenLayerRenderer implements ScreenLayerRenderer/);
  assert.match(rendererSource, /export class WebGLScreenLayerRenderer implements ScreenLayerRenderer/);
  assert.match(rendererSource, /if \(kind === 'webgl'\) return new WebGLScreenLayerRenderer\(\)/);
  assert.match(rendererSource, /drawZoomMotionSource\(input\.ctx, input\.video, \{/);
  assert.match(rendererSource, /private ensureFallback\(reason: string\): Canvas2DScreenLayerRenderer/);
  assert.match(rendererSource, /webgl-context-unavailable/);
  assert.match(rendererSource, /webgl-context-lost/);
  assert.match(rendererSource, /input\.ctx\.drawImage\(this\.canvas as CanvasImageSource, 0, 0, input\.canvasWidth, input\.canvasHeight\)/);
  assert.match(rendererSource, /previousTransform\?: ScreenLayerCameraTransform \| null/);
  assert.match(rendererSource, /nextTransform\?: ScreenLayerCameraTransform \| null/);
  assert.match(rendererSource, /resolveWebGLMotionBlurEnabled\(\)/);
  assert.match(rendererSource, /__roughCutWebglMotionBlur/);
  assert.match(rendererSource, /webglMotionBlur/);
  assert.match(rendererSource, /roughCutWebglMotionBlur/);
  assert.match(rendererSource, /a_previousTexCoord/);
  assert.match(rendererSource, /a_nextTexCoord/);
  assert.match(rendererSource, /u_motionBlurSamples/);
  assert.match(rendererSource, /sampleIfVisible/);
  assert.match(rendererSource, /drawCameraWebGL\(input: CameraLayerDrawInput\)/);
  assert.match(rendererSource, /u_maskMode/);
  assert.match(rendererSource, /u_maskFrame/);
  assert.match(rendererSource, /u_maskRadius/);
  assert.match(rendererSource, /webgl-camera-draw-failed/);
  assert.match(rendererSource, /webgl-cursor-overlay-canvas2d/);
  assert.match(rendererSource, /requestedRendererKind/);
  assert.match(rendererSource, /rendererKind: 'canvas2d'/);
  assert.match(rendererSource, /contextStatus/);
  assert.match(rendererSource, /drawCostMs/);
  assert.match(rendererSource, /fallbackReason/);
});

test('styled video preview routes cursor and click overlays through the preview compositor boundary', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'screen-layer-renderer.ts'), 'utf8');

  assert.match(source, /screenLayerRenderer\.drawCursorOverlay\(\{/);
  assert.match(source, /cursorEvents,/);
  assert.match(source, /cursorFrame,/);
  assert.match(source, /cursorPosition: cursorPos/);
  assert.match(source, /cursorInside: cursorBounds\?\.inside !== false/);
  assert.match(source, /clickEffect: resolvedCursor\?\.clickEffect \?\? 'ring'/);
  assert.match(source, /visible: resolvedCursor\?\.visible !== false/);
  assert.match(source, /publishScreenLayerRendererStats\(cursorLayerStats\)/);
  assert.doesNotMatch(source, /drawClickEmphasis\(ctx, cursorEvents/);
  assert.doesNotMatch(source, /drawCursorPath\(ctx, cursorPos\.x/);

  assert.match(rendererSource, /import \{ drawClickEmphasis, drawCursorPath \} from '\.\/styled-preview\.mjs'/);
  assert.match(rendererSource, /export type CursorLayerDrawInput/);
  assert.match(rendererSource, /Canvas2DScreenLayerRenderer[\s\S]*drawCursorOverlay\(input: CursorLayerDrawInput\)/);
  assert.match(rendererSource, /drawClickEmphasis\(input\.ctx, input\.cursorEvents, input\.cursorFrame, input\.clickEffect \?\? 'ring'\)/);
  assert.match(rendererSource, /drawCursorPath\(input\.ctx, input\.cursorPosition\.x, input\.cursorPosition\.y/);
  assert.match(rendererSource, /WebGLScreenLayerRenderer[\s\S]*drawCursorOverlay\(input: CursorLayerDrawInput\)/);
  assert.match(rendererSource, /ensureFallback\('webgl-cursor-overlay-canvas2d'\)\.drawCursorOverlay\(input\)/);
});

test('styled video preview routes camera PiP through the preview compositor boundary', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'screen-layer-renderer.ts'), 'utf8');

  assert.match(source, /screenLayerRenderer\.drawCamera\(\{/);
  assert.match(source, /source: cameraSource/);
  assert.match(source, /presentation: frame\.cameraPresentation/);
  assert.match(source, /shadow: !activeTimelinePlayback/);
  assert.match(source, /drawEditorFrameControls\(ctx, cameraFrame, '#f59e0b'/);
  assert.doesNotMatch(source, /ctx\.drawImage\(\n\s+cameraVideo,/);
  assert.doesNotMatch(source, /addCameraShapePath\(ctx, cameraFrame/);

  assert.match(rendererSource, /export type CameraLayerDrawInput/);
  assert.match(rendererSource, /export type ScreenLayerCameraSource/);
  assert.match(rendererSource, /Canvas2DScreenLayerRenderer[\s\S]*drawCamera\(input: CameraLayerDrawInput\)/);
  assert.match(rendererSource, /WebGLScreenLayerRenderer[\s\S]*drawCamera\(input: CameraLayerDrawInput\)/);
  assert.match(rendererSource, /addCameraShapePath\(ctx, frame, presentation, radius\)/);
});

test('zoom motion renderer gates blur and keeps cursor overlays out of the blurred source pass', () => {
  const previewSource = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'zoom-motion-renderer.ts'), 'utf8');
  const mainSource = readFileSync(join(here, 'main.tsx'), 'utf8');

  assert.match(rendererSource, /export function resolveZoomMotionBlurPx/);
  assert.match(rendererSource, /export function resolveWebGLMotionBlurSampleCount/);
  assert.match(rendererSource, /if \(reducedMotion\) return 0/);
  assert.match(rendererSource, /if \(!Number\.isFinite\(current\.scale\) \|\| current\.scale <= 1\.001\) return 0/);
  assert.match(rendererSource, /if \(velocity <= 1\) return 0/);
  assert.match(rendererSource, /if \(!enabled \|\| reducedMotion \|\| !Number\.isFinite\(blurPx\) \|\| blurPx <= 0\.01\) return 1/);
  assert.match(rendererSource, /return blurPx >= 0\.95 \? 5 : 3/);
  assert.match(rendererSource, /ctx\.filter = `blur\(\$\{blurPx\.toFixed\(2\)\}px\)`/);
  assert.match(previewSource, /reducedMotion: activeTimelinePlayback \|\|/);
  assert.match(mainSource, /reducedMotion: !video\.paused \|\|/);
  assert.doesNotMatch(previewSource, /ctx\.filter\s*=/);
  assert.doesNotMatch(mainSource, /ctx\.filter\s*=/);
  assert.match(previewSource, /screenLayerRenderer\.draw\(\{/);
  assert.match(previewSource, /sharpZoom: timeMode !== 'timeline' && !activeTimelinePlayback/);
  assert.match(previewSource, /markDrawPhase\('screen-video'\);\n\s+ctx\.save\(\);\n\s+applyScreenSourceTransform/);
  assert.match(mainSource, /drawZoomMotionSource\(ctx, video, \{/);
  assert.match(mainSource, /sharpZoom: video\.paused/);
  assert.match(mainSource, /applyScreenSourceTransform\(ctx, \{/);
});

test('zoom motion renderer keeps zoomed screen text crisp when no blur pass is active', () => {
  const rendererSource = readFileSync(join(here, 'zoom-motion-renderer.ts'), 'utf8');

  assert.match(rendererSource, /const previousImageSmoothingEnabled = ctx\.imageSmoothingEnabled/);
  assert.match(rendererSource, /const previousImageSmoothingQuality = ctx\.imageSmoothingQuality/);
  assert.match(rendererSource, /readonly sharpZoom\?: boolean/);
  assert.match(rendererSource, /if \(blurPx > 0\) \{\n\s+ctx\.filter = `blur/);
  assert.match(rendererSource, /else if \(sharpZoom !== false && transform\.scale > 1\.001\) \{\n\s+ctx\.imageSmoothingEnabled = false;/);
  assert.match(rendererSource, /ctx\.imageSmoothingEnabled = previousImageSmoothingEnabled/);
  assert.match(rendererSource, /ctx\.imageSmoothingQuality = previousImageSmoothingQuality/);
  assert.doesNotMatch(rendererSource, /else \{\n\s+ctx\.imageSmoothingEnabled = true;\n\s+ctx\.imageSmoothingQuality = 'high';/);
});

test('styled video preview surfaces offscreen cursor state without clamping cursor draw', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /getCursorBoundsStatus\(cursorPos, sourceWidth, sourceHeight\)/);
  assert.match(source, /cursorBounds\?\.inside !== false/);
  assert.match(source, /cursorOffscreenHint/);
  assert.doesNotMatch(source, /drawCursorPath\(ctx, Math\.max/);
});

test('styled video preview shows zoom authoring crop safety only while editing a selected zoom', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /export function resolveZoomAuthoringSafety/);
  assert.match(source, /const zoomSafety = !activeTimelinePlayback && selectedZoomFocalRef\.current/);
  assert.match(source, /drawZoomAuthoringSafetyOverlay\(ctx, zoomSafety, cursorPos/);
  assert.match(source, /const label = inside \? 'Zoom crop' : 'Cursor outside crop'/);
  assert.match(source, /ctx\.setLineDash\(\[10, 7\]\)/);
});

test('styled video preview publishes resolved layout for export parity', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /export type ResolvedPreviewLayout/);
  assert.match(source, /onResolvedLayoutChange\?: \(layout: ResolvedPreviewLayout\) => void/);
  assert.match(source, /publishResolvedLayout\(resolvedScreenFrame, cameraRectRef\.current, canvasWidth, canvasHeight\)/);
  assert.match(source, /rectToNormalizedFrame\(screenFrame, canvasWidth, canvasHeight\)/);
  assert.match(source, /rectToNormalizedFrame\(cameraFrame, canvasWidth, canvasHeight\)/);
});

test('styled video preview exposes edit-only alignment grid and frame align controls', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const css = readFileSync(join(here, 'styles.css'), 'utf8');

  assert.match(source, /type PreviewAlignmentTarget = 'screen' \| 'camera'/);
  assert.match(source, /type PreviewAlignmentMode = 'left' \| 'horizontal-center' \| 'right' \| 'top' \| 'vertical-center' \| 'bottom'/);
  assert.match(source, /const \[alignmentGridVisible, setAlignmentGridVisible\] = React\.useState\(true\)/);
  assert.match(source, /drawAlignmentGrid\(ctx, canvasWidth, canvasHeight\)/);
  assert.match(source, /function alignRectInCanvas/);
  assert.match(source, /onCameraFrameChange\?\.\(rectToNormalizedFrame\(aligned, canvas\.width, canvas\.height\)\)/);
  assert.match(source, /onScreenFrameChange\?\.\(rectToNormalizedFrame\(aligned, canvas\.width, canvas\.height\)\)/);
  assert.match(source, /setAlignmentTarget\('camera'\)/);
  assert.match(source, /setAlignmentTarget\('screen'\)/);
  assert.match(source, /className="previewAlignmentToolbar"/);
  assert.match(css, /\.previewAlignmentToolbar/);
  assert.match(css, /\.previewAlignmentToolbar[\s\S]*pointer-events:\s*auto/);
  assert.match(css, /\.previewAlignmentToolbar button\.isActive/);
});

test('recording editor exposes persistent sidebar alignment controls', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');
  const css = readFileSync(join(here, 'styles.css'), 'utf8');

  assert.match(source, /type FrameAlignmentMode = 'left' \| 'horizontal-center' \| 'right' \| 'top' \| 'vertical-center' \| 'bottom'/);
  assert.match(source, /function defaultNormalizedScreenFrame/);
  assert.match(source, /function alignNormalizedFrame/);
  assert.match(source, /onScreenFrameChange\?: \(frame: \{ x: number; y: number; w: number; h: number \} \| null\) => void/);
  assert.match(source, /data-alignment-tools="true"/);
  assert.match(source, /<AlignmentButtonRow disabled=\{disabled \|\| !projectLoaded\} onAlign=\{alignScreenFrame\} \/>/);
  assert.match(source, /<AlignmentButtonRow disabled=\{disabled \|\| !projectLoaded \|\| !hasCamera \|\| !camera\.visible\} onAlign=\{alignCameraFrame\} \/>/);
  assert.match(source, /screenFrame=\{templateScreenFrame\}/);
  assert.match(source, /onScreenFrameChange=\{updateScreenFrame\}/);
  assert.match(css, /\.alignmentInspector/);
  assert.match(css, /\.alignmentButtonRow/);
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

test('built-in recording templates apply presentation layout frames', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');
  const templates = readFileSync(join(here, '../../../../../packages/project-model/src/recording-templates.ts'), 'utf8');

  assert.match(templates, /readonly screenFrame: NormalizedRect/);
  assert.match(templates, /readonly cameraFrame: NormalizedRect/);
  assert.match(source, /\.\.\.\(applied\.screenFrame \? \{ screenFrame: applied\.screenFrame \}/);
  assert.match(source, /\.\.\.\(applied\.cameraFrame \? \{ cameraFrame: applied\.cameraFrame \}/);
  assert.doesNotMatch(source, /manually-dragged camera\/screen positions also stay untouched/);
});

test('circle camera shape constrains custom camera frames to square preview boxes', () => {
  const previewSource = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'screen-layer-renderer.ts'), 'utf8');
  const editorSource = readFileSync(join(here, 'main.tsx'), 'utf8');

  assert.match(previewSource, /function constrainCameraShapeFrame/);
  assert.match(previewSource, /presentation\?\.shape !== 'circle'/);
  assert.match(rendererSource, /function addCameraShapePath/);
  assert.match(rendererSource, /ctx\.arc\(frame\.x \+ frame\.w \/ 2/);
  assert.match(rendererSource, /u_maskMode > 1\.5/);
  assert.match(editorSource, /function constrainCameraShapeFrame/);
  assert.match(editorSource, /presentation\?\.shape !== 'circle'/);
  assert.match(editorSource, /function addCameraShapePath/);
  assert.match(editorSource, /ctx\.arc\(frame\.x \+ frame\.w \/ 2/);
  assert.doesNotMatch(editorSource, /patch\.shape === 'circle' && presentation\.cameraFrame/);
  assert.doesNotMatch(editorSource, /next\.cameraFrame = cameraPresentation\.shape === 'circle'/);
});

test('camera editor exposes manual crop controls backed by cameraCrop presentation', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');
  const previewSource = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /label="Manual crop"/);
  assert.match(source, /aria-label="Camera layout"[\s\S]*label="Aspect"/);
  assert.match(source, /aria-label="Camera source crop"[\s\S]*label="Aspect"/);
  assert.match(source, /async function updateCameraCrop/);
  assert.match(source, /next\.cameraCrop = crop/);
  assert.match(source, /resolveCameraSourceRect/);
  assert.match(previewSource, /resolveCameraSourceRect/);
  assert.match(previewSource, /frame\.cameraCrop/);
});

test('camera crop aspect changes also reshape the PiP frame so the crop remains visible', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');

  assert.match(source, /onCameraCropAndFrameChange\?: \(crop: RegionCrop, frame: \{ x: number; y: number; w: number; h: number \}, patch: Partial<CameraPresentation>\) => void/);
  assert.match(source, /shouldCropAspectResizeFrame\(\{ nextAspect, cameraShape: camera\.shape, frameAspect \}\)/);
  assert.match(source, /const nextCameraAspect = nextAspect as CameraAspectRatio/);
  assert.match(source, /const nextFrame = resizeFrameToAspect\(frame, nextCameraAspect, aspectRatio\)/);
  assert.match(source, /onCameraCropAndFrameChange\(nextCrop, nextFrame, \{ aspectRatio: nextCameraAspect \}\)/);
  assert.match(source, /async function updateCameraCropAndFrame/);
  assert.match(source, /cameraCrop: crop/);
  assert.match(source, /syncRecordingTimelinePresentation\(nextDocument, recordingAsset\.id\)/);
});

test('camera frame aspect changes use the shared tested geometry helper', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');

  assert.match(source, /import \{ aspectRatioDims, moveFrameToCameraPosition, resizeFrameToAspect, resizeFrameToCameraSize, shouldCropAspectResizeFrame \} from '\.\/camera-frame\.mjs'/);
  assert.match(source, /const nextFrame = resizeFrameToAspect\(frame, nextAspect, aspectRatio\)/);
  assert.doesNotMatch(source, /pixelH \* 1\.35/);
  assert.doesNotMatch(source, /let nextPixelW = pixelW;\n\s+let nextPixelH = pixelW \/ target/);
});

test('background editor exposes manual screen crop controls backed by screenCrop presentation', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');
  const previewSource = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /label="Manual screen crop"/);
  assert.match(source, /async function updateScreenCrop/);
  assert.match(source, /next\.screenCrop = crop/);
  assert.match(source, /resolveScreenSourceViewport/);
  assert.match(previewSource, /resolveScreenSourceViewport/);
  assert.match(previewSource, /frame\.screenCrop/);
});

test('recording timeline selecting a zoom region does not commit a drag update without movement', () => {
  const source = readFileSync(join(here, 'main.tsx'), 'utf8');

  assert.match(source, /const startClientX = event\.clientX/);
  assert.match(source, /if \(Math\.abs\(clientX - startClientX\) < 4\) return;/);
  assert.match(source, /if \(dragged\) onZoomMarkerRangeChange\(latest\.id, latest\.startFrame, latest\.endFrame\)/);
  assert.doesNotMatch(source, /setZoomDragPreview\(latest\);\n\s+const update = \(clientX: number\)/);
});

test('playback diagnostics log render-loop gaps and preview clicks for stutter analysis', () => {
  const previewSource = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const playbackProbe = readFileSync(join(here, '../../../../../scripts/playback-timeline-playwright.mjs'), 'utf8');

  assert.match(previewSource, /function recordPlaybackDebug\(event: string/);
  assert.match(previewSource, /recordPlaybackDebug\('render-loop-start'/);
  assert.match(previewSource, /recordPlaybackDebug\('render-frame-gap'/);
  assert.match(previewSource, /recordPlaybackDebug\('render-expected-display-gap'/);
  assert.match(previewSource, /recordPlaybackDebug\('render-draw-cost'/);
  assert.match(previewSource, /recordPlaybackDebug\('main-thread-long-task'/);
  assert.match(previewSource, /readPlaybackQuality\(video\)/);
  assert.match(previewSource, /PLAYBACK_DRAW_COST_LOG_THRESHOLD_MS/);
  assert.match(previewSource, /recordPlaybackDebug\('preview-pointerdown-ignored-playing'/);
  assert.match(previewSource, /recordPlaybackDebug\('preview-pointerup-ignored-playing'/);
  assert.match(previewSource, /recordPlaybackDebug\('render-loop-cleanup'/);
  assert.match(playbackProbe, /function readPlaybackDebug\(\)/);
  assert.match(playbackProbe, /playbackQuality: quality/);
  assert.match(playbackProbe, /expectedDisplayGapCount/);
  assert.match(playbackProbe, /drawCostCount/);
  assert.match(playbackProbe, /longTaskCount/);
  assert.match(playbackProbe, /window\.__roughCutReadPlaybackDebug = \(\$\{readPlaybackDebug\.toString\(\)\}\)/);
  assert.match(playbackProbe, /window\.__roughCutReadPlaybackDebug\(\)/);
  assert.match(playbackProbe, /playbackDebug: result\.after\?\.playbackDebug/);
});
