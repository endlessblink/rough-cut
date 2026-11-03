// Real-app gate for the dev-only voice-over take (Dev menu > Record voice-over).
//
// Runs the built app on a temporary copy of a real project (never the original), with
// the dev switch on, Chromium's fake mic (a steady beep) and all sound muted. It:
//  1. records a voice-over from the playhead (no range) and stops it by hand: it
//     lands as its own clip on a Voice-over lane at the playhead, sound only, set
//     to replace the old voice; the file on disk is sound only
//  2. flips that take to "play over" and back with undo
//  3. records one over a marked range: it stops by itself and covers the range
//  4. drags it later on the timeline; undo puts it back; undo again removes it
//  5. confirms the Dev menu is absent when the switch is off
// Screenshots go to the output folder for a visual review.
// Usage: xvfb-run -a node scripts/e2e-dev-voice-over-playwright.mjs <project.roughcut>
// Needs a built renderer (pnpm --filter @rough-cut/desktop build).
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/e2e-dev-voice-over-playwright.mjs <project.roughcut>');
const sourcePath = resolve(process.argv[2]);
const outputRoot = process.env.ROUGH_CUT_E2E_OUTPUT || mkdtempSync(join(tmpdir(), 'rough-cut-dev-voice-over-'));
const fps = 30;
const fixturePath = join(outputRoot, 'voice-over-fixture.roughcut');

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { return loadSharedPlaywright(); }
}

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
for (const asset of raw.assets) {
  if (typeof asset.filePath === 'string' && !isAbsolute(asset.filePath)) asset.filePath = join(dirname(sourcePath), asset.filePath);
}
writeFileSync(fixturePath, JSON.stringify(raw));
const disk = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
const voiceAssets = (doc) => doc.assets.filter((asset) => asset.metadata?.insertedMedia?.kind === 'voice');

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

const { _electron: electron } = loadPlaywright();
function launch(devOn) {
  return electron.launch({
    executablePath: join(root, 'apps/desktop/node_modules/.bin/electron'),
    chromiumSandbox: true,
    args: ['--enable-sandbox', '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', `--user-data-dir=${join(outputRoot, devOn ? 'user-data' : 'user-data-off')}`, '.'],
    cwd: join(root, 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
      ROUGH_CUT_DEV_FEATURES: devOn ? '1' : '0',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: fixturePath,
      ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
      ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1080',
    },
  });
}

async function openEditor(page) {
  await page.waitForTimeout(2500);
  const openEditorButton = page.locator('[data-open-editor="pre-record"]');
  if (await openEditorButton.count()) await openEditorButton.click();
  await page.waitForSelector('.clipBar', { timeout: 30000 });
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 30000 });
  await page.waitForTimeout(1500);
}

const seekTo = (page, seconds) => page.evaluate((value) => {
  window.__roughCutSetPreviewTimeSec?.(value);
  const input = document.querySelector('.timelineScrubber');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}, seconds);

const voiceBars = (page) => page.evaluate(() => [...document.querySelectorAll('.voiceOverBar')].map((element) => ({
  id: element.getAttribute('data-inserted-clip-id'),
  timelineIn: Number(element.getAttribute('data-timeline-in')),
  timelineOut: Number(element.getAttribute('data-timeline-out')),
  mode: element.querySelector('.voiceModeChip')?.getAttribute('data-voice-mode') ?? null,
})));

async function devMenuItem(page, label) {
  await page.locator('.devMenuButton').click();
  await page.locator('.devMenuItem', { hasText: label }).first().click();
}

const shot = (page, name) => page.screenshot({ path: join(outputRoot, `${name}.png`) });

let app = await launch(true);
try {
  const page = await app.firstWindow();
  page.on('console', (message) => { if (message.type() === 'error') console.log('[renderer error]', message.text()); });
  await openEditor(page);

  // 1. From the playhead, stopped by hand.
  await seekTo(page, 5);
  await page.waitForTimeout(800);
  await devMenuItem(page, 'Record voice-over');
  await page.waitForSelector('.devVoicePanel', { timeout: 10000 });
  // The fake mic beeps on and off: watch the meter for a moment.
  const level = await page.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 30; i += 1) {
      peak = Math.max(peak, Number(document.querySelector('.devMicMeter')?.getAttribute('aria-valuenow') ?? 0));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return peak;
  });
  await shot(page, '1-voice-panel');
  check('mic meter moves', level > 0, { level });
  await page.locator('[data-voice-record]').click();
  await page.waitForTimeout(3000 + 2600); // countdown, then about 2.5 s of voice
  await page.locator('[data-voice-stop]').click();
  await page.waitForSelector('.voiceOverBar', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const first = (await voiceBars(page))[0];
  check('lands at the playhead on its own lane', Math.abs((first?.timelineIn ?? -99) - 150) <= 3, first);
  check('about as long as what was recorded', first && first.timelineOut - first.timelineIn >= 60 && first.timelineOut - first.timelineIn <= 110, first);
  check('replaces the old voice by default', first?.mode === 'replace', first);
  const saved = disk();
  const asset = voiceAssets(saved)[0];
  const track = saved.timeline.tracks.find((item) => item.id === 'track:voice-over');
  check('saved as sound only on the Voice-over lane', Boolean(asset) && track?.kind === 'audio' && track.clips.length === 1
    && !saved.timeline.tracks.some((item) => item.kind === 'video' && item.clips.some((clip) => clip.mediaId === `source:${asset.id}`)), { asset: asset?.id, track: track?.id });
  if (asset) {
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', asset.filePath], { encoding: 'utf8' });
    check('the take file has sound and no picture', probe.stdout.trim() === 'audio', { streams: probe.stdout.trim(), path: asset.filePath });
  }
  check('Audio lane shows the old voice muted there', (await page.locator('.voiceOverMutedRange').count()) === 1, {});
  await shot(page, '2-voice-over-placed');

  // 2. Over, then undo back to replace.
  await page.locator('.voiceModeChip').first().click();
  await page.waitForTimeout(900);
  check('switches to play over', (await voiceBars(page))[0]?.mode === 'over' && voiceAssets(disk())[0]?.metadata.insertedMedia.voiceMode === 'over', await voiceBars(page));
  check('nothing muted when playing over', (await page.locator('.voiceOverMutedRange').count()) === 0, {});
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  check('undo restores replace', (await voiceBars(page))[0]?.mode === 'replace', await voiceBars(page));

  // 3. Over a marked range: stops by itself.
  await page.keyboard.press('Escape');
  await seekTo(page, 20);
  await page.waitForTimeout(600);
  await devMenuItem(page, 'Mark take start');
  await seekTo(page, 22);
  await page.waitForTimeout(600);
  await devMenuItem(page, 'Mark take end');
  await devMenuItem(page, 'Record voice-over');
  await page.waitForSelector('.devVoicePanel', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.locator('[data-voice-record]').click();
  await page.waitForFunction(() => document.querySelectorAll('.voiceOverBar').length === 2, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const ranged = (await voiceBars(page)).find((bar) => bar.timelineIn >= 590);
  check('range take covers the marked range', ranged && Math.abs(ranged.timelineIn - 600) <= 3 && Math.abs(ranged.timelineOut - 660) <= 4, ranged);
  await shot(page, '3-range-voice-over');

  // 4. Drag later, undo, undo. Zoom in first: on a 13-minute timeline a 2 s clip is a sliver.
  await page.keyboard.press('Escape');
  await seekTo(page, 21);
  await page.waitForTimeout(500);
  for (let i = 0; i < 10; i += 1) {
    const zoomIn = page.locator('[aria-label="Zoom timeline in"]');
    if (!(await zoomIn.count()) || await zoomIn.isDisabled()) break;
    await zoomIn.click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
  const bar = page.locator(`.voiceOverBar[data-inserted-clip-id="${ranged?.id}"] .insertedClipBody`);
  await bar.scrollIntoViewIfNeeded().catch(() => undefined);
  const box = await bar.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
  }
  const dragged = (await voiceBars(page)).find((item) => item.id === ranged?.id);
  check('voice-over can be dragged to the frame', dragged && dragged.timelineIn > ranged.timelineIn, { before: ranged, after: dragged });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const back = (await voiceBars(page)).find((item) => item.id === ranged?.id);
  check('undo puts it back', back?.timelineIn === ranged?.timelineIn, back);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  check('undo again removes the range take', (await voiceBars(page)).length === 1, await voiceBars(page));
} finally {
  await app.close().catch(() => undefined);
}

// 5. Switch off: no Dev menu.
app = await launch(false);
try {
  const page = await app.firstWindow();
  await openEditor(page);
  check('Dev menu absent with the switch off', (await page.locator('.devMenuButton').count()) === 0, {});
} finally {
  await app.close().catch(() => undefined);
}
console.log(`output: ${outputRoot}`);
if (failures.length) { console.error(`FAILED: ${failures.join(', ')}`); process.exit(1); }
