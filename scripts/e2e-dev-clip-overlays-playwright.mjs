// Real-app gate: a zoom and a caption placed ON an added clip, and a sound file (mp3)
// added at the playhead (dev tools, Noam 2026-10-21 "finish today's features").
//
// Runs the built app on a temporary copy of a real project (never the original), with the
// dev switch on, an isolated profile and all sound muted. It:
//  1. inserts an outside clip at 10 s
//  2. clicks the Zoom lane over the clip: a clip zoom appears there, the preview shows a
//     smaller window of the clip in the zoom's hold, and undo takes it away again (redo back)
//  3. clicks the Captions lane over the clip and types a line: the preview draws it on the clip
//  4. adds an mp3 at 2 s with "Play over": it lands on the Voice lane at the playhead
// Screenshots go to the output folder for the visual review.
// Usage: xvfb-run -a node scripts/e2e-dev-clip-overlays-playwright.mjs <project.roughcut>
// Needs a built renderer (pnpm --filter @rough-cut/desktop build).
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/e2e-dev-clip-overlays-playwright.mjs <project.roughcut>');
const sourcePath = resolve(process.argv[2]);
const outputRoot = process.env.ROUGH_CUT_E2E_OUTPUT || mkdtempSync(join(tmpdir(), 'rough-cut-dev-clip-overlays-'));
const fps = 30;
const FFMPEG = process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe';
const CAPTION = 'Caption on the added clip';

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { return loadSharedPlaywright(); }
}

const clipPath = join(outputRoot, 'outside-clip.mp4');
const mp3Path = join(outputRoot, 'tone.mp3');
for (const args of [
  ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=960x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-threads', '2', clipPath],
  ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000', '-t', '2', '-c:a', 'libmp3lame', '-b:a', '128k', '-threads', '2', mp3Path],
]) {
  const made = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(`fixture failed: ${made.stderr}`);
}

// A small second project (3 s blue screen with a tone) to add with its finished look.
const otherDir = join(outputRoot, 'other');
mkdirSync(otherDir, { recursive: true });
const otherScreen = join(otherDir, 'other.mp4');
const otherMade = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-threads', '2', otherScreen], { encoding: 'utf8' });
if (otherMade.status !== 0) throw new Error(`fixture failed: ${otherMade.stderr}`);
await saveProjectForRecording({ startedAt: '2026-01-01T00:00:00.000Z', stoppedAt: '2026-01-01T00:00:03.000Z', rawPath: otherScreen, outputPath: otherScreen, width: 1280, height: 720, fps, audio: { micSource: 'test' }, cursorEvents: [] });
const otherProject = join(otherDir, 'other.roughcut');

// Temporary copy of the project: media by absolute path, captions switched on so the lane shows.
const fixturePath = join(outputRoot, 'clip-overlays-fixture.roughcut');
const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
const projectDocument = raw.project ?? raw;
for (const asset of projectDocument.assets) {
  if (typeof asset.filePath === 'string' && !isAbsolute(asset.filePath)) asset.filePath = join(dirname(sourcePath), asset.filePath);
}
projectDocument.captions = { ...(projectDocument.captions ?? {}), enabled: true };
writeFileSync(fixturePath, JSON.stringify(raw));

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: join(root, 'apps/desktop/node_modules/.bin/electron'),
  chromiumSandbox: true,
  args: ['--enable-sandbox', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--user-data-dir=${join(outputRoot, 'user-data')}`, '.'],
  cwd: join(root, 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_DEV_FEATURES: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: fixturePath,
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1080',
  },
});

const seekTo = (page, seconds) => page.evaluate((value) => {
  window.__roughCutSetPreviewTimeSec?.(value);
  const input = document.querySelector('.timelineScrubber');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}, seconds);
const shot = (page, name) => page.screenshot({ path: join(outputRoot, `${name}.png`) });
const drawn = (page) => page.evaluate(() => window.__roughCutInsertedMediaDebug ?? null);

// Click a lane's track at a timeline frame.
async function clickLaneAt(page, laneSelector, frame) {
  await scrollTimelineTo(page, frame);
  const point = await page.evaluate(({ laneSelector, frame }) => {
    const track = document.querySelector(`${laneSelector} .laneTrack`);
    const scrubber = document.querySelector('.timelineScrubber');
    if (!track || !scrubber) return null;
    track.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const rect = track.getBoundingClientRect();
    const totalFrames = Number(scrubber.max) * 30;
    return { x: rect.left + (frame / totalFrames) * rect.width, y: rect.top + rect.height / 2, width: window.innerWidth };
  }, { laneSelector, frame });
  if (!point) throw new Error(`lane ${laneSelector} not found`);
  if (point.x < 0 || point.x > point.width) throw new Error(`frame ${frame} is off screen on ${laneSelector} (x=${Math.round(point.x)})`);
  await page.mouse.click(point.x, point.y);
}

// Scroll the (zoomed-in) timeline sideways so a frame sits in the middle of the view.
async function scrollTimelineTo(page, frame) {
  await page.evaluate((frame) => {
    const track = document.querySelector('.laneTrack');
    const scrubber = document.querySelector('.timelineScrubber');
    if (!track || !scrubber) return;
    let scroller = track.parentElement;
    while (scroller && !(scroller.scrollWidth > scroller.clientWidth + 2 && getComputedStyle(scroller).overflowX !== 'visible')) scroller = scroller.parentElement;
    if (!scroller) return;
    const rect = track.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    const x = rect.left + (frame / (Number(scrubber.max) * 30)) * rect.width;
    scroller.scrollLeft += x - (box.left + box.width / 2);
  }, frame);
  await page.waitForTimeout(300);
}

try {
  const page = await app.firstWindow();
  page.on('console', (message) => { if (message.type() === 'error') console.log('[renderer error]', message.text()); });
  await page.waitForTimeout(2500);
  const openEditorButton = page.locator('[data-open-editor="pre-record"]');
  if (await openEditorButton.count()) await openEditorButton.click();
  await page.waitForSelector('.clipBar', { timeout: 30000 });
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 30000 });
  await page.waitForTimeout(1500);

  // 1. Insert the clip at 10 s (frames 300-390).
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, clipPath);
  await seekTo(page, 10);
  await page.waitForTimeout(800);
  await page.locator('.devMenuButton').click();
  await page.locator('.devMenuItem', { hasText: 'Add clip at playhead' }).first().click();
  await page.locator('.devChoiceButton', { hasText: 'Insert' }).click();
  await page.waitForSelector('.insertedClipBar[data-inserted-lane="screen"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  // On a 13-minute timeline a 3 s clip is a sliver: zoom the timeline in around the playhead.
  for (let i = 0; i < 6; i += 1) {
    const zoomIn = page.locator('[aria-label="Zoom timeline in"]');
    if (!(await zoomIn.count()) || await zoomIn.isDisabled()) break;
    await zoomIn.click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);

  // 2. A zoom on the clip: click the Zoom lane at 11 s.
  const zoomsBefore = await page.locator('[data-clip-zoom="true"]').count();
  await clickLaneAt(page, '.zoomLane', 330);
  await page.waitForTimeout(1000);
  check('zoom-lane-click-on-clip-adds-a-clip-zoom', (await page.locator('[data-clip-zoom="true"]').count()) === zoomsBefore + 1, { zoomsBefore });
  await seekTo(page, 9.5);
  await page.waitForTimeout(600);
  await seekTo(page, 12.0);
  await page.waitForTimeout(1500);
  const inZoom = await drawn(page);
  check('preview-shows-the-clip-zoomed-in-the-hold', inZoom?.zoomWindow && inZoom.zoomWindow.w < inZoom.videoWidth * 0.6, inZoom);
  await scrollTimelineTo(page, 345);
  await shot(page, '1-zoom-on-added-clip');
  await seekTo(page, 10.3);
  await page.waitForTimeout(1200);
  const beforeZoom = await drawn(page);
  check('preview-shows-the-whole-clip-before-the-zoom', beforeZoom?.zoomWindow && Math.abs(beforeZoom.zoomWindow.w - beforeZoom.videoWidth) < 1, beforeZoom);
  // Undo / redo of the clip zoom.
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1000);
  check('undo-removes-the-clip-zoom', (await page.locator('[data-clip-zoom="true"]').count()) === zoomsBefore, null);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(1000);
  check('redo-brings-the-clip-zoom-back', (await page.locator('[data-clip-zoom="true"]').count()) === zoomsBefore + 1, null);

  // 3. A caption on the clip: click the Captions lane at 10.1 s and type a line.
  await clickLaneAt(page, '.captionsLane', 303);
  await page.waitForSelector('.captionEditorInput', { timeout: 5000 });
  await page.keyboard.type(CAPTION);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await seekTo(page, 9.5);
  await page.waitForTimeout(600);
  await seekTo(page, 10.4);
  await page.waitForTimeout(1500);
  const withCaption = await drawn(page);
  check('preview-draws-the-caption-on-the-clip', withCaption?.caption === CAPTION, withCaption);
  check('caption-block-on-the-lane', (await page.locator('.captionBlock', { hasText: CAPTION }).count()) === 1, null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await scrollTimelineTo(page, 330);
  await shot(page, '2-caption-on-added-clip');

  // 4. An mp3 at 2 s, played over the recording.
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, mp3Path);
  await seekTo(page, 2);
  await page.waitForTimeout(800);
  await page.locator('.devMenuButton').click();
  await page.locator('.devMenuItem', { hasText: 'Add clip at playhead' }).first().click();
  await page.waitForSelector('[data-sound-choice="true"]', { timeout: 10000 });
  check('sound-file-offers-replace-or-play-over', (await page.locator('[data-sound-choice="true"] .devChoiceButton').count()) === 2, null);
  await shot(page, '3-mp3-choice');
  await page.locator('[data-sound-choice="true"] .devChoiceButton', { hasText: 'Play over' }).click();
  await page.waitForTimeout(1500);
  await scrollTimelineTo(page, 90);
  const voice = await page.evaluate(() => [...document.querySelectorAll('.insertedClipBar.voiceOverBar')].map((element) => ({
    name: element.textContent,
    timelineIn: Number(element.getAttribute('data-timeline-in')),
    timelineOut: Number(element.getAttribute('data-timeline-out')),
    mode: element.querySelector('.voiceModeChip')?.getAttribute('data-voice-mode') ?? null,
  })));
  const mp3 = voice.find((item) => item.name?.includes('tone.mp3'));
  // An mp3 carries an encoder delay, so its length can read a frame or two over 2 s.
  check('mp3-lands-on-the-voice-lane-at-the-playhead', mp3?.timelineIn === 60 && Math.abs(mp3.timelineOut - 120) <= 2 && mp3?.mode === 'over', voice);
  await page.locator('.insertedClipBar.voiceOverBar').first().scrollIntoViewIfNeeded().catch(() => undefined);
  await shot(page, '4-mp3-added');

  // 5. Another project, added with its finished look, at 20 s (Insert).
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, otherProject);
  await seekTo(page, 20);
  await page.waitForTimeout(800);
  const screensBefore = await page.locator('.insertedClipBar[data-inserted-lane="screen"]').count();
  await page.locator('.devMenuButton').click();
  await page.locator('.devMenuItem', { hasText: 'Add clip at playhead' }).first().click();
  await page.locator('.devChoiceButton', { hasText: 'Insert' }).click();
  await page.waitForFunction((count) => document.querySelectorAll('.insertedClipBar[data-inserted-lane="screen"]').length > count, screensBefore, { timeout: 180000 });
  await page.waitForTimeout(800);
  const added = await page.evaluate(() => [...document.querySelectorAll('.insertedClipBar[data-inserted-lane="screen"]')].map((element) => ({ name: element.textContent, timelineIn: Number(element.getAttribute('data-timeline-in')), timelineOut: Number(element.getAttribute('data-timeline-out')) })));
  const fromProject = added.find((item) => item.timelineIn === 600);
  check('another-project-is-added-at-the-playhead', Boolean(fromProject) && Math.abs(fromProject.timelineOut - 690) <= 2 && fromProject.name.includes('other'), added);
  const finished = readdirSync(join(outputRoot, 'added-media')).filter((name) => name.startsWith('other-') && name.endsWith('.mp4'));
  check('its finished export is saved next to the project', finished.length === 1, finished);
  if (finished.length === 1) {
    // The finished look: the 1280x720 blue screen sits on the project background, not edge to edge.
    const frame = spawnSync(FFMPEG, ['-v', 'error', '-ss', '1', '-i', join(outputRoot, 'added-media', finished[0]), '-frames:v', '1', '-vf', 'crop=4:4:2:2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1024 * 1024 });
    const [r, g, b] = frame.stdout ?? [];
    check('the added project has its styled look (background at the corner)', frame.status === 0 && !(b > 180 && r < 70 && g < 70), [r, g, b]);
  }
  await seekTo(page, 21);
  await page.waitForTimeout(1500);
  await scrollTimelineTo(page, 640);
  await shot(page, '5-project-added');
} finally {
  await app.close().catch(() => undefined);
}
console.log(`output: ${outputRoot}`);
if (failures.length) { console.error(`FAILED (${failures.length})`); process.exit(1); }
console.log('PASS dev clip overlays (real app)');
