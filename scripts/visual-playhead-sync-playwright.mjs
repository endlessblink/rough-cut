import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-visual-playhead-sync-'));
const mediaPath = join(root, 'playhead-sync-source.mp4');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildFilter(),
  '-t',
  '20',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + 20000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: 30,
});

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: join(process.cwd(), 'apps/desktop/node_modules/.bin/electron'),
  args: ['--no-sandbox', '--force-color-profile=srgb', '.'],
  cwd: join(process.cwd(), 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: project.path,
  },
});
const electronProcess = app.process();

let report = null;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await openRecordingEdit(page);
  await seekRecordingRatio(page, 0.42);
  const recordingBeforeNle = await readRecordingPlayhead(page);

  await openNle(page);
  const nleAfterRecording = await readNlePlayhead(page);

  await seekNleRatio(page, 0.31);
  const nleBeforeRecording = await readNlePlayhead(page);

  await openRecordingEdit(page);
  const recordingAfterNle = await readRecordingPlayhead(page);
  const recordingFollow = await proveRecordingTimelineFollow(page);

  await openNle(page);
  const nleFollow = await proveNleTimelineFollow(page);

  report = {
    ok: ratioMatches(recordingBeforeNle, nleAfterRecording)
      && ratioMatches(nleBeforeRecording, recordingAfterNle)
      && recordingFollow.ok
      && nleFollow.ok,
    root,
    projectPath: project.path,
    recordingBeforeNle,
    nleAfterRecording,
    nleBeforeRecording,
    recordingAfterNle,
    recordingFollow,
    nleFollow,
  };
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

console.info(JSON.stringify(report, null, 2));
if (!report?.ok) throw new Error(`Playhead sync regression failed: ${JSON.stringify(report)}`);

async function openRecordingEdit(page) {
  await dismissPreRecordOverlay(page);
  await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Recording edit"]').click({ force: true }).catch(() => undefined);
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
  await page.waitForSelector('input[aria-label="Scrub timeline"]', { timeout: 15000 });
}

async function openNle(page) {
  await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Editor"]').click({ force: true });
  await page.waitForSelector('[data-ui-region="nle-workspace"]', { timeout: 15000 });
  await page.waitForSelector('.nlePlayhead', { timeout: 15000 });
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

async function seekRecordingRatio(page, ratio) {
  await page.locator('input[aria-label="Scrub timeline"]').evaluate((input, nextRatio) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('Recording scrubber is not an input.');
    const max = Number(input.max);
    input.value = String(Math.max(0, Math.min(max, max * nextRatio)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, ratio);
  await page.waitForTimeout(350);
}

async function seekNleRatio(page, ratio) {
  const ruler = await page.locator('[data-ui-region="nle-time-ruler"]').boundingBox();
  if (!ruler) throw new Error('NLE time ruler bounding box was unavailable.');
  await page.mouse.click(ruler.x + ruler.width * ratio, ruler.y + ruler.height / 2);
  await page.waitForTimeout(350);
}

async function readRecordingPlayhead(page) {
  return page.locator('input[aria-label="Scrub timeline"]').evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('Recording scrubber is not an input.');
    const value = Number(input.value);
    const max = Number(input.max);
    return { view: 'recording', value, max, ratio: max > 0 ? value / max : null };
  });
}

async function readNlePlayhead(page) {
  return page.evaluate(() => {
    const playhead = document.querySelector('.nlePlayhead');
    const left = playhead instanceof HTMLElement ? Number.parseFloat(playhead.style.left) : Number.NaN;
    return {
      view: 'nle',
      leftPct: Number.isFinite(left) ? left : null,
      ratio: Number.isFinite(left) ? left / 100 : null,
      timecode: document.querySelector('.nleTransportTimeCurrent')?.textContent ?? null,
    };
  });
}

async function proveRecordingTimelineFollow(page) {
  await openRecordingEdit(page);
  await seekRecordingRatio(page, 0.6);
  await clickZoomIn(page, '[data-ui-region="editor-workspace"] button[aria-label="Zoom timeline in"]', 5);
  const before = await resetTimelineScrollAndRead(page, '.timelineViewport', '.timelineTrackOverlay .playhead');
  await page.locator('[data-ui-region="editor-workspace"] .videoControls button[title="Play or pause (Space)"]').click();
  const after = await waitForTimelineFollow(page, '.timelineViewport', '.timelineTrackOverlay .playhead', before.scrollLeft + 20);
  await page.locator('[data-ui-region="editor-workspace"] .videoControls button[title="Play or pause (Space)"]').click().catch(() => undefined);
  return {
    view: 'recording',
    ok: after.scrollLeft > before.scrollLeft + 20 && after.playheadVisible,
    before,
    after,
  };
}

async function proveNleTimelineFollow(page) {
  await openNle(page);
  await seekNleRatio(page, 0.6);
  await clickZoomIn(page, '[data-ui-region="nle-timeline"] button[aria-label="Zoom timeline in"]', 5);
  const before = await resetTimelineScrollAndRead(page, '[data-ui-region="nle-lane-bodies"]', '.nlePlayhead');
  await page.locator('section[aria-label="Timeline viewer"] button[aria-label="Play"]').click();
  const after = await waitForTimelineFollow(page, '[data-ui-region="nle-lane-bodies"]', '.nlePlayhead', before.scrollLeft + 20);
  await page.locator('section[aria-label="Timeline viewer"] button[aria-label="Pause"]').click().catch(() => undefined);
  return {
    view: 'nle',
    ok: after.scrollLeft > before.scrollLeft + 20 && after.playheadVisible,
    before,
    after,
  };
}

async function clickZoomIn(page, selector, count) {
  const button = page.locator(selector).first();
  for (let i = 0; i < count; i += 1) {
    if (await button.isDisabled().catch(() => false)) return;
    await button.click();
    await page.waitForTimeout(80);
  }
}

async function resetTimelineScrollAndRead(page, viewportSelector, playheadSelector) {
  await installTimelineFollowReader(page);
  return page.evaluate(({ viewportSelector, playheadSelector }) => {
    const viewport = document.querySelector(viewportSelector);
    if (!(viewport instanceof HTMLElement)) throw new Error(`Missing viewport ${viewportSelector}`);
    viewport.scrollLeft = 0;
    return window.__roughCutReadTimelineFollowState(viewportSelector, playheadSelector);
  }, { viewportSelector, playheadSelector });
}

async function waitForTimelineFollow(page, viewportSelector, playheadSelector, minScrollLeft) {
  await installTimelineFollowReader(page);
  await page.waitForFunction(({ viewportSelector, playheadSelector, minScrollLeft }) => {
    const state = window.__roughCutReadTimelineFollowState(viewportSelector, playheadSelector);
    return state.scrollLeft >= minScrollLeft && state.playheadVisible;
  }, { viewportSelector, playheadSelector, minScrollLeft }, { timeout: 5000 });
  return page.evaluate(({ viewportSelector, playheadSelector }) => window.__roughCutReadTimelineFollowState(viewportSelector, playheadSelector), { viewportSelector, playheadSelector });
}

async function installTimelineFollowReader(page) {
  await page.evaluate((readerSource) => {
    window.__roughCutReadTimelineFollowState = (0, eval)(`(${readerSource})`);
  }, readTimelineFollowState.toString());
}

function ratioMatches(left, right, tolerance = 0.025) {
  return Number.isFinite(left?.ratio)
    && Number.isFinite(right?.ratio)
    && Math.abs(left.ratio - right.ratio) <= tolerance;
}

function buildFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc2=size=960x540:rate=30',
    `drawtext=fontfile=${font}:text='PLAYHEAD SYNC':fontcolor=white:fontsize=44:x=40:y=40:box=1:boxcolor=0x00000099`,
    'drawbox=x=40:y=410:w=140:h=90:color=0xff0000:t=fill',
    'drawbox=x=410:y=410:w=140:h=90:color=0x00ff00:t=fill',
    'drawbox=x=780:y=410:w=140:h=90:color=0x0000ff:t=fill',
  ].join(',');
}

function readTimelineFollowState(viewportSelector, playheadSelector) {
  const viewport = document.querySelector(viewportSelector);
  const playhead = document.querySelector(playheadSelector);
  if (!(viewport instanceof HTMLElement)) throw new Error(`Missing viewport ${viewportSelector}`);
  if (!(playhead instanceof HTMLElement)) throw new Error(`Missing playhead ${playheadSelector}`);
  const viewportRect = viewport.getBoundingClientRect();
  const playheadRect = playhead.getBoundingClientRect();
  const playheadCenterX = playheadRect.left + playheadRect.width / 2;
  return {
    scrollLeft: viewport.scrollLeft,
    scrollWidth: viewport.scrollWidth,
    clientWidth: viewport.clientWidth,
    playheadVisible: playheadCenterX >= viewportRect.left && playheadCenterX <= viewportRect.right,
    viewport: { left: viewportRect.left, right: viewportRect.right, width: viewportRect.width },
    playhead: { left: playheadRect.left, right: playheadRect.right, width: playheadRect.width, centerX: playheadCenterX },
  };
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
