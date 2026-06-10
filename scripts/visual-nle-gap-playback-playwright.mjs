// Reproduction harness: NLE Editor playback across a deleted (gapped) clip.
// User report: "the editor completely disregards the cuts in the middle" —
// playback sails through removed material. This script makes two cuts,
// deletes the middle clip, plays across the gap, and samples the underlying
// <video> element to prove whether the deleted source range is played.
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const DURATION_SECONDS = 60;
const FPS = 30;

const root = await mkdtemp(join(tmpdir(), 'rough-cut-nle-gap-'));
const mediaPath = join(root, 'gap-source.mp4');
const reportPath = join(root, 'gap-playback-report.json');
const shots = {
  beforePlay: join(root, '01-before-play.png'),
  afterCross: join(root, '02-after-crossing-gap.png'),
};

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y', '-f', 'lavfi', '-i',
  `testsrc2=size=960x540:rate=${FPS}`,
  '-t', String(DURATION_SECONDS),
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: new Date(startedAt.getTime() + DURATION_SECONDS * 1000).toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: FPS,
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

let report = { ok: false, root, projectPath: project.path };
let failure;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await dismissPreRecordOverlay(page);
  await page.locator('nav.appViewTabStrip button.appViewTab', { hasText: 'Editor' }).click();
  await page.waitForSelector('.nleClipBlock', { timeout: 10000 });
  await page.waitForTimeout(600);

  const rulerLocator = page.locator('.nleTimelineRuler');
  const videoClips = page.locator('.nleTrackLaneBody[data-track-kind="video"] .nleClipBlock');

  // The preview monitor settles its height after media metadata loads, which
  // shifts the timeline — measure the ruler fresh immediately before every
  // click or the coordinates go stale.
  async function clickRulerAt(fraction) {
    const box = await requiredBox(rulerLocator, 'ruler');
    await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  }

  const steps = [];
  report.steps = steps;
  async function snapshotStep(label) {
    const state = await page.evaluate(() => {
      const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
      const match = meta.match(/(\d+)\s*\/\s*(\d+)\s*frames/);
      return {
        playheadFrame: match ? Number(match[1]) : null,
        durationFrames: match ? Number(match[2]) : null,
        clipCount: document.querySelectorAll('.nleTrackLaneBody[data-track-kind="video"] .nleClipBlock').length,
        selected: document.querySelector('.nleClipBlock.selected') !== null,
        selectedIn: document.querySelector('.nleClipBlock.selected')?.getAttribute('data-timeline-in') ?? null,
      };
    });
    steps.push({ label, ...state });
  }

  // Split at ~20% and ~40%, then delete the middle clip → gap.
  await videoClips.first().click();
  await page.waitForTimeout(150);
  await snapshotStep('select-clip');
  const probe = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const path = [];
    let node = el;
    while (node && path.length < 6) {
      path.push(`${node.tagName?.toLowerCase()}.${[...(node.classList ?? [])].join('.')}`);
      node = node.parentElement;
    }
    window.__pdLog = [];
    document.addEventListener('pointerdown', (ev) => {
      window.__pdLog.push({
        target: `${ev.target?.tagName?.toLowerCase()}.${[...(ev.target?.classList ?? [])].join('.')}`,
      });
    }, { capture: true, once: true });
    const rect = (sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
    };
    return {
      hit: path,
      clickPoint: { x: Math.round(x), y: Math.round(y) },
      rects: {
        ruler: rect('.nleTimelineRuler'),
        content: rect('.nleLaneContent'),
        bodies: rect('.nleLaneBodies'),
        firstLane: rect('.nleTrackLaneBody'),
      },
    };
  }, await (async () => { const b = await requiredBox(rulerLocator, 'ruler'); return { x: b.x + b.width * 0.2, y: b.y + b.height / 2 }; })());
  report.probe = probe;
  await clickRulerAt(0.2);
  await page.waitForTimeout(150);
  report.probePdLog = await page.evaluate(() => window.__pdLog ?? null);
  await snapshotStep('seek-20pct');
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  await snapshotStep('split-1');
  await clickRulerAt(0.4);
  await page.waitForTimeout(150);
  await snapshotStep('seek-40pct');
  await page.keyboard.press('s');
  await page.waitForTimeout(200);
  await snapshotStep('split-2');
  const clipCount = await videoClips.count();
  await videoClips.nth(1).click({ timeout: 5000 });
  await page.waitForTimeout(150);
  await snapshotStep('select-middle');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(250);
  await snapshotStep('delete-middle');
  const clipCountAfterDelete = await videoClips.count();

  // Read the resulting video segments straight from the canonical timeline.
  const segments = await page.evaluate(() => {
    const debugProject = window.__roughCutDebugProject;
    return debugProject ?? null;
  });

  // Derive gap boundaries from clip geometry + header duration.
  const liveDurationFrames = await page.evaluate(() => {
    const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
    const match = meta.match(/\/\s*(\d+)\s*frames/);
    return match ? Number(match[1]) : null;
  });
  const clipRects = await page.evaluate(() => {
    const content = document.querySelector('.nleLaneContent');
    if (!content) return null;
    const contentRect = content.getBoundingClientRect();
    const lane = [...document.querySelectorAll('.nleTrackLaneBody[data-track-kind="video"]')][0];
    return [...(lane?.querySelectorAll('.nleClipBlock') ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return { leftRatio: (r.x - contentRect.x) / contentRect.width, rightRatio: (r.x + r.width - contentRect.x) / contentRect.width };
    });
  });
  const gapStartFrame = Math.round((clipRects?.[0]?.rightRatio ?? 0.2) * liveDurationFrames);
  const gapEndFrame = Math.round((clipRects?.[1]?.leftRatio ?? 0.4) * liveDurationFrames);
  const gapStartSec = gapStartFrame / FPS;
  const gapEndSec = gapEndFrame / FPS;

  // Park the playhead ~2s before the cut, then play across it.
  const startFrame = Math.max(0, gapStartFrame - 2 * FPS);
  await clickRulerAt(startFrame / liveDurationFrames);
  await page.waitForTimeout(300);
  await page.screenshot({ path: shots.beforePlay, fullPage: false });
  await page.keyboard.press(' ');

  // Sample the source <video> + published playhead while playing (~6s).
  const samples = [];
  for (let i = 0; i < 60; i += 1) {
    const sample = await page.evaluate(() => {
      const video = document.querySelector('.nleProgramMonitor video');
      const meta = document.querySelector('.nleHeaderMeta')?.textContent ?? '';
      const match = meta.match(/(\d+)\s*\/\s*\d+\s*frames/);
      return {
        videoCurrentTime: video ? video.currentTime : null,
        videoPaused: video ? video.paused : null,
        playheadFrame: match ? Number(match[1]) : null,
        debug: window.__roughCutTimelinePlaybackDebug ?? null,
      };
    });
    samples.push(sample);
    await page.waitForTimeout(100);
  }
  await page.keyboard.press(' ');
  await page.screenshot({ path: shots.afterCross, fullPage: false });

  // Analysis: did the source video play material inside the deleted range?
  const tolSec = 3 / FPS;
  const cutSamples = samples.filter((s) =>
    s.videoCurrentTime !== null && s.videoPaused === false &&
    s.videoCurrentTime > gapStartSec + tolSec && s.videoCurrentTime < gapEndSec - tolSec);
  const crossedToSecondClip = samples.some((s) => s.videoCurrentTime !== null && s.videoCurrentTime >= gapEndSec - tolSec);
  const playheadEnteredGap = samples.filter((s) => s.playheadFrame !== null && s.playheadFrame > gapStartFrame + 3 && s.playheadFrame < gapEndFrame - 3);

  report = {
    ok: true,
    root,
    projectPath: project.path,
    screenshots: shots,
    clipCount,
    clipCountAfterDelete,
    liveDurationFrames,
    gapStartFrame,
    gapEndFrame,
    gapStartSec,
    gapEndSec,
    sampleCount: samples.length,
    cutContentSampleCount: cutSamples.length,
    cutContentSamples: cutSamples.slice(0, 8),
    playheadInGapSampleCount: playheadEnteredGap.length,
    playheadInGapSamples: playheadEnteredGap.slice(0, 8).map((s) => s.playheadFrame),
    crossedToSecondClip,
    firstSamples: samples.slice(0, 6),
    problems: [
      ...(cutSamples.length > 0 ? [`playback played ${cutSamples.length} samples of DELETED source material (${gapStartSec.toFixed(1)}s–${gapEndSec.toFixed(1)}s)`] : []),
      ...(playheadEnteredGap.length > 1 ? [`playhead dwelled in the gap for ${playheadEnteredGap.length} samples instead of skipping the cut`] : []),
      ...(!crossedToSecondClip ? ['playback never reached the clip after the gap during the sample window'] : []),
    ],
  };
} catch (error) {
  failure = error;
  report.failure = String(error?.message ?? error).slice(0, 400);
} finally {
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (!electronProcess.killed) electronProcess.kill();
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({ ok: report.ok, reportPath, root, problems: report.problems ?? [], cutContentSampleCount: report.cutContentSampleCount, playheadInGapSampleCount: report.playheadInGapSampleCount, crossedToSecondClip: report.crossedToSecondClip }, null, 2));
if (failure) throw failure;

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} bounding box was unavailable.`);
  return box;
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
