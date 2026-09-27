import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const require = createRequire(import.meta.url);
const sharp = require(join(root, 'vendor', 'freecut', 'node_modules', 'sharp'));
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) throw new Error('Usage: node scripts/recording-editor-interactions-playwright.mjs <real-project.roughcut>');

const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electronPath = join(artifactRoot, 'electron');
const dockLaunchPath = join(artifactRoot, 'dock-launch.sh');
if (!existsSync(appPath) || !existsSync(electronPath) || !existsSync(dockLaunchPath)) throw new Error('Package the app before running recording-editor interaction proof.');
const desktopEntryPath = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications', 'rough-cut-mvp.desktop');
if (!existsSync(desktopEntryPath)) throw new Error(`Installed Rough Cut desktop entry is missing: ${desktopEntryPath}`);
const desktopEntry = readFileSync(desktopEntryPath, 'utf8');
const expectedDesktopExec = `Exec=env ROUGH_CUT_DOCK_LAUNCH=1 ${dockLaunchPath}`;
if (!desktopEntry.split('\n').some((line) => line === expectedDesktopExec)) {
  throw new Error(`Installed Rough Cut desktop entry is not bound to the current dock launcher: ${JSON.stringify({ desktopEntryPath, expectedDesktopExec })}`);
}

const outputRoot = process.env.ROUGH_CUT_RECORDING_INTERACTIONS_OUTPUT || join('/tmp', `rough-cut-recording-interactions-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const screenshotPath = join(outputRoot, 'recording-editor-interactions.png');
const boundaryScreenshotPath = join(outputRoot, 'recording-editor-linked-boundaries.png');
const repeatedBoundaryScreenshotPath = join(outputRoot, 'recording-editor-repeated-linked-boundaries.png');
const repeatedBoundaryCloseupScreenshotPath = join(outputRoot, 'recording-editor-repeated-linked-boundaries-closeup.png');
const boundaryZoomScreenshotPath = join(outputRoot, 'recording-editor-linked-boundary-zoom.png');
const interactionReportPath = join(outputRoot, 'interaction-report.json');
const runtimeBeforePath = join(outputRoot, 'runtime-before.png');
const runtimeChangePath = join(outputRoot, 'runtime-change.png');
const runtimeAfterPath = join(outputRoot, 'runtime-after.png');
const { _electron: electron } = loadPlaywright();
  const app = await electron.launch({
    executablePath: dockLaunchPath,
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
  await page.waitForTimeout(300);
  const provenancePath = '/tmp/rough-cut-dock-provenance.json';
  const identityPath = join(appPath, 'package-identity.json');
  if (!existsSync(provenancePath) || !existsSync(identityPath)) throw new Error('Dock launch identity evidence is missing.');
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  const packageIdentity = JSON.parse(readFileSync(identityPath, 'utf8'));
  if (provenance.launchSource !== 'installed-desktop-entry'
    || JSON.stringify(provenance.packageIdentity) !== JSON.stringify(packageIdentity)
    || Date.parse(provenance.startedAt) < Date.parse(packageIdentity.packagedAt)) {
    throw new Error(`Dock launch is stale or not installed-entry bound: ${JSON.stringify({ provenance, packageIdentity })}`);
  }
  const runtimeFailures = [];
  page.on('crash', () => runtimeFailures.push('renderer crashed'));
  page.on('close', () => runtimeFailures.push('editor window closed'));
  app.on('close', () => runtimeFailures.push('electron app closed'));
  const waitForEditor = async (ms, label) => {
    if (page.isClosed()) throw new Error(`Live editor closed before ${label}; ${runtimeFailures.join('; ') || 'no runtime event was reported'}`);
    await page.waitForTimeout(ms);
    if (page.isClosed()) throw new Error(`Live editor closed during ${label}; ${runtimeFailures.join('; ') || 'no runtime event was reported'}`);
  };
  await page.waitForLoadState('domcontentloaded');
  const recordingTab = page.locator('[data-ui-region="app-view-tabstrip"] button[title="Recording edit"]');
  await recordingTab.waitFor({ state: 'attached', timeout: 30000 });
  await recordingTab.evaluate((button) => button.click());
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 30000 });
  const sourceVideos = page.locator('video.hiddenSource');
  await sourceVideos.first().waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForTimeout(1500);
  const sourceVideoDebug = await sourceVideos.evaluateAll((nodes) => nodes.map((node) => ({
    src: node.getAttribute('src'),
    currentSrc: node.currentSrc,
    readyState: node.readyState,
    currentTime: node.currentTime,
    duration: node.duration,
    videoWidth: node.videoWidth,
    videoHeight: node.videoHeight,
  })));
  const readPreviewMediaEvidence = () => page.locator('.styledPreviewCanvas').evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement) || node.width === 0 || node.height === 0) {
      return { hasVisibleMedia: false, width: node instanceof HTMLCanvasElement ? node.width : 0, height: node instanceof HTMLCanvasElement ? node.height : 0 };
    }
    const context = node.getContext('2d', { willReadFrequently: true });
    if (!context) return { hasVisibleMedia: false, width: node.width, height: node.height };
    const sampleWidth = 64;
    const sampleHeight = 36;
    const sample = context.getImageData(0, 0, node.width, node.height).data;
    let visiblePixels = 0;
    let minLuma = 255;
    let maxLuma = 0;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const sourceX = Math.min(node.width - 1, Math.floor((x + 0.5) * node.width / sampleWidth));
        const sourceY = Math.min(node.height - 1, Math.floor((y + 0.5) * node.height / sampleHeight));
        const offset = (sourceY * node.width + sourceX) * 4;
        const luma = 0.2126 * sample[offset] + 0.7152 * sample[offset + 1] + 0.0722 * sample[offset + 2];
        minLuma = Math.min(minLuma, luma);
        maxLuma = Math.max(maxLuma, luma);
        if (Math.max(sample[offset], sample[offset + 1], sample[offset + 2]) > 8) visiblePixels += 1;
      }
    }
    const visibleFraction = visiblePixels / (sampleWidth * sampleHeight);
    return {
      hasVisibleMedia: visibleFraction > 0.02 && maxLuma - minLuma > 6,
      width: node.width,
      height: node.height,
      visibleFraction,
      minLuma,
      maxLuma,
    };
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.styledPreviewCanvas');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) return false;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    let min = 255;
    let max = 0;
    const sampleWidth = 64;
    const sampleHeight = 36;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const sourceX = Math.min(canvas.width - 1, Math.floor((x + 0.5) * canvas.width / sampleWidth));
        const sourceY = Math.min(canvas.height - 1, Math.floor((y + 0.5) * canvas.height / sampleHeight));
        const offset = (sourceY * canvas.width + sourceX) * 4;
        const luma = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
        min = Math.min(min, luma);
        max = Math.max(max, luma);
        if (Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 8) visible += 1;
      }
    }
    return visible / (sampleWidth * sampleHeight) > 0.02 && max - min > 6;
  }, null, { timeout: 60000 });
  const initialPreviewMedia = await readPreviewMediaEvidence();
  if (!initialPreviewMedia.hasVisibleMedia) throw new Error(`Visible preview canvas is blank despite ready source media: ${JSON.stringify({ sourceVideoDebug, initialPreviewMedia })}`);
  const timelineTool = page.locator('nav[aria-label="Editor tools"] button[aria-label="Timeline"]');
  await timelineTool.waitFor({ state: 'visible', timeout: 30000 });
  await timelineTool.evaluate((button) => button.click());
  const surface = page.locator('.visualTimeline');
  const ruler = page.locator('.timelineRuler');
  const screenTrack = page.locator('.screenLane .laneTrack');
  await surface.waitFor({ state: 'visible', timeout: 30000 });
  await ruler.waitFor({ state: 'visible', timeout: 30000 });
  await screenTrack.waitFor({ state: 'visible', timeout: 30000 });
  const readLinkedLaneBoxes = async () => page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    linkedLaneStatus: document.querySelector('.visualTimeline')?.getAttribute('data-recording-linked-lane-boundaries'),
    linkedLaneMismatchCount: Number(document.querySelector('.visualTimeline')?.getAttribute('data-recording-linked-lane-mismatch-count') ?? NaN),
    screenTrack: (() => {
      const rect = document.querySelector('.screenLane .laneTrack')?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
    })(),
    audioTrack: (() => {
      const rect = document.querySelector('.audioLane .laneTrack')?.getBoundingClientRect();
      return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
    })(),
    boundaryMarkers: [...document.querySelectorAll('.clipCutBoundary')].map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { className: node.className, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, background: style.backgroundColor, zIndex: style.zIndex, display: style.display, opacity: style.opacity };
    }),
    screen: [...document.querySelectorAll('.screenLane [data-recording-clip-id]')].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-recording-clip-id'),
        left: rect.left,
        right: rect.right,
        width: rect.width,
        timelineIn: Number(node.getAttribute('data-recording-timeline-in')),
        timelineOut: Number(node.getAttribute('data-recording-timeline-out')),
        boundaryFrame: Number(node.querySelector('[data-recording-cut-boundary-frame]')?.getAttribute('data-recording-cut-boundary-frame') ?? NaN),
      };
    }),
    audio: [...document.querySelectorAll('.audioLane [data-recording-audio-clip-id]')].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-recording-audio-clip-id'),
        left: rect.left,
        right: rect.right,
        width: rect.width,
        timelineIn: Number(node.getAttribute('data-recording-timeline-in')),
        timelineOut: Number(node.getAttribute('data-recording-timeline-out')),
        boundaryFrame: Number(node.querySelector('[data-recording-cut-boundary-frame]')?.getAttribute('data-recording-cut-boundary-frame') ?? NaN),
      };
    }),
  }));
  const readAudioWaveformMapping = async () => page.locator('.audioLane [data-recording-audio-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const waveform = node.querySelector('.audioWaveform');
    return {
      timelineIn: Number(node.getAttribute('data-recording-timeline-in')),
      backgroundImage: waveform?.style.backgroundImage ?? 'none',
      backgroundPosition: waveform?.style.backgroundPosition ?? '',
      backgroundSize: waveform?.style.backgroundSize ?? '',
    };
  }));
  const readPaintedBoundaryEvidence = async (imagePath, lanes) => {
    const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const score = (track, x) => {
      if (!track) return 0;
      const scale = lanes.devicePixelRatio || 1;
      const pixelX = Math.max(2, Math.min(info.width - 3, Math.round(x * scale)));
      const top = Math.max(1, Math.round(track.top * scale) + 3);
      const bottom = Math.min(info.height - 2, Math.round((track.top + track.height) * scale) - 3);
      let total = 0;
      let samples = 0;
      for (let y = top; y <= bottom; y += 1) {
        const left = (y * info.width + pixelX - 2) * info.channels;
        const right = (y * info.width + pixelX + 2) * info.channels;
        total += Math.abs(data[left] - data[right]) + Math.abs(data[left + 1] - data[right + 1]) + Math.abs(data[left + 2] - data[right + 2]);
        samples += 1;
      }
      return samples ? total / samples : 0;
    };
    const screenXs = lanes.screen.slice(0, -1).map((clip) => clip.right);
    const audioXs = lanes.audio.slice(0, -1).map((clip) => clip.right);
    const allXs = [...new Set([...screenXs, ...audioXs].map((x) => Math.round(x)))].sort((a, b) => a - b);
    const boundaries = allXs.map((x) => ({
      x,
      screenScore: score(lanes.screenTrack, x),
      audioScore: score(lanes.audioTrack, x),
    }));
    const missing = boundaries.filter((boundary) => boundary.screenScore < 24 || boundary.audioScore < 24);
    if (missing.length > 0) throw new Error(`Painted SCREEN/AUDIO boundary pixels diverged: ${JSON.stringify({ devicePixelRatio: lanes.devicePixelRatio, image: { width: info.width, height: info.height }, screen: lanes.screen, audio: lanes.audio, boundaryMarkers: lanes.boundaryMarkers, boundaries, missing })}`);
    return { boundaries, threshold: 24, screenshotPath: imagePath };
  };
  const assertLinkedLaneGeometry = (label, lanes) => {
    if (lanes.linkedLaneStatus !== 'pass' || lanes.linkedLaneMismatchCount !== 0) throw new Error(`${label} failed the renderer linked-lane invariant: ${JSON.stringify(lanes)}`);
    if (lanes.screen.length !== lanes.audio.length) throw new Error(`${label} changed linked lane counts: ${JSON.stringify(lanes)}`);
    const audioByScreenId = new Map(lanes.audio.map((audioClip) => [
      audioClip.id?.startsWith('audio:') ? audioClip.id.slice('audio:'.length) : audioClip.id,
      audioClip,
    ]));
    const matchedAudioIds = new Set();
    const mismatches = lanes.screen.flatMap((screenClip, index) => {
      const audioClip = audioByScreenId.get(screenClip.id);
      if (!audioClip) return [{ index, screenClip, audioClip: null }];
      matchedAudioIds.add(audioClip.id);
      const leftErrorPx = Math.abs(screenClip.left - audioClip.left);
      const rightErrorPx = Math.abs(screenClip.right - audioClip.right);
      const frameMismatch = screenClip.timelineIn !== audioClip.timelineIn
        || screenClip.timelineOut !== audioClip.timelineOut
        || (Number.isFinite(screenClip.boundaryFrame) && screenClip.boundaryFrame !== audioClip.boundaryFrame);
      return !frameMismatch && leftErrorPx <= 0.5 && rightErrorPx <= 0.5 ? [] : [{ index, leftErrorPx, rightErrorPx, screenClip, audioClip }];
    });
    lanes.audio.forEach((audioClip, index) => {
      if (!matchedAudioIds.has(audioClip.id)) mismatches.push({ index, screenClip: null, audioClip });
    });
    if (mismatches.length > 0) throw new Error(`${label} left Screen and Audio boundaries misaligned: ${JSON.stringify(mismatches)}`);
  };
  const readRenderedCutEvidence = async () => page.evaluate(() => {
    const screen = [...document.querySelectorAll('.screenLane [data-recording-clip-id]')];
    const audio = [...document.querySelectorAll('.audioLane [data-recording-audio-clip-id]')];
    const boundary = (node) => {
      const marker = node?.querySelector('[data-recording-cut-boundary-frame]');
      const rect = marker?.getBoundingClientRect();
      return marker && rect ? {
        frame: Number(marker.getAttribute('data-recording-cut-boundary-frame')),
        x: rect.left,
        width: rect.width,
      } : null;
    };
    const clip = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.getAttribute('data-recording-clip-id') ?? node.getAttribute('data-recording-audio-clip-id'),
        timelineIn: Number(node.getAttribute('data-recording-timeline-in')),
        timelineOut: Number(node.getAttribute('data-recording-timeline-out')),
        left: rect.left,
        right: rect.right,
        width: rect.width,
        selected: node.classList.contains('selectedClip'),
      };
    };
    const renderedRanges = screen.map((screenClip) => {
      const screenId = screenClip.getAttribute('data-recording-clip-id');
      const audioClip = audio.find((node) => node.getAttribute('data-recording-audio-clip-id') === `audio:${screenId}`);
      return {
        screenId,
        audioId: audioClip?.getAttribute('data-recording-audio-clip-id'),
        screenIn: Number(screenClip.getAttribute('data-recording-timeline-in')),
        audioIn: Number(audioClip?.getAttribute('data-recording-timeline-in')),
        screenOut: Number(screenClip.getAttribute('data-recording-timeline-out')),
        audioOut: Number(audioClip?.getAttribute('data-recording-timeline-out')),
      };
    });
    const boundaries = screen.slice(1).flatMap((screenClip) => {
      const screenId = screenClip.getAttribute('data-recording-clip-id');
      const audioClip = audio.find((node) => node.getAttribute('data-recording-audio-clip-id') === `audio:${screenId}`);
      const screenMarker = boundary(screenClip);
      const audioMarker = boundary(audioClip);
      return screenMarker && audioMarker ? [{
        frame: screenMarker.frame,
        screenX: screenMarker.x,
        audioX: audioMarker.x,
        markerErrorPx: Math.abs(screenMarker.x - audioMarker.x),
      }] : [];
    });
    return {
      selectedScreenClipIds: screen.filter((node) => node.classList.contains('selectedClip')).map((node) => node.getAttribute('data-recording-clip-id')),
      screen: screen.map(clip),
      audio: audio.map(clip),
      screenBoundary: boundary(screen[1]),
      audioBoundary: boundary(audio.find((node) => node.getAttribute('data-recording-audio-clip-id') === `audio:${screen[1]?.getAttribute('data-recording-clip-id')}`)),
      boundaries,
      renderedRanges,
    };
  });
  const assertRenderedCutEvidence = (label, evidence) => {
    const screenBoundary = evidence.screenBoundary;
    const audioBoundary = evidence.audioBoundary;
    if (evidence.selectedScreenClipIds.length !== 1) throw new Error(`${label} did not leave exactly one SCREEN clip selected: ${JSON.stringify(evidence)}`);
    if (!screenBoundary || !audioBoundary) throw new Error(`${label} did not render both linked cut markers: ${JSON.stringify(evidence)}`);
    const markerErrorPx = Math.abs(screenBoundary.x - audioBoundary.x);
    const edgeErrorPx = Math.abs((evidence.screen[0]?.right ?? NaN) - (evidence.audio[0]?.right ?? NaN));
    if (evidence.screen.length !== 2 || evidence.audio.length !== 2) throw new Error(`${label} did not render exactly two linked clips in both lanes: ${JSON.stringify(evidence)}`);
    if (evidence.screen[1]?.id === evidence.audio[1]?.id) throw new Error(`${label} lost distinct linked SCREEN/AUDIO clip identities: ${JSON.stringify(evidence)}`);
    const rangeMismatches = evidence.renderedRanges.filter((range) => (
      range.audioId !== `audio:${range.screenId}`
      || range.screenIn !== range.audioIn
      || range.screenOut !== range.audioOut
    ));
    if (rangeMismatches.length > 0) throw new Error(`${label} rendered mismatched linked ranges: ${JSON.stringify(rangeMismatches)}`);
    if (evidence.boundaries.length !== evidence.screen.length - 1 || evidence.boundaries.some((boundary) => boundary.markerErrorPx > 0.5)) {
      throw new Error(`${label} rendered repeated SCREEN/AUDIO cut markers at different pixels: ${JSON.stringify(evidence.boundaries)}`);
    }
    if (!Number.isFinite(markerErrorPx) || markerErrorPx > 0.5 || !Number.isFinite(edgeErrorPx) || edgeErrorPx > 0.5) {
      throw new Error(`${label} rendered SCREEN/AUDIO cut edges at different pixels: ${JSON.stringify({ markerErrorPx, edgeErrorPx, evidence })}`);
    }
    return { ...evidence, markerErrorPx, edgeErrorPx, selectedScreenClipId: evidence.selectedScreenClipIds[0], screenBoundary, audioBoundary };
  };
  const persistedProject = JSON.parse(readFileSync(projectPath, 'utf8'));
  const persistedRecording = persistedProject.assets?.find((asset) => asset.type === 'recording');
  const expectedPersistedRanges = [...new Map((persistedProject.timeline?.tracks ?? [])
    .filter((track) => track.kind === 'video')
    .flatMap((track) => track.clips ?? [])
    .filter((clip) => clip.mediaId === `source:${persistedRecording?.id}:screen`)
    .map((clip) => [
      `${Math.round(clip.timelineIn)}:${Math.round(clip.timelineOut)}`,
      [Math.round(clip.timelineIn), Math.round(clip.timelineOut)],
    ])).values()];
  const assertPersistedRangesRendered = (label, lanes) => {
    if (expectedPersistedRanges.length === 0) return;
    const expected = JSON.stringify(expectedPersistedRanges);
    const actualScreen = JSON.stringify(lanes.screen.map((clip) => [clip.timelineIn, clip.timelineOut]));
    const actualAudio = JSON.stringify(lanes.audio.map((clip) => [clip.timelineIn, clip.timelineOut]));
    if (actualScreen !== expected || actualAudio !== expected) {
      throw new Error(`${label} did not render the persisted recording ranges in both lanes: ${JSON.stringify({ expectedPersistedRanges, actualScreen: lanes.screen, actualAudio: lanes.audio })}`);
    }
  };
  const initialLinkedLanes = await readLinkedLaneBoxes();
  assertPersistedRangesRendered('initial loaded timeline', initialLinkedLanes);
  assertLinkedLaneGeometry('initial loaded timeline', initialLinkedLanes);
  await restoreOriginalRecording(page);
  await page.waitForTimeout(500);

  const toolbarBox = await page.locator('[data-ui-region="timeline-toolbar"]').boundingBox();
  const viewportBox = await page.locator('.timelineViewport').boundingBox();
  if (!toolbarBox || !viewportBox || toolbarBox.bottom > viewportBox.top) throw new Error('Timeline controls overlap the seek surface.');

  const rulerBox = await ruler.boundingBox();
  if (!rulerBox) throw new Error('Timeline ruler is not measurable.');
  const fps = 30;
  const seekAt = async (fraction) => {
    await page.mouse.click(rulerBox.x + rulerBox.width * fraction, rulerBox.y + rulerBox.height / 2);
    await page.waitForTimeout(250);
    return page.locator('.playhead').evaluate((node) => Number.parseFloat(getComputedStyle(node).left));
  };
  const seekToExactFrame = async (frame) => {
    await page.locator('.timelineScrubber').evaluate((node, value) => {
      const input = node;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, frame / fps);
    try {
      await page.waitForFunction((expectedFrame) => {
        const value = Number(document.querySelector('.timelineScrubber')?.value);
        return Number.isFinite(value) && Math.round(value * 30) === expectedFrame;
      }, frame, { timeout: 1500 });
    } catch {
      const scrubber = page.locator('.timelineScrubber');
      await scrubber.focus();
      await page.keyboard.press('Home');
      for (let index = 0; index < frame; index += 1) await page.keyboard.press('ArrowRight');
      await page.waitForFunction((expectedFrame) => {
        const value = Number(document.querySelector('.timelineScrubber')?.value);
        return Number.isFinite(value) && Math.round(value * 30) === expectedFrame;
      }, frame, { timeout: 3000 });
    }
    await page.waitForTimeout(250);
  };
  await seekToExactFrame(3);
  const beforeHeadSplit = await page.locator('.screenLane [data-recording-clip-id]').count();
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
  const afterHeadSplit = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterHeadSplit !== beforeHeadSplit + 1) throw new Error(`S did not split the first three frames: ${beforeHeadSplit} -> ${afterHeadSplit}`);
  const headSplitLanes = await readLinkedLaneBoxes();
  assertLinkedLaneGeometry('three-frame head split', headSplitLanes);
  if (headSplitLanes.screen[0]?.timelineOut !== 3 || headSplitLanes.audio[0]?.timelineOut !== 3) {
    throw new Error(`Three-frame head split landed at different boundaries: ${JSON.stringify(headSplitLanes)}`);
  }
  const headSplitPreview = await readPreviewMediaEvidence();
  if (!headSplitPreview.hasVisibleMedia) throw new Error(`Three-frame head split rendered a black/blank preview: ${JSON.stringify(headSplitPreview)}`);
  const headSplitWaveforms = await page.locator('.audioLane [data-recording-audio-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const region = node.getBoundingClientRect();
    const waveform = node.querySelector('.audioWaveform');
    const waveformRect = waveform?.getBoundingClientRect();
    return { regionWidth: region.width, waveformWidth: waveformRect?.width ?? 0, background: waveform ? getComputedStyle(waveform).backgroundImage : 'none' };
  }));
  if (headSplitWaveforms.some((item) => item.waveformWidth <= 0 || item.background === 'none' || Math.abs(item.waveformWidth - item.regionWidth) > 1)) {
    throw new Error(`Three-frame head split distorted the audio waveform: ${JSON.stringify(headSplitWaveforms)}`);
  }
  await page.locator('.screenLane .clipBody').first().click({ force: true });
  await page.locator('.screenLane .selectedClip').first().waitFor({ state: 'visible', timeout: 5000 });
  const renderedCutEvidence = assertRenderedCutEvidence('selected three-frame head split', await readRenderedCutEvidence());
  let repeatedCutEvidence = null;
  await page.screenshot({ path: boundaryScreenshotPath, timeout: 60000 });
  const boundaryZoomCrop = await page.evaluate(() => {
    const marker = document.querySelector('.screenLane [data-recording-clip-id]:nth-child(2) [data-recording-cut-boundary-frame]')
      ?? document.querySelector('.screenLane [data-recording-cut-boundary-frame]');
    const screenLane = document.querySelector('.screenLane')?.getBoundingClientRect();
    const audioLane = document.querySelector('.audioLane')?.getBoundingClientRect();
    const markerRect = marker?.getBoundingClientRect();
    if (!screenLane || !audioLane || !markerRect) return null;
    return {
      x: Math.max(0, markerRect.left - 140),
      y: Math.max(0, Math.min(screenLane.top, audioLane.top) - 20),
      width: 280,
      height: Math.min(220, Math.max(screenLane.bottom, audioLane.bottom) - Math.min(screenLane.top, audioLane.top) + 40),
    };
  });
  if (!boundaryZoomCrop) throw new Error('Could not calculate a zoomed crop around the rendered linked boundary.');
  await page.screenshot({ path: boundaryZoomScreenshotPath, clip: boundaryZoomCrop, timeout: 60000 });
  await restoreOriginalRecording(page);
  await page.locator('.screenLane .clipBody').first().click({ force: true });
  const headTrimHandle = page.locator('.screenLane [data-recording-trim-edge="head"]').first();
  await headTrimHandle.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const headTrimLanes = await readLinkedLaneBoxes();
  assertLinkedLaneGeometry('one-frame head trim', headTrimLanes);
  if (headTrimLanes.screen[0]?.timelineIn !== 1 || headTrimLanes.audio[0]?.timelineIn !== 1) {
    throw new Error(`One-frame head trim landed at different boundaries: ${JSON.stringify(headTrimLanes)}`);
  }
  const headTrimPreview = await readPreviewMediaEvidence();
  if (!headTrimPreview.hasVisibleMedia) throw new Error(`One-frame head trim rendered a black/blank preview: ${JSON.stringify(headTrimPreview)}`);
  const headTrimWaveforms = await page.locator('.audioLane [data-recording-audio-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const region = node.getBoundingClientRect();
    const waveform = node.querySelector('.audioWaveform');
    const waveformRect = waveform?.getBoundingClientRect();
    return { regionWidth: region.width, waveformWidth: waveformRect?.width ?? 0, background: waveform ? getComputedStyle(waveform).backgroundImage : 'none' };
  }));
  if (headTrimWaveforms.some((item) => item.waveformWidth <= 0 || item.background === 'none' || Math.abs(item.waveformWidth - item.regionWidth) > 1)) {
    throw new Error(`One-frame head trim distorted the audio waveform: ${JSON.stringify(headTrimWaveforms)}`);
  }
  await restoreOriginalRecording(page);
  const firstSeek = await seekAt(0.22);
  const secondSeek = await seekAt(0.67);
  if (!(secondSeek > firstSeek + 10)) throw new Error(`Ruler seek did not move the playhead: ${firstSeek} -> ${secondSeek}`);

  const clip = page.locator('.screenLane .clipBody').first();
  await clip.waitFor({ state: 'visible', timeout: 30000 });
  const clipBox = await clip.boundingBox();
  if (!clipBox) throw new Error('Screen clip is not measurable.');
  const clipStructure = async () => page.locator('.screenLane [data-recording-clip-id]').evaluateAll((nodes) => nodes.map((node) => ({
    id: node.getAttribute('data-recording-clip-id'),
    timelineIn: node.getAttribute('data-recording-timeline-in'),
    timelineOut: node.getAttribute('data-recording-timeline-out'),
  })));
  const normalClickStructureBefore = await clipStructure();
  const clickX = clipBox.x + clipBox.width * 0.73;
  const clickY = clipBox.y + clipBox.height / 2;
  // One pixel of pointer drift must remain a normal click, not a clip edit.
  await page.mouse.move(clickX, clickY);
  await page.mouse.down();
  await page.mouse.move(clickX + 1, clickY);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const normalClickStructureAfter = await clipStructure();
  if (JSON.stringify(normalClickStructureAfter) !== JSON.stringify(normalClickStructureBefore)) {
    throw new Error(`Normal clip click changed the timeline structure: ${JSON.stringify({ before: normalClickStructureBefore, after: normalClickStructureAfter })}`);
  }
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
  await waitForEditor(1000, '16:9 template stabilization');
  const splitCanvas = await page.locator('.styledPreviewCanvas').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { ratio: rect.height > 0 ? rect.width / rect.height : null, computedAspect: getComputedStyle(node).aspectRatio };
  });
  if (splitCanvas.ratio === null || Math.abs(splitCanvas.ratio - 16 / 9) > 0.02) throw new Error(`16:9 split template did not set landscape preview bounds: ${JSON.stringify(splitCanvas)}`);
  await page.waitForFunction(() => {
    const debug = (window).__roughCutPreviewRenderDebug;
    const frame = debug?.frame;
    const near = (value, expected) => Number.isFinite(value) && Math.abs(value - expected) < 0.003;
    return Boolean(
      (window).__roughCutCameraFramePresent
      && (window).__roughCutCanvasCameraRect
      && (window).__roughCutCanvasScreenRect
      && near(frame?.screenFrame?.x, 0.385)
      && near(frame?.screenFrame?.y, 0.3)
      && near(frame?.screenFrame?.w, 0.53)
      && near(frame?.screenFrame?.h, 0.4)
      && near(frame?.cameraFrame?.x, 0.105)
      && near(frame?.cameraFrame?.y, 0.17)
      && near(frame?.cameraFrame?.w, 0.245)
      && near(frame?.cameraFrame?.h, 0.66)
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
  const postSeekPreviewMedia = await readPreviewMediaEvidence();
  if (!postSeekPreviewMedia.hasVisibleMedia) throw new Error(`Visible preview canvas became blank after timeline/template interaction: ${JSON.stringify(postSeekPreviewMedia)}`);
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
  await page.evaluate(() => {
    const video = document.querySelector('video.hiddenSource');
    const target = window;
    target.__roughCutPlaybackTrace = [];
    if (!video) return;
    for (const eventName of ['play', 'playing', 'pause', 'ended', 'seeking', 'seeked', 'timeupdate']) {
      video.addEventListener(eventName, () => {
        target.__roughCutPlaybackTrace.push({ eventName, currentTime: video.currentTime, paused: video.paused, readyState: video.readyState });
      });
    }
  });
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
    const playbackTrace = await page.evaluate(() => (window).__roughCutPlaybackTrace ?? []);
    throw new Error(`Media did not start from the clicked point: ${JSON.stringify(playbackState)}; debug=${JSON.stringify({ playbackDebug, playbackTrace })}`);
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
  await seekAt(0.12);
  await playButton.click({ force: true });
  await page.waitForTimeout(600);
  await playButton.click({ force: true });
  const scrubber = page.locator('.timelineScrubber');
  const scrubberBox = await scrubber.boundingBox();
  if (!scrubberBox) throw new Error('Timeline scrubber is not measurable for drag-to-play verification.');
  const dragStartX = scrubberBox.x + scrubberBox.width * 0.12;
  const dragEndX = scrubberBox.x + scrubberBox.width * 0.72;
  await page.mouse.move(dragStartX, scrubberBox.y + scrubberBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragEndX, scrubberBox.y + scrubberBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const releasedTimelineSec = await scrubber.inputValue();
  const releasedTimeSec = Number(releasedTimelineSec);
  if (!Number.isFinite(releasedTimeSec) || releasedTimeSec < 10) throw new Error(`Scrub drag did not commit a far released position: ${releasedTimelineSec}`);
  const releasedPlayhead = await readPlayhead();
  await playButton.click({ force: true });
  await page.waitForTimeout(500);
  const afterDragPlayback = await page.locator('video.hiddenSource').first().evaluate((node) => ({ currentTime: node.currentTime, paused: node.paused }));
  if (afterDragPlayback.paused || afterDragPlayback.currentTime < releasedTimeSec - 0.05) throw new Error(`Playback did not start from the released playhead: ${JSON.stringify({ releasedTimeSec, releasedPlayhead, afterDragPlayback })}`);
  await playButton.click({ force: true });
  await page.waitForTimeout(300);
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
  assertLinkedLaneGeometry('S split', await readLinkedLaneBoxes());
  const changeTimelineFingerprint = await timelineFingerprint();
  await page.screenshot({ path: runtimeChangePath, timeout: 60000 });

  const restore = page.locator('button.timelineRestoreButton[aria-label="Restore original recording"]');
  await restore.waitFor({ state: 'visible', timeout: 30000 });
  const restoreOriginal = async () => {
    await restore.waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('button.timelineRestoreButton[aria-label="Restore original recording"]');
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

  await seekToExactFrame(3);
  await page.keyboard.press('s');
  await page.waitForTimeout(700);
  await seekToExactFrame(6);
  await page.keyboard.press('s');
  await page.waitForTimeout(900);
  const repeatedZoomButton = page.getByRole('button', { name: 'Zoom timeline in' });
  for (let index = 0; index < 40; index += 1) {
    if (await repeatedZoomButton.isDisabled()) break;
    await repeatedZoomButton.click({ force: true });
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
  const repeatedCutLanes = await readLinkedLaneBoxes();
  assertLinkedLaneGeometry('repeated timeline-start cuts', repeatedCutLanes);
  if (repeatedCutLanes.screen.length !== 3 || repeatedCutLanes.audio.length !== 3) {
    throw new Error(`Repeated cuts did not leave three linked clips in both lanes: ${JSON.stringify(repeatedCutLanes)}`);
  }
  const repeatedCutWaveforms = await readAudioWaveformMapping();
  const waveformSizes = new Set(repeatedCutWaveforms.map((waveform) => waveform.backgroundSize));
  const waveformPositions = new Set(repeatedCutWaveforms.map((waveform) => waveform.backgroundPosition));
  if (repeatedCutWaveforms.some((waveform) => waveform.backgroundImage === 'none' || !waveform.backgroundSize || !waveform.backgroundPosition)
    || waveformSizes.size !== 1
    || waveformPositions.size !== repeatedCutWaveforms.length) {
    throw new Error(`Cut audio waveforms must share one timeline-scale image with a distinct canonical offset per child: ${JSON.stringify(repeatedCutWaveforms)}`);
  }
  repeatedCutEvidence = repeatedCutLanes;
  await page.screenshot({ path: repeatedBoundaryScreenshotPath, timeout: 60000 });
  const paintedBoundaryEvidence = await readPaintedBoundaryEvidence(repeatedBoundaryScreenshotPath, repeatedCutLanes);
  const repeatedBoundaryCloseup = await page.evaluate(() => {
    const screen = [...document.querySelectorAll('.screenLane [data-recording-clip-id]')];
    const audio = [...document.querySelectorAll('.audioLane [data-recording-audio-clip-id]')];
    const tracks = [document.querySelector('.screenLane')?.getBoundingClientRect(), document.querySelector('.audioLane')?.getBoundingClientRect()].filter(Boolean);
    const boundaryXs = [...screen.slice(0, -1), ...audio.slice(0, -1)].map((node) => node.getBoundingClientRect().right);
    if (!tracks.length || !boundaryXs.length) return null;
    const left = Math.max(0, Math.min(...boundaryXs) - 40);
    const right = Math.max(...boundaryXs) + 40;
    const top = Math.max(0, Math.min(...tracks.map((rect) => rect.top)) - 20);
    const bottom = Math.max(...tracks.map((rect) => rect.bottom)) + 20;
    return { x: left, y: top, width: Math.max(80, right - left), height: Math.max(80, bottom - top) };
  });
  if (!repeatedBoundaryCloseup) throw new Error('Could not calculate the repeated linked-boundary close-up.');
  await page.screenshot({ path: repeatedBoundaryCloseupScreenshotPath, clip: repeatedBoundaryCloseup, timeout: 60000 });
  const beforeRippleDelete = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (beforeRippleDelete !== 3) throw new Error(`Ripple-delete setup did not create three clips: ${beforeRippleDelete}`);
  const linkedAudioBeforeDelete = await page.locator('.audioLane [data-recording-audio-clip-id]').count();
  if (linkedAudioBeforeDelete !== beforeRippleDelete) throw new Error(`Linked audio did not split with video: ${beforeRippleDelete} video clips -> ${linkedAudioBeforeDelete} audio clips`);
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
  const selectedAudioState = await page.locator('.audioLane .linkedAudioRegion').count();
  if (selectedAudioState !== 1) throw new Error(`Selecting a video clip did not select exactly one linked audio clip: ${selectedAudioState}`);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(1200);
  const afterRippleDelete = await page.locator('.screenLane [data-recording-clip-id]').count();
  if (afterRippleDelete !== 2) {
    const remainingClipIds = await page.locator('.screenLane [data-recording-clip-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-recording-clip-id')));
    const timelineDebug = await page.evaluate(() => (window).__roughCutTimelineInteractionDebug ?? null);
    throw new Error(`Backspace did not delete exactly the selected clip: ${beforeRippleDelete} -> ${afterRippleDelete}; remaining=${JSON.stringify(remainingClipIds)}; debug=${JSON.stringify(timelineDebug)}`);
  }
  const linkedAudioAfterDelete = await page.locator('.audioLane [data-recording-audio-clip-id]').count();
  if (linkedAudioAfterDelete !== afterRippleDelete) throw new Error(`Backspace left linked audio behind: ${afterRippleDelete} video clips -> ${linkedAudioAfterDelete} audio clips`);
  const rippleClipBoxes = await page.locator('.screenLane [data-recording-clip-id]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width };
  }));
  const rippleGapPx = rippleClipBoxes.length === 2 ? rippleClipBoxes[1].left - rippleClipBoxes[0].right : Infinity;
  if (!Number.isFinite(rippleGapPx) || Math.abs(rippleGapPx) > 3) throw new Error(`Backspace left a gap after deleting the selected clip: ${rippleGapPx}px`);
  const rippleDeleteFingerprint = await timelineFingerprint();
  await restoreOriginal();
  const fitAfterRepeatedCuts = page.getByRole('button', { name: 'Fit timeline' });
  if (!(await fitAfterRepeatedCuts.isDisabled())) {
    await fitAfterRepeatedCuts.click({ force: true });
    await page.waitForTimeout(300);
  }

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
  await page.locator('.screenLane .selectedClip').first().waitFor({ state: 'visible', timeout: 5000 });
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
  await page.waitForFunction(() => document.querySelectorAll('.trimAvailabilityGuide').length === 1, null, { timeout: 5000 });
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
    boundaryScreenshotPath,
    renderedCutEvidence: {
      ...renderedCutEvidence,
      renderedScreenCount: renderedCutEvidence.screen?.length ?? 2,
      renderedAudioCount: renderedCutEvidence.audio?.length ?? 2,
      renderedScreenClipIds: renderedCutEvidence.screen?.map((clip) => clip.id) ?? [],
      renderedAudioClipIds: renderedCutEvidence.audio?.map((clip) => clip.id) ?? [],
      boundaryFrame: renderedCutEvidence.screenBoundary?.frame ?? null,
      screenBoundaryX: renderedCutEvidence.screenBoundary?.x ?? null,
      audioBoundaryX: renderedCutEvidence.audioBoundary?.x ?? null,
      boundaryErrorPx: Math.max(renderedCutEvidence.markerErrorPx, renderedCutEvidence.edgeErrorPx),
      boundaryZoomScreenshotPath,
      boundaryZoomScreenshotSha256: sha256(boundaryZoomScreenshotPath),
      repeatedBoundaryScreenshotPath,
      repeatedBoundaryScreenshotSha256: sha256(repeatedBoundaryScreenshotPath),
      repeatedCutEvidence,
      paintedBoundaryEvidence,
      repeatedBoundaryCloseupScreenshotPath,
      repeatedBoundaryCloseupScreenshotSha256: sha256(repeatedBoundaryCloseupScreenshotPath),
      repeatedBoundaryCloseup,
      interactionReportPath,
      screenshotSha256: sha256(boundaryScreenshotPath),
    },
    runtimeEvidence: {
      installedDesktopEntry: { path: desktopEntryPath, exec: expectedDesktopExec, verified: true },
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
    previewMedia: { initial: initialPreviewMedia, postSeek: postSeekPreviewMedia },
    templates: { count: templateWidths.length, minWidth: Math.min(...templateWidths), splitCanvas, splitGeometry, postSplitSeekGeometry, renderedTemplateGeometry, delayedTemplateGeometry, postSeekTemplateGeometry, postSeekRenderDebug: postSeekRenderDebug.debug },
    sourceVideoDebug,
      trim: { initialTailFrame, shorterTailFrame, longerTailFrame },
      cancel: { trim: { before: cancelTrimFrame, after: afterTrimCancelFrame }, move: { beforeX: secondBeforeMove.x, afterX: secondAfterMoveCancel.x } },
      zoom: { playheadXBefore: playheadXBeforeZoom, playheadXAfter: playheadXAfterZoom, playheadAnchorPixelError, pointerX: zoomPointerX, fitTrackWidth, zoomTrackWidth, refitTrackWidth },
      move: { beforeX: secondBeforeMove.x, afterX: secondAfterMove.x, timelineFingerprint: moveFingerprint },
    },
    toolbarBox, viewportBox, firstSeek, secondSeek, clipSeek, emptyLaneSeek, beforeSplit, afterSplit, afterRestore, beforeIconSplit, afterIconSplit, afterIconRestore, beforeRippleDelete, afterRippleDelete, beforeRangeCut, afterRangeCut, initialTailFrame, shorterTailFrame, longerTailFrame,
  };
  writeFileSync(interactionReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (process.env.ROUGH_CUT_HOLD_FOR_VISUAL_PROOF === '1') {
    await new Promise((resolve) => setTimeout(resolve, 180000));
  }
  await app.close().catch(() => undefined);
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}

async function restoreOriginalRecording(page) {
  const restore = page.locator('button.timelineRestoreButton[aria-label="Restore original recording"]');
  await restore.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('button.timelineRestoreButton[aria-label="Restore original recording"]');
    return Boolean(button && !button.disabled);
  }, null, { timeout: 30000 });
  await restore.click({ force: true });
  await page.waitForFunction(() => document.querySelectorAll('.screenLane [data-recording-clip-id]').length === 1, null, { timeout: 30000 });
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
