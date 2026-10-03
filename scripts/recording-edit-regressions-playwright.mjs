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
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
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
    return loadSharedPlaywright();
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
    // Start trims close the gap: clip 2 keeps its position and gets shorter,
    // clip 1 is untouched, and nothing is left between sections.
    check('trim-clip-2-changes-only-clip-2', after[0][2] === before[0][2] && after[0][1] === before[0][1]
      && after[1][1] === before[1][1] && after[1][2] < before[1][2] && after[2][1] === after[1][2], { before, after });
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

  // 2026-09-27: delete used source frames and left a sliver of a shifted
  // section; after undo, delete again did nothing; trimming a section's end
  // left a black gap under the playhead.
  const ranges = async () => (await selection(page)).clips.map(([, timelineIn, timelineOut]) => [timelineIn, timelineOut]);
  const contiguous = (list) => list.every(([timelineIn], index) => index === 0 || timelineIn === list[index - 1][1]);
  const previewLuma = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    const data = canvas.getContext('2d').getImageData(canvas.width * 0.25, canvas.height * 0.25, canvas.width * 0.5, canvas.height * 0.5).data;
    let sum = 0;
    for (let index = 0; index < data.length; index += 16) sum += data[index] + data[index + 1] + data[index + 2];
    return sum / (data.length / 16) / 3;
  });
  const deleteSection = async (index) => {
    await page.locator('.clipBar .clipBody').nth(index).click();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(900);
  };
  const beforeDelete = await ranges();
  await deleteSection(1);
  const afterDelete = await ranges();
  const removed = beforeDelete[1][1] - beforeDelete[1][0];
  check('delete-removes-the-whole-section', afterDelete.length === beforeDelete.length - 1 && contiguous(afterDelete)
    && afterDelete[afterDelete.length - 1][1] === beforeDelete[beforeDelete.length - 1][1] - removed, { beforeDelete, afterDelete });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const afterUndo = await ranges();
  check('undo-restores-the-deleted-section', JSON.stringify(afterUndo) === JSON.stringify(beforeDelete), { beforeDelete, afterUndo });
  // Straight after undo, without clicking again: the section is still
  // highlighted, so Delete must act on it.
  await page.keyboard.press('Delete');
  await page.waitForTimeout(900);
  const afterSecondDelete = await ranges();
  check('delete-works-again-after-undo', JSON.stringify(afterSecondDelete) === JSON.stringify(afterDelete), { afterDelete, afterSecondDelete });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);

  await page.locator('.clipBar .clipBody').nth(1).click();
  await page.waitForTimeout(300);
  const tailHandle = page.locator('.trimHandleEnd').first();
  const tailBox = await tailHandle.boundingBox();
  if (!tailBox) {
    check('end-trim-closes-the-gap-and-keeps-picture', false, 'no end trim handle on the selected section');
  } else {
    const beforeTail = await ranges();
    await page.mouse.move(tailBox.x + tailBox.width / 2, tailBox.y + tailBox.height / 2);
    await page.mouse.down();
    for (let dx = 5; dx <= 30; dx += 5) {
      await page.mouse.move(tailBox.x + tailBox.width / 2 - dx, tailBox.y + tailBox.height / 2);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const afterTail = await ranges();
    const luma = await previewLuma();
    check('end-trim-closes-the-gap-and-keeps-picture', afterTail[1][1] < beforeTail[1][1] && contiguous(afterTail) && luma > 4, { beforeTail, afterTail, previewLuma: Math.round(luma) });
  }

  // Ripple off: an end trim leaves an empty space; selecting it and pressing
  // Delete closes it so the sections sit next to each other again.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const rippleButton = page.locator('button[aria-label="Close gaps when trimming"]');
  if ((await rippleButton.getAttribute('aria-pressed')) === 'true') await rippleButton.click();
  await page.locator('.clipBar .clipBody').nth(1).click();
  await page.waitForTimeout(300);
  const gapHandle = await page.locator('.trimHandleEnd').first().boundingBox();
  if (!gapHandle) {
    check('ripple-off-leaves-a-gap-that-delete-closes', false, 'no end trim handle');
  } else {
    await page.mouse.move(gapHandle.x + gapHandle.width / 2, gapHandle.y + gapHandle.height / 2);
    await page.mouse.down();
    for (let dx = 5; dx <= 30; dx += 5) {
      await page.mouse.move(gapHandle.x + gapHandle.width / 2 - dx, gapHandle.y + gapHandle.height / 2);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const withGap = await ranges();
    const gapCount = await page.locator('[data-timeline-lane="screen"] .timelineGap').count();
    if (gapCount > 0) {
      await page.locator('.timelineGap').first().click({ force: true });
      await page.keyboard.press('Delete');
      await page.waitForTimeout(1200);
    }
    const closedGap = await ranges();
    check('ripple-off-leaves-a-gap-that-delete-closes', !contiguous(withGap) && gapCount === 1 && contiguous(closedGap) && (await page.locator('.timelineGap').count()) === 0, { withGap, gapCount, closedGap });
  }
  await rippleButton.click();

  // One-frame keyboard nudges are exact where pixel drags are not.
  const nudgeHandle = async (clipIndex, selector, key, times) => {
    for (let step = 0; step < times; step += 1) {
      await page.locator('.clipBar .clipBody').nth(clipIndex).click();
      await page.waitForTimeout(150);
      await page.locator(selector).first().focus();
      await page.keyboard.press(key);
      await page.waitForTimeout(500);
    }
  };
  const dragHandle = async (selector, dx) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) return false;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 5; step <= Math.abs(dx); step += 5) {
      await page.mouse.move(box.x + box.width / 2 + Math.sign(dx) * step, box.y + box.height / 2);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(1200);
    return true;
  };

  // 2026-09-27: dragging an end outward into empty space pushed the next
  // section along instead of filling the space.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(900);
  const withSpace = await ranges();
  if (contiguous(withSpace)) {
    check('lengthening-into-empty-space-leaves-next-section', false, { reason: 'fixture has no empty space to fill', withSpace });
  } else {
    await nudgeHandle(1, '.trimHandleEnd', 'ArrowRight', 5);
    const filled = await ranges();
    check('lengthening-into-empty-space-leaves-next-section', filled[1][1] > withSpace[1][1] && filled[2][0] === withSpace[2][0] && filled[2][1] === withSpace[2][1], { withSpace, filled });
  }

  // 2026-09-27: a start edge could not be dragged left past the previous
  // section, so hidden footage at a section's start could not come back, and
  // nothing showed that footage was hidden there.
  await page.locator('.clipBar .clipBody').nth(2).click();
  await page.waitForTimeout(300);
  const hiddenHint = await page.locator('.trimHandleStart.hasHiddenFootage').count();
  const beforeReveal = await ranges();
  // Room before the section is filled first; past that the section keeps its
  // start and grows, pushing nothing into the previous section.
  const room = beforeReveal[2][0] - beforeReveal[1][1];
  await nudgeHandle(2, '.trimHandleStart', 'ArrowLeft', room + 3);
  const revealed = await ranges();
  const grewBy = (revealed[2][1] - revealed[2][0]) - (beforeReveal[2][1] - beforeReveal[2][0]);
  check('start-edge-shows-and-reveals-hidden-footage', hiddenHint === 1 && grewBy === room + 3 && revealed[2][0] === beforeReveal[1][1] && JSON.stringify(revealed[1]) === JSON.stringify(beforeReveal[1]), { hiddenHint, room, beforeReveal, revealed });

  // 2026-09-27: zoom lane clicks were scaled by the recording's full length,
  // so zooms landed away from the click (or in trimmed-away footage), and a
  // zoom near the end stretched the timeline and squeezed everything left.
  const zoomRegions = () => page.evaluate(() => [...document.querySelectorAll('[data-timeline-lane="zoom"] .timelineRegion')]
    .map((element) => Number((element.getAttribute('style') ?? '').match(/left:\s*(?:calc\()?([\d.]+)%/)?.[1])));
  const zoomLane = await page.locator('[data-timeline-lane="zoom"] .laneTrack').boundingBox();
  const clipsBeforeZoom = await ranges();
  const zoomLandings = [];
  for (const fraction of [0.3, 0.92]) {
    const before = await zoomRegions();
    await page.keyboard.press('Escape');
    await page.mouse.click(zoomLane.x + zoomLane.width * fraction, zoomLane.y + zoomLane.height / 2);
    await page.waitForTimeout(1200);
    const after = await zoomRegions();
    const added = after.filter((left) => !before.some((existing) => Math.abs(existing - left) < 0.05));
    zoomLandings.push({ clickedAt: fraction * 100, landedAt: added[0] ?? null, existingMoved: before.some((left) => !after.some((next) => Math.abs(next - left) < 0.05)) });
  }
  const clipsAfterZoom = await ranges();
  check('zoom-lands-where-clicked-and-moves-nothing', zoomLandings.every((landing) => landing.landedAt !== null && Math.abs(landing.landedAt - landing.clickedAt) < 1 && !landing.existingMoved)
    && JSON.stringify(clipsAfterZoom) === JSON.stringify(clipsBeforeZoom), { zoomLandings, clipsBeforeZoom, clipsAfterZoom });

  // 2026-09-27: zoom drags ran in recording frames, so a zoom dragged across a
  // cut leapt by the cut's length, shrank under it, and landed off the pointer.
  const zoomBoxes = () => page.evaluate(() => [...document.querySelectorAll('[data-timeline-lane="zoom"] .timelineRegion')].map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  }));
  const zoomBefore = (await zoomBoxes()).sort((a, b) => a.left - b.left)[0];
  const zoomDragPx = zoomLane.width * 0.2;
  const zoomTrail = [];
  if (zoomBefore) {
    const grabX = zoomBefore.left + zoomBefore.width / 2;
    const grabY = (await page.locator('[data-timeline-lane="zoom"] .timelineRegion').first().boundingBox()).y + 6;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    for (let step = 8; step <= zoomDragPx; step += 8) {
      await page.mouse.move(grabX + step, grabY);
      await page.waitForTimeout(20);
      const now = (await zoomBoxes()).sort((a, b) => Math.abs(a.left - zoomBefore.left - step) - Math.abs(b.left - zoomBefore.left - step))[0];
      zoomTrail.push({ pointer: step, moved: Math.round(now.left - zoomBefore.left), width: Math.round(now.width) });
    }
    await page.mouse.move(grabX + zoomDragPx, grabY);
    await page.mouse.up();
    await page.waitForTimeout(1200);
  }
  const zoomAfter = (await zoomBoxes()).sort((a, b) => Math.abs(a.left - zoomBefore.left - zoomDragPx) - Math.abs(b.left - zoomBefore.left - zoomDragPx))[0];
  const followsPointer = zoomTrail.every((sample) => Math.abs(sample.moved - sample.pointer) <= 3 && Math.abs(sample.width - zoomBefore.width) <= 3);
  check('zoom-drag-follows-pointer-across-cuts', Boolean(zoomBefore) && zoomTrail.length > 0 && followsPointer
    && Math.abs(zoomAfter.left - zoomBefore.left - zoomDragPx) <= 3 && Math.abs(zoomAfter.width - zoomBefore.width) <= 3,
  { zoomBefore, zoomAfter, zoomDragPx, zoomTrail: zoomTrail.filter((sample) => Math.abs(sample.moved - sample.pointer) > 3 || Math.abs(sample.width - zoomBefore.width) > 3).slice(0, 8) });

  // 2026-09-27: the × sat over most of a zoom's end grab zone, so the right
  // edge was hard to catch. Stretch a zoom by its right edge with a real drag,
  // then the ~9px inside the border on both ends must be the edge, with the × still shown.
  const widest = () => page.evaluate(() => {
    // The leftmost zoom: it has room to grow before the end of the timeline.
    const region = [...document.querySelectorAll('[data-timeline-lane="zoom"] .timelineRegion')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
    if (!region) return null;
    const rect = region.getBoundingClientRect();
    return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
  });
  const toStretch = await widest();
  if (toStretch) {
    await page.mouse.move(toStretch.right - 3, toStretch.y);
    await page.mouse.down();
    for (let step = 10; step <= 150; step += 10) await page.mouse.move(toStretch.right - 3 + step, toStretch.y);
    await page.mouse.up();
    await page.waitForTimeout(1200);
  }
  const stretched = await widest();
  const edgeHits = await page.evaluate((box) => {
    if (!box) return null;
    const hit = (x) => document.elementFromPoint(x, box.y)?.className ?? null;
    const region = document.elementFromPoint((box.left + box.right) / 2, box.y)?.closest('.timelineRegion');
    const deleteButton = region?.querySelector('.zoomRegionDelete');
    return {
      end: [2, 5, 8].map((inset) => hit(box.right - inset)),
      start: [2, 5, 8].map((inset) => hit(box.left + inset)),
      deleteShown: Boolean(deleteButton && getComputedStyle(deleteButton).display !== 'none'),
    };
  }, stretched);
  check('zoom-edges-are-catchable-beside-the-delete-button', Boolean(toStretch && stretched && edgeHits)
    && stretched.right - toStretch.right > 140
    && edgeHits.deleteShown
    && [...edgeHits.end, ...edgeHits.start].every((name) => String(name).includes('zoomResizeHandle')), { toStretch, stretched, edgeHits });
  const endHandle = await page.locator('[data-timeline-lane="zoom"] .zoomResizeEnd').last().boundingBox();
  if (endHandle) await page.mouse.move(endHandle.x + endHandle.width / 2, endHandle.y + endHandle.height / 2);
  await page.waitForTimeout(300);

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
