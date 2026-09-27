// Real-app regression gate for Recording edit problems hit on 2026-09-26.
// Runs against a temporary copy of a real project (never the original):
//  1. Clicking clip 2 selects exactly clip 2 and its linked audio, even when
//     the saved project holds duplicate clip ids from an older session.
//  2. Trimming clip 2 changes clip 2 only.
//  3. Hidden side panels stay hidden when the timeline is clicked.
//  4. Playback across cuts that remove source hands over to the pre-rolled
//     standby decoder instead of seeking (no ~150-350 ms freeze).
// Usage: node scripts/recording-edit-regressions-playwright.mjs <project.roughcut>
// Needs a built renderer (pnpm --filter @rough-cut/desktop build). Wrap in
// `xvfb-run -a` on a busy desktop: throttled windows produce fake stalls.
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const sourcePath = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_PROJECT_PATH || '');
if (!process.argv[2] && !process.env.ROUGH_CUT_REAL_PROJECT_PATH) {
  throw new Error('Usage: node scripts/recording-edit-regressions-playwright.mjs <project.roughcut>');
}
const outputRoot = process.env.ROUGH_CUT_REGRESSION_OUTPUT || mkdtempSync(join(tmpdir(), 'rough-cut-recording-edit-regressions-'));
const fps = 30;

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {
    return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
  }
}

function readProject(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return { raw, document: raw.project ?? raw };
}

// A copy with absolute media paths, two cuts that remove source, and the
// cross-session duplicate clip id that used to make one click select two clips.
function writeFixture(path) {
  const { raw, document } = readProject(sourcePath);
  const projectDir = dirname(sourcePath);
  for (const asset of document.assets) {
    if (typeof asset.filePath === 'string' && !isAbsolute(asset.filePath)) asset.filePath = join(projectDir, asset.filePath);
  }
  const segments = [[0, 150, 0], [150, 210, 240], [210, 600, 390]];
  for (const track of document.timeline.tracks) {
    const base = track.clips[0];
    if (!base) continue;
    track.clips = segments.map(([timelineIn, timelineOut, sourceOffset], index) => ({
      ...base,
      // Clips 1 and 2 deliberately share an id, as projects saved before the fix do.
      id: index === 2 ? `${base.id}:c` : `${base.id}:a`,
      timelineIn,
      timelineOut,
      sourceIn: base.sourceIn + sourceOffset,
      sourceOut: base.sourceIn + sourceOffset + (timelineOut - timelineIn),
    }));
  }
  if (document.composition) document.composition.duration = 600;
  delete document.freecutTimeline;
  document.timeline.markers = [];
  writeFileSync(path, JSON.stringify(raw));
}

const fixturePath = join(outputRoot, 'regression-fixture.roughcut');
writeFixture(fixturePath);

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: join(root, 'apps/desktop/node_modules/.bin/electron'),
  args: ['--no-sandbox', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', `--user-data-dir=${join(outputRoot, 'user-data')}`, '.'],
  cwd: join(root, 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: fixturePath,
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1080',
  },
});

const failures = [];
const report = { fixturePath, checks: {} };
function check(name, ok, detail) {
  report.checks[name] = { ok, detail };
  if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
}

const selection = (page) => page.evaluate(() => ({
  screen: [...document.querySelectorAll('.clipBar')].map((element, index) => (element.classList.contains('selectedClip') ? index + 1 : null)).filter(Boolean),
  audio: [...document.querySelectorAll('.audioRegion')].map((element, index) => (element.classList.contains('linkedAudioRegion') ? index + 1 : null)).filter(Boolean),
  clips: [...document.querySelectorAll('.clipBar')].map((element) => [element.getAttribute('data-recording-clip-id'), Number(element.getAttribute('data-recording-timeline-in')), Number(element.getAttribute('data-recording-timeline-out'))]),
}));
const panels = (page) => page.evaluate(() => {
  const workspace = document.querySelector('[data-ui-region="editor-workspace"]');
  return { left: workspace.classList.contains('setupClosed') ? 'hidden' : 'open', right: workspace.dataset.inspectorState };
});
const seekTo = (page, seconds) => page.evaluate((value) => {
  const input = document.querySelector('.timelineScrubber');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}, seconds);

try {
  const page = await app.firstWindow();
  await page.waitForTimeout(2500);
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count()) await openEditor.click();
  await page.waitForSelector('.clipBar', { timeout: 20000 });
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 20000 });
  await page.waitForTimeout(1200);

  const loaded = await selection(page);
  const loadedIds = loaded.clips.map(([id]) => id);
  check('duplicate-clip-ids-repaired-on-open', new Set(loadedIds).size === loadedIds.length, loadedIds);

  for (const [lane, selector] of [['screen', '.clipBar .clipBody'], ['audio', '.audioRegion']]) {
    await page.keyboard.press('Escape');
    await page.locator(selector).nth(1).click({ force: true });
    await page.waitForTimeout(300);
    const state = await selection(page);
    check(`click-${lane}-clip-2-selects-only-clip-2`, JSON.stringify(state.screen) === '[2]' && JSON.stringify(state.audio) === '[2]', state);
  }

  await page.locator('.clipBar .clipBody').nth(1).click();
  await page.waitForTimeout(300);
  const before = (await selection(page)).clips;
  const handle = page.locator('.trimHandleStart').first();
  const box = await handle.boundingBox();
  if (!box) {
    check('trim-clip-2-changes-only-clip-2', false, 'no trim handle on the selected clip');
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let dx = 5; dx <= 30; dx += 5) {
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(1000);
    const after = (await selection(page)).clips;
    check('trim-clip-2-changes-only-clip-2', after[0][2] === before[0][2] && after[0][1] === before[0][1] && after[1][1] > before[1][1], { before, after });
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(800);
  }

  if ((await panels(page)).left === 'open') await page.locator('button.toolPanelToggle').click();
  if ((await panels(page)).right === 'expanded') await page.locator('button[aria-label="Hide export panel"]').click();
  await page.waitForTimeout(300);
  await page.locator('.clipBar .clipBody').nth(0).click();
  await page.locator('.audioRegion').nth(2).click({ force: true });
  await page.waitForTimeout(300);
  const panelState = await panels(page);
  check('hidden-panels-stay-hidden-on-timeline-click', panelState.left === 'hidden' && panelState.right === 'collapsed', panelState);

  await seekTo(page, 3.5);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__roughCutPlaybackDebugLog = [];
    window.__roughCutPlaybackDebugCounts = {};
  });
  await page.locator('.videoControls .transportButton').click();
  await page.waitForTimeout(4500);
  await page.locator('.videoControls .transportButton').click();
  const log = await page.evaluate(() => window.__roughCutPlaybackDebugLog ?? []);
  const swaps = log.filter((entry) => entry.event === 'timeline-cut-preroll-swap');
  const seeks = log.filter((entry) => entry.event === 'timeline-boundary-seek');
  const worstGapAtCut = Math.max(0, ...swaps.flatMap((swap) => log
    .filter((entry) => entry.event === 'render-frame-gap' && entry.atMs >= swap.atMs - 100 && entry.atMs <= swap.atMs + 250)
    .map((entry) => entry.deltaMs)));
  check('cuts-cross-by-standby-handover', swaps.length === 2 && seeks.length === 0, { swaps: swaps.length, seeks: seeks.length });
  check('cut-handover-holds-at-most-a-few-frames', worstGapAtCut <= 100, { worstGapAtCutMs: worstGapAtCut });

  await page.screenshot({ path: join(outputRoot, 'recording-edit-regressions.png') });
} finally {
  await app.close().catch(() => {});
}

writeFileSync(join(outputRoot, 'recording-edit-regressions-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: failures.length === 0, outputRoot, checks: Object.fromEntries(Object.entries(report.checks).map(([name, value]) => [name, value.ok])) }, null, 2));
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
