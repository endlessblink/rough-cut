// Real-app gate for the dev-only "add clip" and "camera take" tools
// (docs/SPEC-dev-insert-and-camera-takes-2026-10-20.md).
//
// Runs the built app against a temporary copy of a real project (never the original,
// media referenced by absolute path, nothing written next to the real project), with
// the dev switch on, Chromium's fake camera/mic, and all sound muted. It:
//  1. adds an outside clip at the playhead with Insert: it lands at the playhead and
//     every later section moves later by its length; undo and redo work
//  2. adds one with Overwrite: nothing moves, the timeline keeps its length
//  3. plays across the added clip: the playhead keeps moving and its decoder follows
//  4. marks a range and records two camera takes: each lands exactly on the range,
//     both are kept, the newest is used, and the list can switch back to the first
//  5. confirms the Dev menu is absent when the switch is off
// Screenshots of the editor go to the output folder for a visual review.
// Usage: node scripts/e2e-dev-insert-takes-playwright.mjs <project.roughcut>
// Needs a built renderer (pnpm --filter @rough-cut/desktop build). Use xvfb-run.
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const sourcePath = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_PROJECT_PATH || '');
if (!process.argv[2] && !process.env.ROUGH_CUT_REAL_PROJECT_PATH) {
  throw new Error('Usage: node scripts/e2e-dev-insert-takes-playwright.mjs <project.roughcut>');
}
const outputRoot = process.env.ROUGH_CUT_E2E_OUTPUT || mkdtempSync(join(tmpdir(), 'rough-cut-dev-insert-takes-'));
const fps = 30;
const FFMPEG = process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe';

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { return loadSharedPlaywright(); }
}

function writeFixture(path) {
  const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const document = raw.project ?? raw;
  for (const asset of document.assets) {
    if (typeof asset.filePath === 'string' && !isAbsolute(asset.filePath)) asset.filePath = join(dirname(sourcePath), asset.filePath);
  }
  writeFileSync(path, JSON.stringify(raw));
}

// A 4:3 test pattern with a tone: a different shape from the recording, so the
// project background must show on its sides.
const clipPath = join(outputRoot, 'outside-clip.mp4');
const fixture = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=960x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000',
  '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-threads', '2', clipPath], { encoding: 'utf8' });
if (fixture.status !== 0) throw new Error(`fixture failed: ${fixture.stderr}`);
const clipFrames = 90;

const fixturePath = join(outputRoot, 'dev-insert-fixture.roughcut');
writeFixture(fixturePath);

const { _electron: electron } = loadPlaywright();
const failures = [];
const report = { fixturePath, checks: {} };
function check(name, ok, detail) {
  report.checks[name] = { ok, detail };
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

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

const timelineState = (page) => page.evaluate(() => ({
  sections: [...document.querySelectorAll('.clipBar')].map((element) => [Number(element.getAttribute('data-recording-timeline-in')), Number(element.getAttribute('data-recording-timeline-out'))]),
  inserted: [...document.querySelectorAll('.insertedClipBar')].map((element) => ({
    lane: element.getAttribute('data-inserted-lane'),
    id: element.getAttribute('data-inserted-clip-id'),
    timelineIn: Number(element.getAttribute('data-timeline-in')),
    timelineOut: Number(element.getAttribute('data-timeline-out')),
  })),
}));

async function devMenuItem(page, label) {
  await page.locator('.devMenuButton').click();
  await page.locator('.devMenuItem', { hasText: label }).first().click();
}

async function shot(page, name) {
  await page.screenshot({ path: join(outputRoot, `${name}.png`) });
}

let app = await launch(true);
let firstPage = null;
try {
  const page = await app.firstWindow();
  firstPage = page;
  page.on('console', (message) => { if (message.type() === 'error') console.log('[renderer error]', message.text()); });
  await openEditor(page);
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, clipPath);

  // 1. Insert at 10 s.
  await seekTo(page, 10);
  await page.waitForTimeout(800);
  const before = await timelineState(page);
  await devMenuItem(page, 'Add clip at playhead');
  await page.waitForTimeout(1500);
  await shot(page, '0-after-pick');
  console.log('after pick:', JSON.stringify(await page.evaluate(() => ({ layer: document.querySelector('.devMenuLayer')?.innerText ?? null, notice: document.querySelector('.devMenuNotice')?.textContent ?? null, playhead: document.querySelector('.timelineScrubber')?.value, open: document.querySelector('.devMenuButton')?.getAttribute('aria-expanded') }))));
  await page.locator('.devChoiceButton', { hasText: 'Insert' }).click();
  await page.waitForSelector('.insertedClipBar[data-inserted-lane="screen"]', { timeout: 20000 });
  await page.waitForTimeout(800);
  const inserted = await timelineState(page);
  const clip = inserted.inserted.find((item) => item.lane === 'screen');
  check('insert-lands-at-playhead', clip?.timelineIn === 300 && clip?.timelineOut === 300 + clipFrames, clip);
  const shiftedOk = before.sections.every(([timelineIn, timelineOut]) => {
    if (timelineOut <= 300) return inserted.sections.some(([a, b]) => a === timelineIn && b === timelineOut);
    if (timelineIn >= 300) return inserted.sections.some(([a, b]) => a === timelineIn + clipFrames && b === timelineOut + clipFrames);
    return inserted.sections.some(([a, b]) => a === timelineIn && b === 300) && inserted.sections.some(([a, b]) => a === 300 + clipFrames && b === timelineOut + clipFrames);
  });
  check('insert-ripples-later-sections', shiftedOk, { before: before.sections, after: inserted.sections });
  await seekTo(page, 11);
  await page.waitForTimeout(1500);
  await shot(page, '1-added-clip');
  const insertedDraw = await page.evaluate(() => window.__roughCutInsertedMediaDebug ?? null);
  check('preview-draws-added-clip', insertedDraw?.lane === 'screen' && Math.abs(insertedDraw.videoTime - insertedDraw.expectedTime) < 0.1, insertedDraw);

  // Undo / redo.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1000);
  const undone = await timelineState(page);
  check('undo-removes-insert', undone.inserted.length === 0 && JSON.stringify(undone.sections) === JSON.stringify(before.sections), undone);
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(1000);
  const redone = await timelineState(page);
  check('redo-restores-insert', redone.inserted.some((item) => item.lane === 'screen' && item.timelineIn === 300), redone.inserted);

  // 3. Play across the added clip.
  await seekTo(page, 9.3);
  await page.waitForTimeout(1200);
  await page.locator('.videoControls .transportButton').click();
  await page.waitForTimeout(1700);
  const midPlay = await page.evaluate(() => window.__roughCutInsertedMediaDebug ?? null);
  await shot(page, '3-playing-added-clip');
  await page.waitForTimeout(1000);
  await page.locator('.videoControls .transportButton').click();
  const playhead = await page.evaluate(() => Number(document.querySelector('.timelineScrubber')?.value ?? 0));
  check('playback-runs-through-added-clip', playhead > 11.5 && midPlay?.lane === 'screen' && Math.abs(midPlay.videoTime - midPlay.expectedTime) < 0.25, { playhead, midPlay });

  // 2. Overwrite at 30 s: nothing moves, same length.
  await seekTo(page, 30);
  await page.waitForTimeout(800);
  const beforeOverwrite = await timelineState(page);
  const lengthBefore = Math.max(...beforeOverwrite.sections.map(([, b]) => b), ...beforeOverwrite.inserted.map((item) => item.timelineOut));
  await devMenuItem(page, 'Add clip at playhead');
  await page.locator('.devChoiceButton', { hasText: 'Overwrite' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.insertedClipBar[data-inserted-lane="screen"]').length === 2, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const overwritten = await timelineState(page);
  const lengthAfter = Math.max(...overwritten.sections.map(([, b]) => b), ...overwritten.inserted.map((item) => item.timelineOut));
  const second = overwritten.inserted.find((item) => item.lane === 'screen' && item.timelineIn === 900);
  check('overwrite-keeps-length-and-position', Boolean(second) && lengthAfter === lengthBefore, { second, lengthBefore, lengthAfter });

  // 4. Camera takes over 5 s - 8 s.
  await seekTo(page, 5);
  await page.waitForTimeout(600);
  await devMenuItem(page, 'Mark take start');
  await seekTo(page, 8);
  await page.waitForTimeout(600);
  await devMenuItem(page, 'Mark take end');
  for (let takeNumber = 1; takeNumber <= 2; takeNumber += 1) {
    await devMenuItem(page, 'Record camera take');
    await page.waitForFunction(() => {
      const video = document.querySelector('.devTakeLive');
      return video && video.readyState >= 2 && video.videoWidth > 0;
    }, null, { timeout: 15000 });
    if (takeNumber === 1) await shot(page, '4-take-panel');
    await page.locator('.devPrimaryButton', { hasText: 'Record' }).click();
    await page.waitForTimeout(1500);
    if (takeNumber === 1) await shot(page, '4-take-countdown');
    await page.waitForFunction((count) => document.querySelectorAll('.insertedClipBar[data-inserted-lane="camera"]').length >= 1
      && !document.querySelector('.devRecDot') && !document.querySelector('.devTakePanel .devPanelNote[role="status"]')
      && (window.__takeCount = count), takeNumber, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const error = await page.locator('.devPanelError').count();
    if (error) check(`take-${takeNumber}-no-error`, false, await page.locator('.devPanelError').innerText());
    await page.locator('.devTextButton', { hasText: 'Close' }).click().catch(() => undefined);
  }
  const withTakes = await timelineState(page);
  const take = withTakes.inserted.find((item) => item.lane === 'camera');
  check('take-lands-on-marked-range', take?.timelineIn === 150 && Math.abs((take?.timelineOut ?? 0) - 240) <= 2, take);
  check('one-take-on-the-timeline-at-a-time', withTakes.inserted.filter((item) => item.lane === 'camera').length === 1, withTakes.inserted);
  await seekTo(page, 6.5);
  await page.waitForTimeout(1500);
  await shot(page, '5-take-in-bubble');
  const takeDraw = await page.evaluate(() => window.__roughCutInsertedMediaDebug ?? null);
  check('preview-draws-take-in-bubble', takeDraw?.lane === 'camera', takeDraw);

  // Takes list: both kept, newest active, switch to the first. A 3 s take is a few
  // pixels on a 13-minute timeline, so zoom in around the playhead first, as a person would.
  for (let step = 0; step < 8; step += 1) {
    const zoomIn = page.locator('button[aria-label="Zoom timeline in"]');
    if (await zoomIn.isDisabled()) break;
    await zoomIn.click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  await page.locator(`.insertedClipBar[data-inserted-clip-id="${take.id}"] .insertedClipBody`).click();
  await page.waitForTimeout(400);
  await page.locator('.devMenuButton').click();
  const takeItems = await page.locator('.devMenuItem[role="menuitemradio"]').evaluateAll((elements) => elements.map((element) => [element.textContent, element.getAttribute('aria-checked')]));
  check('both-takes-kept-newest-active', takeItems.length === 2 && takeItems[0][1] === 'true' && /Take 2/.test(takeItems[0][0]), takeItems);
  await page.locator('.devMenuItem[role="menuitemradio"]', { hasText: 'Take 1' }).click();
  await page.waitForTimeout(1000);
  const switched = await page.evaluate(() => [...document.querySelectorAll('.insertedClipBar[data-inserted-lane="camera"] .insertedClipName')].map((element) => element.textContent));
  check('switch-to-take-1', JSON.stringify(switched) === '["Take 1"]', switched);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  const unswitched = await page.evaluate(() => [...document.querySelectorAll('.insertedClipBar[data-inserted-lane="camera"] .insertedClipName')].map((element) => element.textContent));
  check('undo-take-switch', JSON.stringify(unswitched) === '["Take 2"]', unswitched);
  await seekTo(page, 10.5);
  await page.waitForTimeout(1500);
  await shot(page, '6-editor-with-clip-and-take');
} catch (error) {
  if (firstPage) {
    await firstPage.screenshot({ path: join(outputRoot, 'failure.png') }).catch(() => undefined);
    const notice = await firstPage.locator('.devMenuNotice, .devPanelError').allInnerTexts().catch(() => []);
    console.error('notice on failure:', notice);
  }
  throw error;
} finally {
  await app.close().catch(() => undefined);
}

// 5. Switch off: no Dev menu.
app = await launch(false);
try {
  const page = await app.firstWindow();
  await openEditor(page);
  check('dev-menu-absent-when-switch-off', (await page.locator('.devMenuButton').count()) === 0, null);
} finally {
  await app.close().catch(() => undefined);
}

writeFileSync(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));
if (failures.length > 0) {
  console.error(`FAILED: ${failures.join(', ')}\noutput: ${outputRoot}`);
  process.exit(1);
}
console.log(`PASS dev insert + camera takes (${outputRoot})`);
