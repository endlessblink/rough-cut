import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) throw new Error('Usage: node scripts/recording-editor-interactions-playwright.mjs <real-project.roughcut>');

const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electronPath = join(artifactRoot, 'electron');
if (!existsSync(appPath) || !existsSync(electronPath)) throw new Error('Package the app before running recording-editor interaction proof.');

const outputRoot = process.env.ROUGH_CUT_RECORDING_INTERACTIONS_OUTPUT || join('/tmp', `rough-cut-recording-interactions-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const screenshotPath = join(outputRoot, 'recording-editor-interactions.png');
const runtimeBeforePath = join(outputRoot, 'runtime-before.png');
const runtimeChangePath = join(outputRoot, 'runtime-change.png');
const runtimeAfterPath = join(outputRoot, 'runtime-after.png');
const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${join(outputRoot, 'electron-user-data')}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1500',
  },
});

try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  const recordingTab = page.locator('[data-ui-region="app-view-tabstrip"] button[title="Recording edit"]');
  await recordingTab.waitFor({ state: 'attached', timeout: 30000 });
  await recordingTab.evaluate((button) => button.click());
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 30000 });
  const sourceVideos = page.locator('video.hiddenSource');
  await sourceVideos.first().waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForTimeout(1500);
  for (let index = 0; index < await sourceVideos.count(); index += 1) {
    await sourceVideos.nth(index).screenshot({ path: join(outputRoot, `source-video-${index}.png`) });
  }
  const sourceVideoDebug = await sourceVideos.evaluateAll((nodes) => nodes.map((node) => ({
    src: node.getAttribute('src'),
    currentSrc: node.currentSrc,
    readyState: node.readyState,
    currentTime: node.currentTime,
    duration: node.duration,
    videoWidth: node.videoWidth,
    videoHeight: node.videoHeight,
  })));
  const timelineTool = page.locator('nav[aria-label="Editor tools"] button[aria-label="Timeline"]');
  await timelineTool.waitFor({ state: 'visible', timeout: 30000 });
  await timelineTool.evaluate((button) => button.click());
  const surface = page.locator('.visualTimeline');
  const ruler = page.locator('.timelineRuler');
  const screenTrack = page.locator('.screenLane .laneTrack');
  await surface.waitFor({ state: 'visible', timeout: 30000 });
  await ruler.waitFor({ state: 'visible', timeout: 30000 });
  await screenTrack.waitFor({ state: 'visible', timeout: 30000 });
  await restoreOriginalRecording(page);
  await page.waitForTimeout(500);

  const toolbarBox = await page.locator('[data-ui-region="timeline-toolbar"]').boundingBox();
  const viewportBox = await page.locator('.timelineViewport').boundingBox();
  if (!toolbarBox || !viewportBox || toolbarBox.bottom > viewportBox.top) throw new Error('Timeline controls overlap the seek surface.');

  const rulerBox = await ruler.boundingBox();
  if (!rulerBox) throw new Error('Timeline ruler is not measurable.');
  const seekAt = async (fraction) => {
    await page.mouse.click(rulerBox.x + rulerBox.width * fraction, rulerBox.y + rulerBox.height / 2);
    await page.waitForTimeout(250);
    return page.locator('.playhead').evaluate((node) => Number.parseFloat(getComputedStyle(node).left));
  };
  const firstSeek = await seekAt(0.22);
  const secondSeek = await seekAt(0.67);
  if (!(secondSeek > firstSeek + 10)) throw new Error(`Ruler seek did not move the playhead: ${firstSeek} -> ${secondSeek}`);

  const clip = page.locator('.screenLane .clipBody').first();
  await clip.waitFor({ state: 'visible', timeout: 30000 });
  const clipBox = await clip.boundingBox();
  if (!clipBox) throw new Error('Screen clip is not measurable.');
  await page.mouse.click(clipBox.x + clipBox.width * 0.73, clipBox.y + clipBox.height / 2);
  await page.waitForTimeout(250);
  const clipSeek = await page.locator('.playhead').evaluate((node) => Number.parseFloat(getComputedStyle(node).left));
  if (!(clipSeek > 50)) throw new Error(`Clip-body seek did not move the playhead: ${clipSeek}`);

  const audioRegion = page.locator('.audioLane .presenceRegion');
  await audioRegion.waitFor({ state: 'visible', timeout: 30000 });
  if (await audioRegion.count() !== 1 || (await audioRegion.first().textContent())?.trim() !== 'Audio') throw new Error('Recording audio is not attached to the timeline.');
  const audioWaveform = page.locator('.audioLane .audioWaveform');
  await audioWaveform.waitFor({ state: 'visible', timeout: 60000 });
  const waveformBackground = await audioWaveform.evaluate((node) => getComputedStyle(node).backgroundImage);
  if (!waveformBackground || waveformBackground === 'none') throw new Error('Recording audio waveform did not render.');
  const audioBox = await audioRegion.first().boundingBox();
  const screenSpanBox = await page.locator('.screenLane [data-recording-clip-id]').first().boundingBox();
  if (!audioBox || !screenSpanBox) throw new Error('Audio or screen span is not measurable for alignment.');
  const audioAlignment = {
    leftErrorPx: Math.abs(audioBox.x - screenSpanBox.x),
    rightErrorPx: Math.abs((audioBox.x + audioBox.width) - (screenSpanBox.x + screenSpanBox.width)),
  };
  if (audioAlignment.leftErrorPx > 3 || audioAlignment.rightErrorPx > 3) throw new Error(`Audio waveform is not aligned to the recording span: ${JSON.stringify(audioAlignment)}`);
  const backgroundTool = page.locator('nav[aria-label="Editor tools"] button[aria-label="Background"]');
  await backgroundTool.click({ force: true });
  const templateCards = page.locator('.templateCard');
  await templateCards.first().waitFor({ state: 'visible', timeout: 30000 });
  const templateWidths = await templateCards.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
  if (templateWidths.length === 0 || Math.min(...templateWidths) < 240) throw new Error(`Template cards are too narrow: ${templateWidths.join(', ')}`);
  const originalCanvasRatio = await page.locator('.styledPreviewCanvas').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.height > 0 ? rect.width / rect.height : null;
  });
  if (originalCanvasRatio === null) throw new Error('Original preview bounds are not measurable before template selection.');
  const sourceOriginalCanvasRatio = await page.locator('video.hiddenSource').first().evaluate((video) => video.videoWidth / video.videoHeight);
  if (!Number.isFinite(sourceOriginalCanvasRatio) || Math.abs(sourceOriginalCanvasRatio - 16 / 9) > 0.02) throw new Error(`Exact recording source is not the expected 16:9 baseline: ${sourceOriginalCanvasRatio}`);
  const splitTemplate = page.getByRole('button', { name: 'Side-by-side · 16:9', exact: true });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === 'Side-by-side · 16:9');
    return Boolean(button && !button.disabled);
  }, null, { timeout: 30000 });
  await splitTemplate.click({ force: true });
  await page.waitForTimeout(1000);
  const splitCanvas = await page.locator('.styledPreviewCanvas').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { ratio: rect.height > 0 ? rect.width / rect.height : null, computedAspect: getComputedStyle(node).aspectRatio };
  });
  if (splitCanvas.ratio === null || Math.abs(splitCanvas.ratio - 16 / 9) > 0.02) throw new Error(`16:9 split template did not set landscape preview bounds: ${JSON.stringify(splitCanvas)}`);
  await page.waitForFunction(() => {
    const debug = (window).__roughCutPreviewRenderDebug;
    const frame = debug?.frame;
    return Boolean(
      (window).__roughCutCameraFramePresent
      && (window).__roughCutCanvasCameraRect
      && (window).__roughCutCanvasScreenRect
      && frame?.screenFrame?.x === 0.385
      && frame?.screenFrame?.y === 0.3
      && frame?.screenFrame?.w === 0.53
      && frame?.screenFrame?.h === 0.4
      && frame?.cameraFrame?.x === 0.105
      && frame?.cameraFrame?.y === 0.17
      && frame?.cameraFrame?.w === 0.245
      && frame?.cameraFrame?.h === 0.66
    );
  }, null, { timeout: 60000 });
  const splitGeometry = await page.evaluate(() => ({
    cameraRect: (window).__roughCutCanvasCameraRect ?? null,
    screenRect: (window).__roughCutPreviewRenderDebug?.resolvedScreenFrame
      ? {
          x: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.x / (window).__roughCutPreviewRenderDebug.canvas.width,
          y: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.y / (window).__roughCutPreviewRenderDebug.canvas.height,
          w: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.w / (window).__roughCutPreviewRenderDebug.canvas.width,
          h: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.h / (window).__roughCutPreviewRenderDebug.canvas.height,
        }
        : null,
    debugFrame: (window).__roughCutPreviewRenderDebug?.frame ?? null,
    debugResolvedScreenFrame: (window).__roughCutPreviewRenderDebug?.resolvedScreenFrame ?? null,
    debugDragScreenRect: (window).__roughCutPreviewRenderDebug?.dragScreenRect ?? null,
  }));
  if (!splitGeometry.cameraRect || !splitGeometry.screenRect || splitGeometry.cameraRect.x >= splitGeometry.screenRect.x || splitGeometry.cameraRect.x + splitGeometry.cameraRect.w > splitGeometry.screenRect.x + 2 || splitGeometry.cameraRect.h / splitGeometry.cameraRect.w < 1.5 || splitGeometry.screenRect.w / splitGeometry.screenRect.h < 1.1) {
    const canvasDiagnostics = await page.locator('canvas').evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { className: node.className, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, display: style.display, visibility: style.visibility };
    }));
    throw new Error(`16:9 split template did not keep camera beside screen: ${JSON.stringify({ splitGeometry, canvasDiagnostics })}`);
  }
  await page.screenshot({ path: join(outputRoot, 'template-split-16-9.png'), timeout: 60000 });
  const splitRulerBox = await ruler.boundingBox();
  if (!splitRulerBox) throw new Error('Timeline ruler is not measurable after the 16:9 split template.');
  await page.mouse.click(splitRulerBox.x + splitRulerBox.width * 0.41, splitRulerBox.y + splitRulerBox.height / 2);
  await page.waitForTimeout(500);
  const postSplitSeekGeometry = await page.evaluate(() => {
    const canvas = document.querySelector('.styledPreviewCanvas');
    const rect = canvas?.getBoundingClientRect();
    return {
      ratio: rect && rect.height > 0 ? rect.width / rect.height : null,
      cameraRect: (window).__roughCutCanvasCameraRect ?? null,
      screenRect: (window).__roughCutPreviewRenderDebug?.resolvedScreenFrame
        ? {
            x: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.x / (window).__roughCutPreviewRenderDebug.canvas.width,
            y: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.y / (window).__roughCutPreviewRenderDebug.canvas.height,
            w: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.w / (window).__roughCutPreviewRenderDebug.canvas.width,
            h: (window).__roughCutPreviewRenderDebug.resolvedScreenFrame.h / (window).__roughCutPreviewRenderDebug.canvas.height,
          }
        : null,
    };
  });
  if (
    postSplitSeekGeometry.ratio === null
    || Math.abs(postSplitSeekGeometry.ratio - 16 / 9) > 0.02
    || !postSplitSeekGeometry.cameraRect
    || !postSplitSeekGeometry.screenRect
    || postSplitSeekGeometry.cameraRect.x >= postSplitSeekGeometry.screenRect.x
    || postSplitSeekGeometry.cameraRect.x + postSplitSeekGeometry.cameraRect.w > postSplitSeekGeometry.screenRect.x + 2
    || postSplitSeekGeometry.cameraRect.h / postSplitSeekGeometry.cameraRect.w < 1.5
    || postSplitSeekGeometry.screenRect.w / postSplitSeekGeometry.screenRect.h < 1.1
  ) {
    throw new Error(`16:9 split template broke after timeline seek: ${JSON.stringify(postSplitSeekGeometry)}`);
  }
  const portraitTemplate = page.getByRole('button', { name: 'Screen dominant · 4:5', exact: true });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === 'Screen dominant · 4:5');
    return Boolean(button && !button.disabled);
  }, null, { timeout: 30000 });
  await portraitTemplate.click({ force: true });
  await page.waitForTimeout(1000);
  const portraitCanvasRatio = await page.locator('.styledPreviewCanvas').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { ratio: rect.height > 0 ? rect.width / rect.height : null, inlineAspect: node.getAttribute('style'), computedAspect: getComputedStyle(node).aspectRatio };
  });
  if (portraitCanvasRatio.ratio === null || Math.abs(portraitCanvasRatio.ratio - 4 / 5) > 0.02) throw new Error(`4:5 template did not set portrait preview bounds: ${JSON.stringify(portraitCanvasRatio)}`);
  await page.waitForFunction(() => Boolean((window).__roughCutCameraFramePresent && (window).__roughCutCanvasCameraRect), null, { timeout: 60000 });
  const renderedTemplateGeometry = await page.evaluate(() => ({
    cameraFramePresent: Boolean((window).__roughCutCameraFramePresent),
    cameraRect: (window).__roughCutCanvasCameraRect ?? null,
    screenRect: (window).__roughCutCanvasScreenRect ?? null,
  }));
  if (!renderedTemplateGeometry.cameraFramePresent || !renderedTemplateGeometry.cameraRect) throw new Error(`Template camera frame did not render: ${JSON.stringify(renderedTemplateGeometry)}`);
  const delayedTemplateGeometry = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const canvas = document.querySelector('.styledPreviewCanvas');
    const rect = canvas?.getBoundingClientRect();
    return {
      ratio: rect && rect.height > 0 ? rect.width / rect.height : null,
      cameraFramePresent: Boolean((window).__roughCutCameraFramePresent && (window).__roughCutCanvasCameraRect),
      cameraRect: (window).__roughCutCanvasCameraRect ?? null,
    };
  });
  if (delayedTemplateGeometry.ratio === null || Math.abs(delayedTemplateGeometry.ratio - 4 / 5) > 0.02 || !delayedTemplateGeometry.cameraFramePresent) {
    throw new Error(`Template composition broke after delayed state update: ${JSON.stringify({ renderedTemplateGeometry, delayedTemplateGeometry })}`);
  }
  const templateRulerBox = await ruler.boundingBox();
  if (!templateRulerBox) throw new Error('Timeline ruler is not measurable after template selection.');
  await page.mouse.click(templateRulerBox.x + templateRulerBox.width * 0.41, templateRulerBox.y + templateRulerBox.height / 2);
  await page.waitForTimeout(500);
  const postSeekTemplateGeometry = await page.evaluate(() => {
    const canvas = document.querySelector('.styledPreviewCanvas');
    const rect = canvas?.getBoundingClientRect();
    return {
      ratio: rect && rect.height > 0 ? rect.width / rect.height : null,
      cameraFramePresent: Boolean((window).__roughCutCameraFramePresent && (window).__roughCutCanvasCameraRect),
      cameraRect: (window).__roughCutCanvasCameraRect ?? null,
    };
  });
  if (postSeekTemplateGeometry.ratio === null || Math.abs(postSeekTemplateGeometry.ratio - 4 / 5) > 0.02 || !postSeekTemplateGeometry.cameraFramePresent) {
    throw new Error(`Template composition broke after timeline seek: ${JSON.stringify({ delayedTemplateGeometry, postSeekTemplateGeometry })}`);
  }
  const postSeekRenderDebug = await page.evaluate(() => {
    const canvas = document.querySelector('.styledPreviewCanvas');
    const accelerated = document.querySelector('.styledPreviewAcceleratedCanvas');
    return {
      interaction: (window).__roughCutTimelineInteractionDebug ?? null,
      playheadLeft: document.querySelector('.playhead') instanceof HTMLElement
        ? getComputedStyle(document.querySelector('.playhead')).left
        : null,
      timelineScrubberValue: document.querySelector('.timelineScrubber')?.value ?? null,
      sourceVideoTimes: [...document.querySelectorAll('video.hiddenSource')].map((video) => video.currentTime),
      debug: (window).__roughCutPreviewRenderDebug ?? null,
      rendererStats: (window).__roughCutScreenLayerRenderer ?? null,
      canvasFrame: canvas instanceof HTMLCanvasElement ? canvas.toDataURL('image/png') : null,
      acceleratedFrame: accelerated instanceof HTMLCanvasElement ? accelerated.toDataURL('image/png') : null,
    };
  });
  if (postSeekRenderDebug.canvasFrame) writeFileSync(join(outputRoot, 'template-post-seek-canvas.png'), Buffer.from(postSeekRenderDebug.canvasFrame.split(',')[1], 'base64'));
  if (postSeekRenderDebug.acceleratedFrame) writeFileSync(join(outputRoot, 'template-post-seek-accelerated.png'), Buffer.from(postSeekRenderDebug.acceleratedFrame.split(',')[1], 'base64'));
  writeFileSync(join(outputRoot, 'template-post-seek-debug.json'), `${JSON.stringify(postSeekRenderDebug.debug, null, 2)}\n`);
  const decodedSourceFrames = await page.evaluate(() => [...document.querySelectorAll('video.hiddenSource')].map((video) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/png');
  }));
  writeFileSync(join(outputRoot, 'template-post-seek-interaction.json'), JSON.stringify({
    interaction: postSeekRenderDebug.interaction,
    playheadLeft: postSeekRenderDebug.playheadLeft,
    timelineScrubberValue: postSeekRenderDebug.timelineScrubberValue,
    sourceVideoTimes: postSeekRenderDebug.sourceVideoTimes,
    overlayDiag: await page.evaluate(() => (window).__roughCutOverlayDiag ?? null),
  }, null, 2));
  decodedSourceFrames.forEach((dataUrl, index) => writeFileSync(join(outputRoot, `decoded-source-${index}.png`), Buffer.from(dataUrl.split(',')[1], 'base64')));
  await page.screenshot({ path: join(outputRoot, 'template-post-seek.png'), timeout: 120000 });
  await timelineTool.click({ force: true });
  await restoreOriginalRecording(page);
  await page.waitForTimeout(1000);
  const restoredCanvasRatio = await page.locator('.styledPreviewCanvas').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { ratio: rect.height > 0 ? rect.width / rect.height : null, inlineAspect: node.getAttribute('style'), computedAspect: getComputedStyle(node).aspectRatio };
  });
  if (restoredCanvasRatio.ratio === null || Math.abs(restoredCanvasRatio.ratio - sourceOriginalCanvasRatio) > 0.02) throw new Error(`Restore did not return preview to the recording's original aspect: ${JSON.stringify({ originalCanvasRatio, sourceOriginalCanvasRatio, restoredCanvasRatio })}`);
  await timelineTool.click({ force: true });
  await seekAt(0.58);
  const playButton = page.locator('.videoControls .transportButton');
  await playButton.waitFor({ state: 'visible', timeout: 30000 });
  const playheadSamples = [];
  const readPlayhead = () => page.locator('.playhead').evaluate((node) => Number.parseFloat(getComputedStyle(node).left));
  playheadSamples.push(await readPlayhead());
  await playButton.click({ force: true });
  for (let index = 0; index < 5; index += 1) {
    await page.waitForTimeout(100);
    playheadSamples.push(await readPlayhead());
  }
  if (playheadSamples.some((value, index) => index > 0 && value < playheadSamples[index - 1] - 0.5)) throw new Error(`Playhead jumped backward after click-to-play: ${playheadSamples.join(' -> ')}`);
  const playbackState = await page.locator('video.hiddenSource').evaluateAll((nodes) => nodes.map((node) => ({ currentTime: node.currentTime, paused: node.paused, seeking: node.seeking, readyState: node.readyState, ended: node.ended })));
  const screenPlayback = playbackState[0];
  if (!screenPlayback || screenPlayback.paused || screenPlayback.currentTime <= 0) {
    const playbackDebug = await page.evaluate(() => (window).__roughCutTimelinePlaybackDebug ?? null);
    throw new Error(`Media did not start from the clicked point: ${JSON.stringify(playbackState)}; debug=${JSON.stringify(playbackDebug)}`);
  }
  if (playheadSamples.some((value, index) => index > 0 && value < playheadSamples[index - 1] - 0.5)) throw new Error(`Playhead jumped backward after click-to-play: ${playheadSamples.join(' -> ')}`);
  const framePlayback = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    const startedAt = performance.now();
    const sample = (now) => {
      const node = document.querySelector('.playhead');
      samples.push(node instanceof HTMLElement ? Number.parseFloat(getComputedStyle(node).left) : NaN);
      if (now - startedAt >= 600) {
        const finite = samples.filter(Number.isFinite);
        const maxBackwardPx = finite.reduce((max, value, index) => index === 0 ? max : Math.max(max, finite[index - 1] - value), 0);
        resolve({ sampleCount: finite.length, maxBackwardPx, samples: finite });
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  if (framePlayback.sampleCount < 2 || framePlayback.maxBackwardPx > 0.5) throw new Error(`Playhead was not frame-stable during playback: ${JSON.stringify(framePlayback)}`);
  await playButton.click({ force: true });
  await page.waitForTimeout(500);
  await page.keyboard.press('k');
  await page.waitForTimeout(500);
  await seekAt(0.4);

  const timelineFingerprint = async () => page.locator('.screenLane [data-recording-clip-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-recording-clip-id')).join('|'));
  const beforeTimelineFingerprint = await timelineFingerprint();
  await page.screenshot({ path: runtimeBeforePath, timeout: 60000 });

  const beforeSplit = await page.locator('.screenLane [data-recording-clip-id]').count();
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
  const afterSplit = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterSplit !== beforeSplit + 1) throw new Error(`S did not split at the playhead: ${beforeSplit} -> ${afterSplit}`);
  const splitClip = await page.locator('.screenLane [data-recording-clip-id]').first().boundingBox();
  const splitPlayhead = await page.locator('.playhead').boundingBox();
  const splitBoundaryError = splitClip && splitPlayhead ? Math.abs((splitClip.x + splitClip.width) - splitPlayhead.x) : Infinity;
  if (!Number.isFinite(splitBoundaryError) || splitBoundaryError > 3) throw new Error(`S split away from the playhead by ${splitBoundaryError}px`);
  const changeTimelineFingerprint = await timelineFingerprint();
  await page.screenshot({ path: runtimeChangePath, timeout: 60000 });

  const restore = page.getByRole('button', { name: 'Restore original recording' });
  await restore.waitFor({ state: 'visible', timeout: 30000 });
  const restoreOriginal = async () => {
    await restore.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Restore original recording');
      return Boolean(button && !button.disabled);
    }, null, { timeout: 30000 });
    await restore.click({ force: true });
    await page.waitForFunction(() => document.querySelectorAll('.screenLane [data-recording-clip-id]').length === 1, null, { timeout: 30000 });
    await page.waitForTimeout(300);
  };
  await restoreOriginal();
  const afterRestore = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterRestore !== 1) throw new Error(`Restore did not return to one clip: ${afterRestore}`);
  const censorLane = page.locator('.censorLane .laneTrack');
  const censorLaneBox = await censorLane.boundingBox();
  if (!censorLaneBox) throw new Error('Censor lane is not measurable.');
  const censorBeforeRestore = await page.locator('.censorLane [data-censor-id]').count();
  await restoreOriginal();
  const censorAfterRestore = await page.locator('.censorLane [data-censor-id]').count();
  if (censorAfterRestore !== censorBeforeRestore) throw new Error(`Restore changed the real recording's censor regions: ${censorBeforeRestore} -> ${censorAfterRestore}`);
  const afterTimelineFingerprint = await timelineFingerprint();
  await page.screenshot({ path: runtimeAfterPath, timeout: 60000 });
  await seekAt(0.4);

  const splitButton = page.getByRole('button', { name: 'Split at playhead' });
  await splitButton.waitFor({ state: 'visible', timeout: 30000 });
  if (await splitButton.count() !== 1) throw new Error('Toolbar must expose exactly one split button.');
  const rangeMode = page.getByRole('button', { name: 'Range cut mode' });
  if (await rangeMode.count() !== 1) throw new Error('Toolbar must expose exactly one range-cut control.');
  const beforeIconSplit = await page.locator('.screenLane [data-recording-clip-id]').count();
  await splitButton.click({ force: true });
  await page.waitForTimeout(900);
  const afterIconSplit = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterIconSplit !== beforeIconSplit + 1) throw new Error(`Scissors did not split at the playhead: ${beforeIconSplit} -> ${afterIconSplit}`);
  const iconTimelineFingerprint = await timelineFingerprint();
  await restoreOriginal();
  const afterIconRestore = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterIconRestore !== 1) throw new Error(`Restore after scissors did not return to one clip: ${afterIconRestore}`);

  await seekAt(0.33);
  await page.keyboard.press('s');
  await page.waitForTimeout(700);
  await seekAt(0.66);
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
  const beforeRippleDelete = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (beforeRippleDelete !== 3) throw new Error(`Ripple-delete setup did not create three clips: ${beforeRippleDelete}`);
  const middleClip = page.locator('.screenLane .clipBody').nth(1);
  const middleClipBox = await middleClip.boundingBox();
  if (!middleClipBox) throw new Error('Middle clip is not measurable for ripple delete.');
  await page.mouse.click(middleClipBox.x + middleClipBox.width / 2, middleClipBox.y + middleClipBox.height / 2);
  await page.waitForTimeout(250);
  const selectedClipState = await page.locator('.screenLane .selectedClip').evaluate((node) => {
    const style = getComputedStyle(node);
    return { count: 1, borderColor: style.borderColor, boxShadow: style.boxShadow, background: style.backgroundImage };
  }).catch(() => ({ count: 0, borderColor: '', boxShadow: '', background: '' }));
  if (selectedClipState.count !== 1 || !selectedClipState.boxShadow || selectedClipState.boxShadow === 'none') throw new Error(`Selected clip state is not unmistakable: ${JSON.stringify(selectedClipState)}`);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1200);
  const afterRippleDelete = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterRippleDelete !== 2) throw new Error(`Backspace did not delete the selected clip: ${beforeRippleDelete} -> ${afterRippleDelete}`);
  const rippleClipBoxes = await page.locator('.screenLane [data-recording-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  const rippleGapPx = rippleClipBoxes.length === 2 ? rippleClipBoxes[1].left - rippleClipBoxes[0].right : Infinity;
  if (!Number.isFinite(rippleGapPx) || Math.abs(rippleGapPx) > 3) throw new Error(`Backspace left a gap after deleting the selected clip: ${rippleGapPx}px`);
  const rippleDeleteFingerprint = await timelineFingerprint();
  await restoreOriginal();

  const cameraTrack = page.locator('.cameraLane .laneTrack');
  await cameraTrack.waitFor({ state: 'visible', timeout: 30000 });
  const cameraBox = await cameraTrack.boundingBox();
  if (!cameraBox) throw new Error('Camera lane is not measurable.');
  await page.mouse.click(cameraBox.x + cameraBox.width * 0.41, cameraBox.y + cameraBox.height / 2);
  await page.waitForTimeout(250);
  const emptyLaneSeek = await page.locator('.playhead').evaluate((node) => Number.parseFloat(getComputedStyle(node).left));
  if (Math.abs(emptyLaneSeek - clipSeek) < 10) throw new Error(`Empty-lane seek did not move the playhead: ${clipSeek} -> ${emptyLaneSeek}`);

  await rangeMode.click({ force: true });
  const rangeTrackBox = await screenTrack.boundingBox();
  if (!rangeTrackBox) throw new Error('Screen track is not measurable for range cut.');
  const beforeRangeCut = await page.locator('.screenLane [data-recording-clip-id]').count();
  await page.mouse.move(rangeTrackBox.x + rangeTrackBox.width * 0.34, rangeTrackBox.y + rangeTrackBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rangeTrackBox.x + rangeTrackBox.width * 0.46, rangeTrackBox.y + rangeTrackBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const afterRangeCut = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterRangeCut !== beforeRangeCut + 1) throw new Error(`Range cut did not remove one middle range: ${beforeRangeCut} -> ${afterRangeCut}`);
  const rangeClipBoxes = await page.locator('.screenLane [data-recording-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  const rangeGapPx = rangeClipBoxes.length === 2 ? rangeClipBoxes[1].left - rangeClipBoxes[0].right : Infinity;
  if (!Number.isFinite(rangeGapPx) || Math.abs(rangeGapPx) > 3) throw new Error(`Range cut left a visible gap between clips: ${rangeGapPx}px`);
  const rangeCutFingerprint = await timelineFingerprint();
  await page.keyboard.press('Escape');
  await restoreOriginal();
  if (await page.locator('.screenLane [data-recording-clip-id]').count() !== 1) throw new Error('Restore after range cut did not return to one clip.');
  if (await rangeMode.getAttribute('aria-pressed') === 'true') await rangeMode.click({ force: true });

  await page.waitForTimeout(2500);
  await seekAt(0.42);
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
  const adjacentTrimScreen = page.locator('.screenLane [data-recording-clip-id]');
  const adjacentTrimAudio = page.locator('.audioLane [data-recording-audio-clip-id]');
  if (await adjacentTrimScreen.count() !== 2 || await adjacentTrimAudio.count() !== 2) throw new Error('Adjacent trim setup did not create linked screen and audio clips.');
  await page.locator('.screenLane .clipBody').first().click({ force: true });
  await page.waitForTimeout(250);
  const adjacentTail = page.locator('.screenLane [data-recording-trim-edge="tail"]').first();
  const adjacentTailBox = await adjacentTail.boundingBox();
  if (!adjacentTailBox) throw new Error('Adjacent trim tail handle is not measurable.');
  await page.mouse.move(adjacentTailBox.x + adjacentTailBox.width / 2, adjacentTailBox.y + adjacentTailBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(adjacentTailBox.x - 70, adjacentTailBox.y + adjacentTailBox.height / 2, { steps: 6 });
  const liveAdjacentScreenBoxes = await adjacentTrimScreen.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  const liveAdjacentAudioBoxes = await adjacentTrimAudio.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  if (await page.locator('.trimAvailabilityGuide').count() !== 1) throw new Error('Trim availability guide did not appear on the selected clip.');
  const trimGuidePointerEvents = await page.locator('.trimAvailabilityGuide').evaluate((node) => getComputedStyle(node).pointerEvents);
  if (trimGuidePointerEvents !== 'none') throw new Error(`Trim availability guide intercepted the timeline: ${trimGuidePointerEvents}`);
  if (liveAdjacentScreenBoxes.length !== 2 || liveAdjacentAudioBoxes.length !== 2 || liveAdjacentScreenBoxes.some((box) => box.width <= 0) || liveAdjacentAudioBoxes.some((box) => box.width <= 0)) {
    throw new Error(`Adjacent layer disappeared during trim preview: screen=${JSON.stringify(liveAdjacentScreenBoxes)} audio=${JSON.stringify(liveAdjacentAudioBoxes)}`);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  const adjacentAfterTrimScreenBoxes = await adjacentTrimScreen.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  const adjacentAfterTrimAudioBoxes = await adjacentTrimAudio.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  const adjacentNeighborScreen = adjacentAfterTrimScreenBoxes[1];
  const adjacentNeighborAudio = adjacentAfterTrimAudioBoxes[1];
  const adjacentNeighborBeforeScreen = liveAdjacentScreenBoxes[1];
  const adjacentNeighborBeforeAudio = liveAdjacentAudioBoxes[1];
  if (!adjacentNeighborScreen || !adjacentNeighborAudio || !adjacentNeighborBeforeScreen || !adjacentNeighborBeforeAudio
    || Math.abs(adjacentNeighborScreen.left - adjacentNeighborBeforeScreen.left) > 2
    || Math.abs(adjacentNeighborScreen.width - adjacentNeighborBeforeScreen.width) > 2
    || Math.abs(adjacentNeighborAudio.left - adjacentNeighborBeforeAudio.left) > 2
    || Math.abs(adjacentNeighborAudio.width - adjacentNeighborBeforeAudio.width) > 2) {
    throw new Error(`Adjacent layer changed after trim commit: before=${JSON.stringify({ screen: adjacentNeighborBeforeScreen, audio: adjacentNeighborBeforeAudio })} after=${JSON.stringify({ screen: adjacentNeighborScreen, audio: adjacentNeighborAudio })}`);
  }
  await restoreOriginal();

  await page.waitForTimeout(2500);
  const trimClipBody = page.locator('.screenLane .clipBody').first();
  await trimClipBody.click({ force: true });
  await page.waitForTimeout(250);
  const tailHandle = page.locator('.screenLane [data-recording-trim-edge="tail"]').first();
  const tailValue = async () => Number(await tailHandle.getAttribute('aria-valuenow'));
  const initialTailFrame = await tailValue();
  const tailBox = await tailHandle.boundingBox();
  if (!tailBox) throw new Error('Tail trim handle is not measurable.');
  await page.mouse.move(tailBox.x + tailBox.width / 2, tailBox.y + tailBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tailBox.x - 70, tailBox.y + tailBox.height / 2, { steps: 6 });
  const liveTrimScreenBoxes = await page.locator('.screenLane [data-recording-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  const liveTrimAudioBoxes = await page.locator('.audioLane [data-recording-audio-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  if (liveTrimScreenBoxes.length !== 1 || liveTrimAudioBoxes.length !== 1 || !liveTrimScreenBoxes.every((box) => box.width > 0) || !liveTrimAudioBoxes.every((box) => box.width > 0)) {
    throw new Error(`Trim preview hid a linked layer: screen=${JSON.stringify(liveTrimScreenBoxes)} audio=${JSON.stringify(liveTrimAudioBoxes)}`);
  }
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const shorterTailFrame = await tailValue();
  if (!(shorterTailFrame < initialTailFrame)) throw new Error(`Trim shorter did not move the tail: ${initialTailFrame} -> ${shorterTailFrame}`);
  const shortenedScreenBox = await page.locator('.screenLane [data-recording-clip-id]').first().boundingBox();
  const shortenedAudioBox = await page.locator('.audioLane [data-recording-audio-clip-id]').first().boundingBox();
  if (!shortenedScreenBox || !shortenedAudioBox || Math.abs(shortenedScreenBox.left - shortenedAudioBox.left) > 2 || Math.abs(shortenedScreenBox.width - shortenedAudioBox.width) > 2) {
    throw new Error('Audio did not follow the shortened screen clip.');
  }
  await tailHandle.click({ force: true });
  await tailHandle.focus();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-recording-trim-edge') === 'tail');
  for (let index = 0; index < 4; index += 1) await page.keyboard.press('Shift+ArrowRight', { delay: 40 });
  await page.waitForTimeout(1000);
  const longerTailFrame = await tailValue();
  if (!(longerTailFrame > shorterTailFrame)) throw new Error(`Trim longer did not extend the tail: ${shorterTailFrame} -> ${longerTailFrame} (max ${await tailHandle.getAttribute('aria-valuemax')})`);

  await restoreOriginal();
  const cancelTailHandle = page.locator('.screenLane [data-recording-trim-edge="tail"]').first();
  const cancelTrimFrame = Number(await cancelTailHandle.getAttribute('aria-valuenow'));
  const cancelTrimBox = await cancelTailHandle.boundingBox();
  if (!cancelTrimBox) throw new Error('Tail trim handle is not measurable for cancel.');
  await page.mouse.move(cancelTrimBox.x + cancelTrimBox.width / 2, cancelTrimBox.y + cancelTrimBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelTrimBox.x - 80, cancelTrimBox.y + cancelTrimBox.height / 2, { steps: 6 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
  await page.mouse.up();
  await page.waitForTimeout(500);
  const afterTrimCancelFrame = Number(await cancelTailHandle.getAttribute('aria-valuenow'));
  if (afterTrimCancelFrame !== cancelTrimFrame) throw new Error(`Trim cancel changed the clip: ${cancelTrimFrame} -> ${afterTrimCancelFrame}`);

  const viewport = page.locator('.timelineViewport');
  const fit = page.getByRole('button', { name: 'Fit timeline' });
  const fitTrackWidth = await page.locator('.screenLane .laneTrack').evaluate((node) => node.getBoundingClientRect().width);
  const viewportForZoom = await viewport.boundingBox();
  if (!viewportForZoom) throw new Error('Timeline viewport is not measurable for zoom.');
  const playheadScreenX = async () => {
    const box = await page.locator('.playhead').boundingBox();
    return box ? box.x + box.width / 2 : null;
  };
  const zoomPointerX = viewportForZoom.x + viewportForZoom.width * 0.12;
  const playheadXBeforeZoom = await playheadScreenX();
  if (playheadXBeforeZoom === null) throw new Error('Playhead position could not be measured before zoom.');
  await page.evaluate((x) => {
    const viewport = document.querySelector('.timelineViewport');
    viewport?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, deltaY: -120, ctrlKey: true }));
  }, zoomPointerX);
  await page.waitForTimeout(500);
  const zoomTrackWidth = await page.locator('.screenLane .laneTrack').evaluate((node) => node.getBoundingClientRect().width);
  const playheadXAfterZoom = await playheadScreenX();
  const playheadAnchorPixelError = playheadXAfterZoom === null ? Infinity : Math.abs(playheadXAfterZoom - playheadXBeforeZoom);
  if (!(zoomTrackWidth > fitTrackWidth + 1)) throw new Error(`Timeline zoom did not increase content width: ${fitTrackWidth} -> ${zoomTrackWidth}`);
  if (!Number.isFinite(playheadAnchorPixelError) || playheadAnchorPixelError > 1.5) throw new Error(`Zoom moved the playhead by ${playheadAnchorPixelError}px: ${playheadXBeforeZoom} -> ${playheadXAfterZoom}`);
  await fit.click({ force: true });
  await page.waitForTimeout(300);
  const refitTrackWidth = await page.locator('.screenLane .laneTrack').evaluate((node) => node.getBoundingClientRect().width);
  if (Math.abs(refitTrackWidth - fitTrackWidth) > 2) throw new Error(`Fit did not restore timeline width: ${fitTrackWidth} -> ${refitTrackWidth}`);

  await seekAt(0.5);
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
  if (await page.locator('.screenLane [data-recording-clip-id]').count() !== 2) throw new Error('Move setup split did not create two clips.');
  await page.locator('.screenLane .clipBody').nth(1).click({ force: true });
  await page.waitForTimeout(250);
  const secondTail = page.locator('.screenLane [data-recording-trim-edge="tail"]').first();
  const secondTailInitial = Number(await secondTail.getAttribute('aria-valuenow'));
  const secondTailBox = await secondTail.boundingBox();
  if (!secondTailBox) throw new Error('Second clip tail handle is not measurable.');
  await page.mouse.move(secondTailBox.x + secondTailBox.width / 2, secondTailBox.y + secondTailBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondTailBox.x - 60, secondTailBox.y + secondTailBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const secondTailShort = Number(await secondTail.getAttribute('aria-valuenow'));
  if (!(secondTailShort < secondTailInitial)) throw new Error(`Move setup trim did not shorten the second clip: ${secondTailInitial} -> ${secondTailShort}`);
  const secondClip = page.locator('.screenLane .clipBody').nth(1);
  let secondBeforeMove = await secondClip.boundingBox();
  if (!secondBeforeMove) throw new Error('Second clip is not measurable for move.');
  const moveStart = { x: secondBeforeMove.x + secondBeforeMove.width / 2, y: secondBeforeMove.y + secondBeforeMove.height / 2 };
  const moveEnd = { x: moveStart.x + 120, y: moveStart.y };
  await page.mouse.down();
  await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 8 });
  await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
  await page.mouse.up();
  await page.waitForTimeout(500);
  const secondAfterMoveCancel = await secondClip.boundingBox();
  if (!secondAfterMoveCancel) throw new Error('Move cancel did not leave the clip measurable.');
  await restoreOriginal();
  await seekAt(0.5);
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
  await page.locator('.screenLane .clipBody').nth(1).click({ force: true });
  await page.waitForTimeout(250);
  const moveProbeClip = page.locator('.screenLane .clipBody').nth(1);
  secondBeforeMove = await moveProbeClip.boundingBox();
  if (!secondBeforeMove) throw new Error('Move probe clip is not measurable.');
  const moveProbeTail = page.locator('.screenLane [data-recording-trim-edge="tail"]').first();
  const moveProbeTailBox = await moveProbeTail.boundingBox();
  if (!moveProbeTailBox) throw new Error('Move probe trim handle is not measurable.');
  await page.mouse.move(moveProbeTailBox.x + moveProbeTailBox.width / 2, moveProbeTailBox.y + moveProbeTailBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveProbeTailBox.x - 60, moveProbeTailBox.y + moveProbeTailBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  secondBeforeMove = await moveProbeClip.boundingBox();
  if (!secondBeforeMove) throw new Error('Trimmed move probe clip is not measurable.');
  const secondClipForMove = moveProbeClip;

  await page.mouse.up();
  await page.mouse.move(moveStart.x, moveStart.y);
  await page.mouse.down();
  await page.mouse.move(moveEnd.x, moveEnd.y, { steps: 8 });
  const secondDuringMove = await secondClipForMove.boundingBox();
  if (!secondDuringMove || !(secondDuringMove.x > secondBeforeMove.x + 5)) {
    const hit = await page.evaluate(({ x, y }) => { const element = document.elementFromPoint(x, y); return { tag: element?.tagName, className: element instanceof HTMLElement ? element.className : null }; }, { x: secondBeforeMove.x + secondBeforeMove.width / 2, y: secondBeforeMove.y + secondBeforeMove.height / 2 });
    throw new Error(`Move preview did not respond: ${secondBeforeMove?.x} -> ${secondDuringMove?.x} (size ${secondBeforeMove?.width}x${secondBeforeMove?.height}, hit ${hit?.tag}:${hit?.className}, rangeMode ${await rangeMode.getAttribute('aria-pressed')})`);
  }
  await page.mouse.up();
  await page.waitForTimeout(3000);
  const secondAfterMove = await secondClipForMove.boundingBox();
  if (!secondAfterMove || !(secondAfterMove.x > secondBeforeMove.x + 5)) throw new Error(`Move drag did not move the clip: ${secondBeforeMove?.x} -> ${secondAfterMove?.x} (trim ${secondTailInitial} -> ${secondTailShort}, max ${await secondTail.getAttribute('aria-valuemax')}, rangeMode ${await rangeMode.getAttribute('aria-pressed')})`);
  const moveFingerprint = await timelineFingerprint();
  await restoreOriginal();

  // Capture the restored editor as a neutral review state, not with the last
  // trim/move gesture or preview selection still visually active.
  await page.keyboard.press('Escape');
  await page.locator('.timelineHeader').click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(500);

  await page.screenshot({ path: screenshotPath, timeout: 60000 });
  const report = {
    ok: true,
    projectPath,
    screenshotPath,
    runtimeEvidence: {
      before: { projectId: projectPath, screenshotPath: runtimeBeforePath, screenshotSha256: sha256(runtimeBeforePath), timelineFingerprint: beforeTimelineFingerprint },
      change: { projectId: projectPath, screenshotPath: runtimeChangePath, screenshotSha256: sha256(runtimeChangePath), timelineFingerprint: changeTimelineFingerprint },
      after: { projectId: projectPath, screenshotPath: runtimeAfterPath, screenshotSha256: sha256(runtimeAfterPath), timelineFingerprint: afterTimelineFingerprint },
      scissors: { timelineFingerprint: iconTimelineFingerprint },
      rangeCut: { before: beforeRangeCut, after: afterRangeCut, timelineFingerprint: rangeCutFingerprint },
      split: { boundaryErrorPx: splitBoundaryError },
      gapClosing: { gapPx: rangeGapPx },
      rippleDelete: { before: beforeRippleDelete, after: afterRippleDelete, gapPx: rippleGapPx, selectedClipState, timelineFingerprint: rippleDeleteFingerprint },
    clickToPlay: { playheadSamples, framePlayback },
    audioWaveform: { background: waveformBackground, alignment: audioAlignment },
    templates: { count: templateWidths.length, minWidth: Math.min(...templateWidths), splitCanvas, splitGeometry, postSplitSeekGeometry, renderedTemplateGeometry, delayedTemplateGeometry, postSeekTemplateGeometry, postSeekRenderDebug: postSeekRenderDebug.debug },
    sourceVideoDebug,
      trim: { initialTailFrame, shorterTailFrame, longerTailFrame },
      cancel: { trim: { before: cancelTrimFrame, after: afterTrimCancelFrame }, move: { beforeX: secondBeforeMove.x, afterX: secondAfterMoveCancel.x } },
      zoom: { playheadXBefore: playheadXBeforeZoom, playheadXAfter: playheadXAfterZoom, playheadAnchorPixelError, pointerX: zoomPointerX, fitTrackWidth, zoomTrackWidth, refitTrackWidth },
      move: { beforeX: secondBeforeMove.x, afterX: secondAfterMove.x, timelineFingerprint: moveFingerprint },
    },
    toolbarBox, viewportBox, firstSeek, secondSeek, clipSeek, emptyLaneSeek, beforeSplit, afterSplit, afterRestore, beforeIconSplit, afterIconSplit, afterIconRestore, beforeRippleDelete, afterRippleDelete, beforeRangeCut, afterRangeCut, initialTailFrame, shorterTailFrame, longerTailFrame,
  };
  writeFileSync(join(outputRoot, 'interaction-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close().catch(() => undefined);
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}

async function restoreOriginalRecording(page) {
  const restore = page.getByRole('button', { name: 'Restore original recording' });
  await restore.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Restore original recording');
    return Boolean(button && !button.disabled);
  }, null, { timeout: 30000 });
  await restore.click({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('.screenLane [data-recording-clip-id]').length === 1, null, { timeout: 30000 });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
