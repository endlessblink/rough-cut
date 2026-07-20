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
  assert.match(source, /pausePreviewVideo\(video\);\n\s+cameraVideo\?\.pause\(\);\n\s+return;/);
  assert.doesNotMatch(source, /nextTimelineFrame = currentFrame \+ \(sourceFrame - screenLayer\.sourceFrame\)/);
});

test('styled video preview drives edited timeline playback from decoded rVFC frames without per-frame seek sync', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /requestVideoFrameCallback drives canvas draws from/);
  assert.match(source, /const acceleratedTimelinePlaybackClock = timeMode === 'timeline' && isPlaying && isAcceleratedScreenLayerRenderer\(screenLayerRenderer\.kind\)/);
  assert.match(source, /if \(!acceleratedTimelinePlaybackClock && timeMode === 'timeline' && isPlaying && activeTimelineSegmentRef\.current && typeof screenVideo\.requestVideoFrameCallback === 'function'\) \{/);
  assert.match(source, /screenVideo\.requestVideoFrameCallback\(\(now, metadata\) => \{/);
  assert.match(source, /rafId = window\.requestAnimationFrame\(\(now\) => tick\(now\)\)/);
  assert.match(source, /let nextClockTime = Math\.min\(timelineDuration, currentTimeRef\.current \+ tickDeltaSec \* timelineRateRef\.current\)/);
  // rVFC watchdog: a decode stall or media end must not park the loop with
  // isPlaying stuck true (2026-07-19 playback wedge).
  assert.match(source, /watchdogId = window\.setTimeout\(/);
  assert.match(source, /PLAYBACK_DRAW_WATCHDOG_MS = 250/);
  assert.match(source, /clearDrawWatchdog\(\);\n\s+tick\(now, metadata\);/);
  // The accelerated free-running clock is clamped to the decoder's actual
  // position so cursor/zoom can never glide over a frozen frame.
  assert.match(source, /const maxClockTime = videoTimelineSec \+ 2 \/ fps/);
  // Media `ended` forces the boundary/hold logic instead of wedging.
  assert.match(source, /const endedTimelineSegment = timeMode === 'timeline' && isPlaying && screenVideo\.ended/);
  assert.match(source, /handleTimelineDecodedFrame\(endedTimelineSegment\.sourceOut\)/);
  assert.match(source, /const timelineDecoded = endedTimelineSegment/);
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
  assert.match(source, /className=\{`styledPreviewCanvas styledPreviewOverlayCanvas\$\{acceleratedPresentationActive \? ' isAcceleratedPresentationOverlay isWebglPresentationOverlay' : ''\}\$\{!isPlaying && isDraggingCamera \? ' draggingCamera' : ''\}/);
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

test('styled video preview plays timeline gaps as black timeline time under controlled NLE playback', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /const timelineClockSegments = timelineClockFrame !== null \? buildTimelinePlaybackSegments\(\) : \[\]/);
  assert.match(source, /const activeClockSegment = timelineClockFrame !== null\n\s+\? timelineSegmentAtFrame\(timelineClockSegments, timelineClockFrame\)/);
  assert.match(source, /const nextClockSegment = timelineClockFrame !== null\n\s+\? nextTimelineSegmentAfterFrame\(timelineClockSegments, timelineClockFrame\)/);
  assert.match(source, /const timelineClockGapFrame = timelineClockFrame !== null && !activeClockSegment && nextClockSegment && timelineClockFrame < nextClockSegment\.timelineIn/);
  assert.match(source, /if \(timelineClockGapFrame !== null\) \{\n\s+activeTimelineSegmentRef\.current = null;\n\s+timelineFrameFallbackRef\.current = timelineClockGapFrame;\n\s+pausePreviewVideo\(screenVideo\);\n\s+cameraVideo\?\.pause\(\);/);
  assert.match(source, /: timelineClockGapFrame !== null\n\s+\? null\n\s+: timeMode === 'timeline' && isPlaying\n\s+\? handleTimelineDecodedFrame\(sourceFrame\)/);
  assert.match(source, /const playingGapFrame = timeMode === 'timeline' && isPlaying && !timelineDecoded && !activeTimelineSegmentRef\.current\n\s+\? timelineClockGapFrame \?\? Math\.max\(0, Math\.round\(currentTimeRef\.current \* fps\)\)/);
  assert.match(source, /notify: controlledPlaying === true \? false : undefined/);
  assert.doesNotMatch(source, /timelineSegmentAtFrame\(segments, currentTimelineFrame\) \?\? nextTimelineSegmentAfterFrame\(segments, currentTimelineFrame\)/);
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
  assert.match(source, /ROUGH_CUT_SCREEN_LAYER_RENDERER/);
  assert.match(source, /VITE_ROUGH_CUT_SCREEN_LAYER_RENDERER/);
  assert.match(source, /ROUGH_CUT_WEBGL_SCREEN_LAYER/);
  assert.match(source, /VITE_ROUGH_CUT_WEBGL_SCREEN_LAYER/);
  assert.match(source, /ROUGH_CUT_WEBGPU_SCREEN_LAYER/);
  assert.match(source, /VITE_ROUGH_CUT_WEBGPU_SCREEN_LAYER/);
  assert.match(source, /__roughCutWebglScreenLayer/);
  assert.match(source, /__roughCutWebgpuScreenLayer/);
  assert.match(source, /__roughCutScreenLayerRenderer/);
  assert.match(source, /resolveScreenLayerRendererSelection\(queryRenderer\)/);
  assert.ok(source.indexOf("get('screenLayerRenderer')") < source.indexOf('const envRenderer = env.ROUGH_CUT_SCREEN_LAYER_RENDERER'), 'runtime query selection must override baked Vite env renderer selection');
  assert.match(source, /roughCutScreenLayerRenderer/);
  assert.match(source, /roughCutWebglScreenLayer/);
  assert.match(source, /roughCutWebgpuScreenLayer/);
  assert.match(source, /function resolveScreenLayerRendererSelection\(value: string\): ScreenLayerRendererKind/);
  assert.match(source, /if \(normalized === 'auto'\) return resolveAutoScreenLayerRendererKind\(\)/);
  assert.match(source, /function resolveAutoScreenLayerRendererKind\(\): ScreenLayerRendererKind/);
  assert.match(source, /if \('gpu' in navigator\) return 'webgpu'/);
  assert.match(source, /canvas\.getContext\('webgl2'\) \|\| canvas\.getContext\('webgl'\)/);
  assert.match(source, /function isAcceleratedScreenLayerRenderer\(kind: ScreenLayerRendererKind\): boolean/);
  assert.match(source, /return kind === 'webgl' \|\| kind === 'webgpu'/);
  assert.match(source, /const screenLayerRendererRef = React\.useRef<ScreenLayerRenderer \| null>\(null\)/);
  assert.match(source, /createScreenLayerRenderer\(requestedScreenLayerRendererKind\)/);
  assert.match(source, /if \(!isAcceleratedScreenLayerRenderer\(screenLayerRenderer\.kind\)\) \{\n\s+screenLayerRenderer\.resize\(canvasWidth, canvasHeight\)/);
  assert.match(source, /screenLayerRenderer\.draw\(\{/);
  assert.match(source, /const webglCanvasRef = React\.useRef<HTMLCanvasElement \| null>\(null\)/);
  assert.match(source, /className=\{`styledPreviewAcceleratedCanvas styledPreviewWebglCanvas\$\{acceleratedPresentationActive \? ' isActive' : ''\}`\}/);
  assert.doesNotMatch(source, /styledPreviewCanvas styledPreviewWebglCanvas/);
  assert.match(source, /const acceleratedPresentationActive = isAcceleratedScreenLayerRenderer\(requestedScreenLayerRendererKind\) && timeMode === 'timeline' && isPlaying/);
  assert.match(source, /const acceleratedTimelineFrameCompositor = activeTimelinePlayback && isAcceleratedScreenLayerRenderer\(screenLayerRenderer\.kind\)/);
  assert.match(source, /ctx\.clearRect\(0, 0, canvasWidth, canvasHeight\)/);
  assert.match(source, /screenLayerRenderer\.drawFrame\(\{/);
  assert.match(source, /presentationCanvas: webglCanvas/);
  assert.match(source, /markDrawPhase\('accelerated-frame'\)/);
  assert.match(source, /previousTransform: previousMotionFrame\.cameraTransform/);
  assert.match(source, /nextTransform: nextMotionFrame\.cameraTransform/);
  assert.match(source, /canvasWidth,/);
  assert.match(source, /canvasHeight,/);
  assert.match(source, /publishScreenLayerRendererStats\(screenLayerStats\)/);
  assert.match(source, /__roughCutScreenLayerRenderer/);
  assert.match(source, /requestedRendererKind: requestedScreenLayerRendererKind/);
  assert.doesNotMatch(source, /drawZoomMotionSource\(ctx, video, \{/);

  assert.match(rendererSource, /export interface ScreenLayerRenderer/);
  assert.match(rendererSource, /export type ScreenLayerRendererKind = 'canvas2d' \| 'webgl' \| 'webgpu'/);
  assert.match(rendererSource, /readonly kind: ScreenLayerRendererKind/);
  assert.match(rendererSource, /isSupported\(\): boolean/);
  assert.match(rendererSource, /resize\(width: number, height: number\): void/);
  assert.match(rendererSource, /drawBackground\(input: BackgroundLayerDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /draw\(input: ScreenLayerDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /drawCamera\(input: CameraLayerDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /drawCursorOverlay\(input: CursorLayerDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /drawFrame\(input: CompositorFrameDrawInput\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /preparePresentationCanvas\?\(canvas: HTMLCanvasElement, width: number, height: number\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /prepareBackgroundImage\?\(image: HTMLImageElement \| null\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /getDebugStats\(\): ScreenLayerRendererStats/);
  assert.match(rendererSource, /dispose\(\): void/);
  assert.match(rendererSource, /export class Canvas2DScreenLayerRenderer implements ScreenLayerRenderer/);
  assert.match(rendererSource, /export class WebGPUScreenLayerRenderer implements ScreenLayerRenderer/);
  assert.match(rendererSource, /export class WebGLScreenLayerRenderer implements ScreenLayerRenderer/);
  assert.match(rendererSource, /if \(kind === 'webgpu'\) return new WebGPUScreenLayerRenderer\(\)/);
  assert.match(rendererSource, /if \(kind === 'webgl'\) return new WebGLScreenLayerRenderer\(\)/);
  assert.match(rendererSource, /private readonly canvasFallback = new Canvas2DScreenLayerRenderer\('webgpu-non-presentation-canvas2d-fallback', 'webgpu'\)/);
  assert.match(rendererSource, /private readonly webglFallback = new WebGLScreenLayerRenderer\(\)/);
  assert.doesNotMatch(rendererSource, /private readonly fallback = new WebGLScreenLayerRenderer\(\)/);
  assert.match(rendererSource, /this\.canvasFallback\.drawBackground\(input\), 'webgpu-background-without-presentation-canvas2d-fallback'/);
  assert.match(rendererSource, /this\.canvasFallback\.draw\(input\), 'webgpu-screen-without-presentation-canvas2d-fallback'/);
  assert.match(rendererSource, /this\.canvasFallback\.drawCamera\(input\), 'webgpu-camera-without-presentation-canvas2d-fallback'/);
  assert.match(rendererSource, /this\.canvasFallback\.drawCursorOverlay\(input\), 'webgpu-cursor-without-presentation-canvas2d-fallback'/);
  assert.match(rendererSource, /this\.canvasFallback\.drawFrame\(input\), 'webgpu-frame-without-presentation-canvas2d-fallback'/);
  assert.match(rendererSource, /this\.webglFallback\.drawFrame\(\{ \.\.\.input, presentationCanvas: null \}\)/);
  assert.match(rendererSource, /private drawFrameWebGPU\(input: CompositorFrameDrawInput\): void/);
  assert.match(rendererSource, /private pendingBackgroundImage: HTMLImageElement \| null = null/);
  assert.match(rendererSource, /background-image-texture-uploaded/);
  assert.match(source, /screenLayerRendererRef\.current\?\.prepareBackgroundImage\?\.\(image\)/);
  assert.match(source, /screenLayerRenderer\.prepareBackgroundImage\?\.\(backgroundImageRef\.current\)/);
  assert.match(rendererSource, /device\.importExternalTexture\(\{ source: input\.video \}\)/);
  assert.match(rendererSource, /texture_external/);
  assert.match(rendererSource, /textureSampleBaseClampToEdge/);
  assert.match(rendererSource, /private delegateFallbackFrame\(input: CompositorFrameDrawInput, reason: string/);
  assert.match(rendererSource, /webgpu-initializing/);
  assert.match(rendererSource, /fallbackReason: null,\n\s+\};\n\s+this\.log\('context-created'/);
  assert.match(rendererSource, /if \(!this\.isCurrentInitTarget\(canvas\)\) return/);
  assert.match(rendererSource, /device\.destroy\?\.\(\);\n\s+return;/);
  assert.match(rendererSource, /if \(this\.disposed \|\| this\.device !== device\) return/);
  assert.match(rendererSource, /private isCurrentInitTarget\(canvas: HTMLCanvasElement\): boolean \{/);
  assert.match(rendererSource, /uniformBindGroups\?: WeakMap<GPURenderPipeline, GPUBindGroup>/);
  assert.match(rendererSource, /private createWebGPUUniformBindGroup\(pipeline: GPURenderPipeline, uniforms: Float32Array\): GPUBindGroup/);
  assert.match(rendererSource, /if \(!entry\.uniformBindGroups\) entry\.uniformBindGroups = new WeakMap<GPURenderPipeline, GPUBindGroup>\(\)/);
  assert.match(rendererSource, /const cachedBindGroup = entry\.uniformBindGroups\.get\(pipeline\)/);
  assert.match(rendererSource, /if \(cachedBindGroup\) return cachedBindGroup/);
  assert.match(rendererSource, /entry\.uniformBindGroups\.set\(pipeline, bindGroup\)/);
  assert.match(rendererSource, /type WebGPUTextureView = ReturnType<GPUTexture\['createView'\]>/);
  assert.match(rendererSource, /private backgroundTextureView: WebGPUTextureView \| null = null/);
  assert.match(rendererSource, /private backgroundTextureNaturalWidth = 0/);
  assert.match(rendererSource, /private backgroundUploadCanvas: HTMLCanvasElement \| OffscreenCanvas \| null = null/);
  assert.match(rendererSource, /private preparedBackgroundBitmap: ImageBitmap \| null = null/);
  assert.match(rendererSource, /private backgroundBitmapPrewarmPromise: Promise<void> \| null = null/);
  assert.match(rendererSource, /private ensureImageTextureView\(image: HTMLImageElement, reason = 'draw'\): WebGPUTextureView/);
  assert.match(rendererSource, /private startBackgroundImagePrewarm\(image: HTMLImageElement, reason: string\): void/);
  assert.match(rendererSource, /createImageBitmap\(image, \{/);
  assert.match(rendererSource, /resizeWidth: width/);
  assert.match(rendererSource, /resizeHeight: height/);
  assert.match(rendererSource, /background-image-bitmap-prepared/);
  assert.match(rendererSource, /background-image-draw-deferred/);
  assert.match(rendererSource, /private releasePreparedBackgroundBitmap\(\): void/);
  assert.match(rendererSource, /private resolvePreviewBackgroundTextureSize\(naturalWidth: number, naturalHeight: number\): \{ width: number; height: number \}/);
  assert.match(rendererSource, /private preparePreviewBackgroundTextureSource\(/);
  assert.match(rendererSource, /return this\.preparedBackgroundBitmap/);
  assert.match(rendererSource, /context\.drawImage\(image, 0, 0, width, height\)/);
  assert.match(rendererSource, /downscaled: width !== naturalWidth \|\| height !== naturalHeight/);
  assert.match(rendererSource, /this\.backgroundTextureView = this\.backgroundTexture\.createView\(\)/);
  assert.match(rendererSource, /if \(!this\.backgroundTextureView\) this\.backgroundTextureView = this\.backgroundTexture\.createView\(\)/);
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
  assert.match(rendererSource, /type WebGLTextureState = \{/);
  assert.match(rendererSource, /imageSource: HTMLImageElement \| null/);
  assert.match(rendererSource, /videoFrameKey: number \| null/);
  assert.match(rendererSource, /private screenTexture: WebGLTextureState \| null = null/);
  assert.match(rendererSource, /private cameraTexture: WebGLTextureState \| null = null/);
  assert.match(rendererSource, /function uploadVideoTexture\(gl: WebGLRenderingContext, state: WebGLTextureState, video: HTMLVideoElement\): void/);
  assert.match(rendererSource, /state\.width === width && state\.height === height[\s\S]*gl\.texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, gl\.RGBA, gl\.UNSIGNED_BYTE, video\)/);
  assert.match(rendererSource, /video\.getVideoPlaybackQuality\?\.\(\)\.totalVideoFrames \?\? null/);
  assert.match(rendererSource, /state\.videoFrameKey === frameKey && state\.width === width && state\.height === height\) return/);
  assert.match(rendererSource, /gl\.pixelStorei\(gl\.UNPACK_FLIP_Y_WEBGL, false\)/);
  assert.match(rendererSource, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGBA, gl\.RGBA, gl\.UNSIGNED_BYTE, video\);\n\s+state\.width = width;\n\s+state\.height = height/);
  assert.match(rendererSource, /presentationCanvas\?: HTMLCanvasElement \| null/);
  assert.match(rendererSource, /private usePresentationCanvas\(canvas: HTMLCanvasElement \| null \| undefined\)/);
  assert.doesNotMatch(rendererSource, /WEBGL_lose_context/);
  assert.match(rendererSource, /__roughCutWebglRendererLog/);
  assert.match(rendererSource, /JSON\.stringify\(payload\)/);
  assert.match(rendererSource, /this\.usePresentationCanvas\(input\.presentationCanvas\)/);
  assert.match(rendererSource, /preparePresentationCanvas\(canvas: HTMLCanvasElement, width: number, height: number\): ScreenLayerRendererStats/);
  assert.ok(source.includes('screenLayerRenderer.preparePresentationCanvas?.(webglCanvas, canvasWidth, canvasHeight)'));
  assert.match(rendererSource, /if \(!input\.presentationCanvas\) \{\n\s+input\.background\.ctx\.drawImage\(this\.canvas as CanvasImageSource, 0, 0, canvasWidth, canvasHeight\)/);
  assert.match(rendererSource, /drawWebGL\(input: ScreenLayerDrawInput, options: \{ clear\?: boolean \} = \{\}\)[\s\S]*uploadVideoTexture\(gl, this\.screenTexture, input\.video\)/);
  assert.match(rendererSource, /const screenWidth = Math\.max\(1, Math\.ceil\(input\.screenSource\.w \* input\.screenDrawScale\)\)/);
  assert.match(rendererSource, /const motionBlurRenderScale = resolveWebGLMotionBlurRenderScale\(\{/);
  assert.match(rendererSource, /const targetWidth = Math\.max\(1, Math\.ceil\(screenWidth \* motionBlurRenderScale\)\)/);
  assert.match(rendererSource, /this\.resize\(targetWidth, targetHeight\)/);
  assert.match(rendererSource, /screenX: 0,\n\s+screenY: 0/);
  assert.match(rendererSource, /screenDrawScale: input\.screenDrawScale \* motionBlurRenderScale/);
  assert.match(rendererSource, /input\.ctx\.drawImage\(this\.canvas as CanvasImageSource, input\.screenX, input\.screenY, screenWidth, screenHeight\)/);
  assert.match(rendererSource, /drawCameraWebGL\(input: CameraLayerDrawInput, options: \{ clear\?: boolean \} = \{\}\)/);
  assert.match(rendererSource, /drawCameraWebGL\(input: CameraLayerDrawInput, options: \{ clear\?: boolean \} = \{\}\)[\s\S]*uploadVideoTexture\(gl, this\.cameraTexture, input\.video\)/);
  assert.match(rendererSource, /const texCoords = new Float32Array\(\[\n\s+u0, v0,\n\s+u1, v0,\n\s+u0, v1,\n\s+u0, v1,\n\s+u1, v0,\n\s+u1, v1,\n\s+\]\)/);
  assert.match(rendererSource, /u_maskMode/);
  assert.match(rendererSource, /u_maskFrame/);
  assert.match(rendererSource, /u_maskRadius/);
  assert.match(rendererSource, /webgl-camera-draw-failed/);
  assert.match(rendererSource, /drawCursorOverlayWebGL\(input: CursorLayerDrawInput, options: \{ clear\?: boolean \} = \{\}\)/);
  assert.match(rendererSource, /u_renderMode/);
  assert.match(rendererSource, /u_solidColor/);
  assert.match(rendererSource, /u_ringWidth/);
  assert.match(rendererSource, /requestedRendererKind/);
  assert.match(rendererSource, /rendererKind: 'canvas2d'/);
  assert.match(rendererSource, /contextStatus/);
  assert.match(rendererSource, /drawCostMs/);
  assert.match(rendererSource, /fallbackReason/);
});

test('styled video preview routes full-canvas background through the preview compositor boundary', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'screen-layer-renderer.ts'), 'utf8');

  assert.match(source, /screenLayerRenderer\.drawBackground\(\{/);
  assert.match(source, /startColor: backgroundStart/);
  assert.match(source, /endColor: backgroundEnd/);
  assert.match(source, /image: backgroundImageRef\.current/);
  assert.match(source, /publishScreenLayerRendererStats\(backgroundLayerStats\)/);
  assert.doesNotMatch(source, /const backgroundGradient = ctx\.createLinearGradient/);
  assert.doesNotMatch(source, /function fillBackground/);

  assert.match(rendererSource, /export type BackgroundLayerDrawInput/);
  assert.match(rendererSource, /Canvas2DScreenLayerRenderer[\s\S]*drawBackground\(input: BackgroundLayerDrawInput\)/);
  assert.match(rendererSource, /input\.ctx\.createLinearGradient\(0, 0, input\.canvasWidth, input\.canvasHeight\)/);
  assert.match(rendererSource, /WebGLScreenLayerRenderer[\s\S]*drawBackground\(input: BackgroundLayerDrawInput\)/);
  assert.match(rendererSource, /private drawBackgroundWebGL\(input: BackgroundLayerDrawInput\)/);
  assert.match(rendererSource, /u_gradientStart/);
  assert.match(rendererSource, /u_gradientEnd/);
  assert.match(rendererSource, /cssColorToRgba\(input\.startColor\)/);
  assert.match(rendererSource, /uploadImageTexture\(gl, this\.imageTexture, input\.image\)/);
  assert.match(rendererSource, /state\.imageSource === image && state\.width === width && state\.height === height\) return/);
  assert.match(rendererSource, /webgl-background-draw-failed/);
});

test('styled video preview routes cursor and click overlays through the preview compositor boundary', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'screen-layer-renderer.ts'), 'utf8');

  assert.match(source, /screenLayerRenderer\.drawCursorOverlay\(\{/);
  assert.match(source, /canvasWidth,/);
  assert.match(source, /canvasHeight,/);
  assert.match(source, /sourceWidth,/);
  assert.match(source, /sourceHeight,/);
  assert.match(source, /screenDrawScale: effectiveScreenDrawScale/);
  assert.match(source, /screenSource,/);
  assert.match(source, /transform: frame\.cameraTransform \?\? \{ scale: 1, offsetX: 0, offsetY: 0 \}/);
  assert.match(source, /cursorEvents,/);
  assert.match(source, /cursorFrame,/);
  assert.match(source, /cursorPosition: cursorPos/);
  assert.match(source, /cursorInside: cursorBounds\?\.inside !== false/);
  assert.match(source, /clickEffect: resolvedCursor\?\.clickEffect \?\? 'ring'/);
  assert.match(source, /visible: resolvedCursor\?\.visible !== false/);
  assert.match(source, /publishScreenLayerRendererStats\(cursorLayerStats\)/);
  assert.doesNotMatch(source, /drawClickEmphasis\(ctx, cursorEvents/);
  assert.doesNotMatch(source, /drawCursorPath\(ctx, cursorPos\.x/);

  assert.match(rendererSource, /import \{ activeClickEmphasisAtFrame, drawClickEmphasis, drawCursorPath \} from '\.\/styled-preview\.mjs'/);
  assert.match(rendererSource, /export type CursorLayerDrawInput/);
  assert.match(rendererSource, /Canvas2DScreenLayerRenderer[\s\S]*drawCursorOverlay\(input: CursorLayerDrawInput\)/);
  assert.match(rendererSource, /drawClickEmphasis\(input\.ctx, input\.cursorEvents, input\.cursorFrame, input\.clickEffect \?\? 'ring'\)/);
  assert.match(rendererSource, /drawCursorPath\(input\.ctx, input\.cursorPosition\.x, input\.cursorPosition\.y/);
  assert.match(rendererSource, /WebGLScreenLayerRenderer[\s\S]*drawCursorOverlay\(input: CursorLayerDrawInput\)/);
  assert.match(rendererSource, /this\.drawCursorOverlayWebGL\(\{\n\s+\.\.\.input,\n\s+canvasWidth: bounds\.w,/);
  assert.match(rendererSource, /const bounds = resolveCursorOverlayBounds\(input\)/);
  assert.match(rendererSource, /canvasWidth: bounds\.w,\n\s+canvasHeight: bounds\.h,\n\s+screenX: input\.screenX - bounds\.x,\n\s+screenY: input\.screenY - bounds\.y/);
  assert.match(rendererSource, /input\.ctx\.drawImage\(this\.canvas as CanvasImageSource, bounds\.x, bounds\.y, bounds\.w, bounds\.h\)/);
  assert.match(rendererSource, /function resolveCursorOverlayBounds\(input: CursorLayerDrawInput\): ScreenLayerCameraFrame \| null/);
  assert.match(rendererSource, /projectCursorSourcePoint\(input, ring\.x, ring\.y\)/);
  assert.match(rendererSource, /projectCursorSourcePoint\(input, input\.cursorPosition\.x, input\.cursorPosition\.y\)/);
  assert.match(rendererSource, /input\.ctx\.setTransform\(1, 0, 0, 1, 0, 0\)/);
  assert.match(rendererSource, /activeClickEmphasisAtFrame\(input\.cursorEvents, input\.cursorFrame\)/);
  assert.match(rendererSource, /CURSOR_POLYGON_TRIANGLES/);
  assert.match(rendererSource, /gl\.drawArrays\(mode, 0, vertexCount\)/);
  assert.doesNotMatch(rendererSource, /webgl-cursor-overlay-canvas2d/);
});

test('styled video preview keeps only one audible hidden preview playing', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');

  assert.match(source, /__roughCutAudiblePreviewVideo\?: HTMLVideoElement \| null/);
  assert.match(source, /function claimAudiblePreviewVideo\(video: HTMLVideoElement\)/);
  assert.match(source, /if \(previous && previous !== video\) previous\.pause\(\)/);
  assert.match(source, /target\.__roughCutAudiblePreviewVideo = video/);
  assert.match(source, /function releaseAudiblePreviewVideo\(video: HTMLVideoElement \| null \| undefined\)/);
  assert.match(source, /function pausePreviewVideo\(video: HTMLVideoElement \| null \| undefined\)/);
  assert.match(source, /releaseAudiblePreviewVideo\(video\)/);
  assert.match(source, /claimAudiblePreviewVideo\(video\);\n\s+void video\.play\(\)/);
  assert.match(source, /claimAudiblePreviewVideo\(event\.currentTarget\)/);
  assert.match(source, /releaseAudiblePreviewVideo\(event\.currentTarget\)/);
  assert.match(source, /pausePreviewVideo\(video\);\n\s+cameraVideo\?\.pause\(\)/);
});

test('styled video preview routes camera PiP through the preview compositor boundary', () => {
  const source = readFileSync(join(here, 'styled-video-preview.tsx'), 'utf8');
  const rendererSource = readFileSync(join(here, 'screen-layer-renderer.ts'), 'utf8');

  assert.match(source, /screenLayerRenderer\.drawCamera\(\{/);
  assert.match(source, /source: cameraSource/);
  assert.match(source, /presentation: frame\.cameraPresentation/);
  assert.match(source, /shadow: !activeTimelinePlayback/);
  assert.match(source, /drawEditorFrameControls\(ctx, cameraFrameForDraw, '#f59e0b'/);
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
  assert.match(rendererSource, /export function resolveWebGLMotionBlurRenderScale/);
  assert.match(rendererSource, /if \(reducedMotion\) return 0/);
  assert.match(rendererSource, /if \(!Number\.isFinite\(current\.scale\) \|\| current\.scale <= 1\.001\) return 0/);
  assert.match(rendererSource, /if \(velocity <= 1\) return 0/);
  assert.match(rendererSource, /if \(!enabled \|\| reducedMotion \|\| !Number\.isFinite\(blurPx\) \|\| blurPx <= 0\.01\) return 1/);
  assert.match(rendererSource, /return blurPx >= 0\.95 \? 5 : 3/);
  assert.match(rendererSource, /if \(samples >= 5\) return 0\.72/);
  assert.match(rendererSource, /if \(samples >= 3\) return 0\.85/);
  assert.match(rendererSource, /ctx\.filter = `blur\(\$\{blurPx\.toFixed\(2\)\}px\)`/);
  assert.match(previewSource, /reducedMotion: \(activeTimelinePlayback && !acceleratedTimelineFrameCompositor\) \|\|/);
  assert.match(mainSource, /reducedMotion: !video\.paused \|\|/);
  assert.doesNotMatch(previewSource, /ctx\.filter\s*=/);
  assert.doesNotMatch(mainSource, /ctx\.filter\s*=/);
  assert.match(previewSource, /screenLayerRenderer\.draw\(\{/);
  assert.match(previewSource, /sharpZoom: timeMode !== 'timeline' && !activeTimelinePlayback/);
  assert.match(previewSource, /markDrawPhase\('screen-video'\);\n\s+ctx\.save\(\);\n\s+applyScreenSourceTransform/);
  assert.match(previewSource, /cameraVideo\.muted = true;\n\s+cameraVideo\.volume = 0/);
  assert.match(previewSource, /return \(\) => \{\n\s+pausePreviewVideo\(video\);\n\s+cameraVideo\?\.pause\(\);\n\s+\};\n\s+\}, \[src, cameraSrc\]\)/);
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
  assert.match(previewSource, /function reclassifyPlaybackDebugEvents\(/);
  assert.match(previewSource, /recordPlaybackDebug\('render-loop-start'/);
  assert.match(previewSource, /recordPlaybackDebug\('render-frame-gap'/);
  assert.match(previewSource, /recordPlaybackDebug\('render-expected-display-gap'/);
  assert.match(previewSource, /render-expected-display-gap-main-thread-blocked/);
  assert.match(previewSource, /PLAYBACK_EXPECTED_DISPLAY_GAP_FRAME_MULTIPLIER/);
  assert.match(previewSource, /expectedGapThresholdMs/);
  assert.match(previewSource, /const PLAYBACK_EXPECTED_DISPLAY_WARMUP_SAMPLES = 3/);
  assert.match(previewSource, /let expectedDisplaySampleCount = 0/);
  assert.match(previewSource, /expectedDisplaySampleCount >= PLAYBACK_EXPECTED_DISPLAY_WARMUP_SAMPLES/);
  assert.match(previewSource, /lastExpectedDisplayTimeMs = null;\n\s+expectedDisplaySampleCount = 0;\n\s+lastDrawnFrame = -1/);
  assert.match(previewSource, /recordPlaybackDebug\('render-draw-cost'/);
  assert.match(previewSource, /recordPlaybackDebug\('main-thread-long-task'/);
  assert.match(previewSource, /readPlaybackQuality\(video\)/);
  assert.match(previewSource, /PLAYBACK_DRAW_COST_LOG_THRESHOLD_MS/);
  assert.match(previewSource, /recordPlaybackDebug\('preview-pointerdown-ignored-playing'/);
  assert.match(previewSource, /recordPlaybackDebug\('preview-pointerup-ignored-playing'/);
  assert.match(previewSource, /recordPlaybackDebug\('render-loop-cleanup'/);
  assert.match(playbackProbe, /function readPlaybackDebug\(range = null\)/);
  assert.match(playbackProbe, /function selectPlaybackVideoElements\(\)/);
  assert.match(playbackProbe, /hiddenSource/);
  assert.match(playbackProbe, /ev2MediaThumbVideo/);
  assert.match(playbackProbe, /ev2SourceVideo/);
  assert.match(playbackProbe, /playbackVideos/);
  assert.match(playbackProbe, /playbackQuality: quality/);
  assert.match(playbackProbe, /expectedDisplayGapCount/);
  assert.match(playbackProbe, /expectedDisplayGapOk/);
  assert.match(playbackProbe, /mainThreadBlockedExpectedDisplayGapCount/);
  assert.match(playbackProbe, /drawCostCount/);
  assert.match(playbackProbe, /longTaskCount/);
  assert.match(playbackProbe, /window\.__roughCutReadPlaybackDebug = \(\$\{readPlaybackDebug\.toString\(\)\}\)/);
  assert.match(playbackProbe, /window\.__roughCutReadPlaybackDebug\(\)/);
  assert.match(playbackProbe, /playbackDebug: result\.after\?\.playbackDebug/);
});
