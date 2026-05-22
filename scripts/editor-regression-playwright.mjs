import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-editor-regression-'));
const reportPath = join(root, 'editor-regression-report.json');
const screenshots = {
  recordingLandscapeInitial: join(root, 'recording-landscape-initial.png'),
  recordingLandscapeTrimmed: join(root, 'recording-landscape-trimmed.png'),
  recordingLandscapeCut: join(root, 'recording-landscape-cut.png'),
  recordingAdversarialEdited: join(root, 'recording-adversarial-edited.png'),
  nleLandscapeInitial: join(root, 'nle-landscape-initial.png'),
  nleLandscapeEdited: join(root, 'nle-landscape-edited.png'),
  nleAdversarialEdited: join(root, 'nle-adversarial-edited.png'),
  recordingAfterNleEdit: join(root, 'recording-after-nle-edit.png'),
  nlePortraitInitial: join(root, 'nle-portrait-initial.png'),
};

await mkdir(root, { recursive: true });

const landscape = await createFixture({ name: 'editor-landscape', width: 960, height: 540, durationSec: 6 });
const recordingAdversarial = await createFixture({ name: 'editor-recording-adversarial', width: 960, height: 540, durationSec: 12 });
const nleAdversarial = await createFixture({ name: 'editor-nle-adversarial', width: 960, height: 540, durationSec: 12 });
const portrait = await createFixture({ name: 'editor-portrait', width: 360, height: 640, durationSec: 4 });

let report;
let failure;
try {
  const landscapeReport = await runProjectProbe(landscape.project.path, 'landscape');
  const recordingAdversarialReport = await runAdversarialRecordingProbe(recordingAdversarial.project.path);
  const adversarialReport = await runAdversarialNleProbe(nleAdversarial.project.path);
  const portraitReport = await runPortraitProbe(portrait.project.path);
  report = {
    ok: landscapeReport.ok && recordingAdversarialReport.ok && adversarialReport.ok && portraitReport.ok,
    root,
    reportPath,
    screenshots,
    research: {
      playwrightDrag: 'Use real mouse/pointer actions and at least two moves for drag paths.',
      visualArtifacts: 'Capture deterministic screenshots as artifacts, assert geometry rather than relying only on golden pixels.',
      pointerEvents: 'Hit targets must be large enough and pointer movement must keep working outside the original element.',
    },
    landscape: landscapeReport,
    recordingAdversarial: recordingAdversarialReport,
    adversarial: adversarialReport,
    portrait: portraitReport,
  };
  if (!report.ok) failure = new Error(`Editor regression suite failed: ${JSON.stringify(summarize(report))}`);
} catch (err) {
  report = {
    ok: false,
    root,
    reportPath,
    screenshots,
    error: err instanceof Error ? err.stack ?? err.message : String(err),
  };
  failure = err;
}

async function runAdversarialNleProbe(projectPath) {
  return withApp(projectPath, async (page) => {
    await page.addScriptTag({ content: `window.__editorReadCanvasStats = (${readCanvasStats.toString()});` });
    await openNle(page);
    await waitForPreviewReady(page);

    const initial = await readNleState(page);
    const firstSplit = await splitClipAtIndex(page, 0);
    const trimFirstRight = await dragNleClipHandle(page, 0, 'right', -90);
    const trimSecondLeft = await dragNleClipHandle(page, 1, 'left', 60);
    const trimSecondRight = await dragNleClipHandle(page, 1, 'right', -80);
    const moveSecond = await dragNleClipAtIndex(page, 1, -70);
    const secondSplit = await splitClipAtIndex(page, 1);
    const trimSplitLeft = await dragNleClipHandle(page, 2, 'left', 36);
    const trimSplitRight = await dragNleClipHandle(page, 2, 'right', -42);
    await seekNleClipCenter(page, 2);
    await waitForPreviewReady(page);
    await waitForCanvasContent(page);
    const final = await readNleState(page);
    await capture(page, screenshots.nleAdversarialEdited);

    return {
      ok: initial.canvas.ok
        && firstSplit.created
        && firstSplit.keptSelection
        && trimFirstRight.changed
        && trimSecondLeft.changed
        && trimSecondRight.changed
        && moveSecond.changed
        && secondSplit.created
        && secondSplit.keptSelection
        && trimSplitLeft.changed
        && trimSplitRight.changed
        && final.clipCount >= 3
        && final.canvas.ok,
      initial,
      firstSplit,
      trimFirstRight,
      trimSecondLeft,
      trimSecondRight,
      moveSecond,
      secondSplit,
      trimSplitLeft,
      trimSplitRight,
      final,
    };
  });
}

async function runAdversarialRecordingProbe(projectPath) {
  return withApp(projectPath, async (page) => {
    await page.addScriptTag({ content: `window.__editorReadCanvasStats = (${readCanvasStats.toString()});` });
    await openRecordingEdit(page);
    await waitForPreviewReady(page);

    const initial = await readRecordingState(page);
    const cut = await assertRecordingCut(page);
    await page.waitForFunction(() => document.querySelectorAll('[data-timeline-lane="screen"] .clipBar').length >= 2, null, { timeout: 10000 });
    const outerStart = await dragRecordingClipHandle(page, 0, 'head', 42);
    const firstInner = await dragRecordingClipHandle(page, 0, 'tail', -46);
    const secondInner = await dragRecordingClipHandle(page, 1, 'head', 46);
    const outerEnd = await dragRecordingClipHandle(page, 1, 'tail', -42);
    await seekRecordingClipCenter(page, 1);
    await waitForPreviewReady(page);
    await waitForCanvasContent(page);
    const final = await readRecordingState(page);
    await capture(page, screenshots.recordingAdversarialEdited);

    return {
      ok: initial.canvas.ok
        && cut.created
        && final.clipCount >= 2
        && outerStart.changed
        && firstInner.changed
        && secondInner.changed
        && outerEnd.changed
        && final.canvas.ok,
      initial,
      cut,
      outerStart,
      firstInner,
      secondInner,
      outerEnd,
      final,
    };
  });
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify(summarize(report), null, 2));
if (failure) throw failure;

async function runProjectProbe(projectPath, label) {
  return withApp(projectPath, async (page) => {
    await page.addScriptTag({ content: `window.__editorReadCanvasStats = (${readCanvasStats.toString()});` });
    await openRecordingEdit(page);
    await waitForPreviewReady(page);
    await capture(page, screenshots.recordingLandscapeInitial);
    const recordingInitial = await readRecordingState(page);

    const scrub = await assertRecordingScrub(page);
    const trimEnd = await dragRecordingTrim(page, 'Trim end', 0.72);
    const trimStart = await dragRecordingTrim(page, 'Trim start', 0.10);
    await capture(page, screenshots.recordingLandscapeTrimmed);
    const cut = await assertRecordingCut(page);
    await capture(page, screenshots.recordingLandscapeCut);
    const recordingAfter = await readRecordingState(page);

    await openNle(page);
    await waitForPreviewReady(page);
    await selectFirstNleClipAndSeekCenter(page);
    await capture(page, screenshots.nleLandscapeInitial);
    const nleInitial = await readNleState(page);
    const nleSplit = await assertNleSplitKeepsSelection(page);
    const nleTrim = await dragNleSelectedTrimStart(page, 0.28);
    const nleDrag = await dragSelectedNleClipIntoGap(page, -45);
    await seekSelectedNleClipCenter(page);
    await capture(page, screenshots.nleLandscapeEdited);
    const nleEdited = await readNleState(page);

    await openRecordingEdit(page);
    await seekRecordingClipCenter(page);
    await waitForPreviewReady(page);
    await capture(page, screenshots.recordingAfterNleEdit);
    const recordingAfterNle = await readRecordingState(page);

    return {
      ok: recordingInitial.canvas.ok
        && scrub.changed
        && trimEnd.changed
        && trimStart.changed
        && cut.created
        && nleInitial.canvas.ok
        && nleSplit.created
        && nleSplit.keptSelection
        && nleTrim.changed
        && nleDrag.changed
        && recordingAfterNle.canvas.ok,
      label,
      recordingInitial,
      scrub,
      trimEnd,
      trimStart,
      cut,
      recordingAfter,
      nleInitial,
      nleSplit,
      nleTrim,
      nleDrag,
      nleEdited,
      recordingAfterNle,
    };
  });
}

async function runPortraitProbe(projectPath) {
  return withApp(projectPath, async (page) => {
    await page.addScriptTag({ content: `window.__editorReadCanvasStats = (${readCanvasStats.toString()});` });
    await openNle(page);
    await waitForPreviewReady(page);
    await capture(page, screenshots.nlePortraitInitial);
    const state = await readNleState(page);
    return {
      ok: state.canvas.ok && state.monitor && state.canvasRect && state.canvasRect.height > state.canvasRect.width && state.canvasRect.height >= state.monitor.height * 0.72,
      state,
    };
  });
}

async function withApp(projectPath, callback) {
  const { _electron: electron } = loadPlaywright();
  const app = await electron.launch({
    executablePath: join(process.cwd(), 'apps/desktop/node_modules/.bin/electron'),
    args: ['--no-sandbox', '--force-color-profile=srgb', '.'],
    cwd: join(process.cwd(), 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
      ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1440',
      ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1200',
    },
  });
  const electronProcess = app.process();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    return await callback(page);
  } finally {
    await Promise.race([app.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (!electronProcess.killed) electronProcess.kill();
  }
}

async function createFixture({ name, width, height, durationSec }) {
  const mediaPath = join(root, `${name}.mp4`);
  run('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', buildFilter(width, height, name), '-t', String(durationSec),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mediaPath,
  ]);
  const startedAt = new Date('2026-01-01T00:00:00.000Z');
  const project = await saveProjectForRecording({
    startedAt: startedAt.toISOString(),
    stoppedAt: new Date(startedAt.getTime() + durationSec * 1000).toISOString(),
    rawPath: mediaPath,
    outputPath: mediaPath,
    width,
    height,
    fps: 30,
    cursorEvents: [
      { frame: 15, x: width * 0.24, y: height * 0.32, type: 'move', button: 'none' },
      { frame: 80, x: width * 0.72, y: height * 0.64, type: 'move', button: 'none' },
    ],
  });
  return { mediaPath, project };
}

async function openRecordingEdit(page) {
  await dismissPreRecordOverlay(page);
  await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Recording edit"]').click({ force: true }).catch(() => undefined);
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
  await page.waitForSelector('[data-timeline-lane="screen"] .clipBar', { timeout: 15000 });
}

async function openNle(page) {
  await dismissPreRecordOverlay(page);
  await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Editor"]').click({ force: true });
  await page.waitForSelector('[data-ui-region="nle-workspace"]', { timeout: 15000 });
  await page.waitForSelector('[data-ui-region="nle-timeline"] .nleClipBlock', { timeout: 15000 });
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}

async function waitForPreviewReady(page) {
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    return video instanceof HTMLVideoElement && video.readyState >= 2 && canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(350);
}

async function waitForCanvasContent(page) {
  await page.waitForFunction(() => window.__editorReadCanvasStats?.().ok === true, null, { timeout: 10000 });
}

async function assertRecordingScrub(page) {
  const scrubber = page.locator('input[aria-label="Scrub timeline"]');
  const before = Number(await scrubber.inputValue());
  await scrubber.evaluate((input) => {
    const max = Number(input.max);
    input.value = String(max * 0.42);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(350);
  const after = Number(await scrubber.inputValue());
  return { changed: Math.abs(after - before) > 0.25, before, after };
}

async function seekRecordingClipCenter(page, index = 0) {
  const state = await readRecordingState(page);
  const clip = state.clips[index] ?? state.clip;
  if (!clip) return null;
  const centerRatio = (clip.leftPct + clip.widthPct / 2) / 100;
  const scrubber = page.locator('input[aria-label="Scrub timeline"]');
  await scrubber.evaluate((input, ratio) => {
    const max = Number(input.max);
    input.value = String(max * ratio);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, centerRatio);
  await page.waitForTimeout(350);
  return centerRatio;
}

async function dragRecordingTrim(page, label, targetRatio) {
  const before = await readRecordingState(page);
  const handle = page.locator(`button[aria-label="${label}"]`);
  const handleBox = await requiredBox(handle, label);
  const track = page.locator('[data-timeline-lane="screen"] .laneTrack');
  const trackBox = await requiredBox(track, 'recording screen track');
  await handle.dragTo(track, {
    sourcePosition: { x: handleBox.width / 2, y: handleBox.height / 2 },
    targetPosition: { x: trackBox.width * targetRatio, y: handleBox.y + handleBox.height / 2 - trackBox.y },
  });
  await page.waitForTimeout(500);
  const after = await readRecordingState(page);
  return { changed: geometryChanged(before.clip, after.clip), before: before.clip, after: after.clip };
}

async function dragRecordingClipHandle(page, index, edge, deltaX) {
  const before = await readRecordingState(page);
  const handle = page.locator(`[data-timeline-lane="screen"] .clipBar`).nth(index).locator(`button[data-recording-trim-edge="${edge}"]`);
  const handleBox = await requiredBox(handle, `recording clip ${index} ${edge} handle`);
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX / 2, y, { steps: 8 });
  await page.mouse.move(x + deltaX, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(550);
  const after = await readRecordingState(page);
  return { changed: geometryChanged(before.clips[index], after.clips[index]), before: before.clips[index], after: after.clips[index] };
}

async function assertRecordingCut(page) {
  const before = await readRecordingState(page);
  const tool = page.locator('button[aria-label="Cut tool"]');
  await tool.click();
  const track = await requiredBox(page.locator('[data-timeline-lane="screen"] .laneTrack'), 'recording screen track');
  await page.mouse.move(track.x + track.width * 0.36, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.46, track.y + track.height / 2, { steps: 6 });
  await page.mouse.move(track.x + track.width * 0.56, track.y + track.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const afterCut = await readRecordingState(page);
  const hiddenCutVisible = await page.locator('.hiddenCutRange').count() > 0;
  const created = geometryChanged(before.clip, afterCut.clip) || afterCut.clipCount > before.clipCount;
  return { created, hiddenCutVisible, before: before.clip, afterCut: afterCut.clip, clipCountBefore: before.clipCount, clipCountAfter: afterCut.clipCount };
}

async function assertNleSplitKeepsSelection(page) {
  const clipCountBefore = await page.locator('[data-ui-region="nle-timeline"] .nleClipBlock').count();
  await selectFirstNleClipAndSeekCenter(page);
  const splitButton = page.locator('button[aria-label="Split at playhead"]');
  const enabled = await splitButton.isEnabled();
  if (!enabled) {
    return { created: false, keptSelection: false, enabled: false, clipCountBefore, clipCountAfter: clipCountBefore, state: await readNleState(page) };
  }
  await splitButton.click();
  await page.waitForFunction((before) => document.querySelectorAll('[data-ui-region="nle-timeline"] .nleClipBlock').length > before, clipCountBefore, { timeout: 10000 });
  const clipCountAfter = await page.locator('[data-ui-region="nle-timeline"] .nleClipBlock').count();
  const keptSelection = await page.locator('[data-ui-region="nle-timeline"] .nleClipBlock.selected').count() === 1;
  return { created: clipCountAfter > clipCountBefore, keptSelection, enabled: true, clipCountBefore, clipCountAfter };
}

async function splitClipAtIndex(page, index) {
  const before = await readNleState(page);
  await selectNleClipAtIndexAndSeekCenter(page, index);
  const splitButton = page.locator('button[aria-label="Split at playhead"]');
  const enabled = await splitButton.isEnabled();
  if (!enabled) return { created: false, keptSelection: false, enabled, before, after: before };
  await splitButton.click();
  await page.waitForFunction((count) => document.querySelectorAll('[data-ui-region="nle-timeline"] .nleClipBlock').length > count, before.clipCount, { timeout: 10000 });
  const after = await readNleState(page);
  return { created: after.clipCount > before.clipCount, keptSelection: Boolean(after.selectedClip), enabled, before, after };
}

async function selectFirstNleClipAndSeekCenter(page) {
  return selectNleClipAtIndexAndSeekCenter(page, 0);
}

async function selectNleClipAtIndexAndSeekCenter(page, index) {
  const clip = page.locator('[data-ui-region="nle-lane-bodies"] .nleTrackLaneBody[data-track-kind="video"] .nleClipBlock').nth(index);
  await clip.click({ force: true });
  await page.waitForSelector('button[aria-label="Trim selected clip start"]', { timeout: 5000 });
  const state = await readNleState(page);
  const selected = state.selectedClip ?? state.clips[index];
  const centerRatio = selected ? (selected.leftPct + selected.widthPct / 2) / 100 : 0.5;
  await seekNleRatio(page, centerRatio);
  await clip.click({ force: true });
  await page.waitForSelector('button[aria-label="Trim selected clip start"]', { timeout: 5000 });
  return centerRatio;
}

async function seekNleClipCenter(page, index) {
  const state = await readNleState(page);
  const clip = state.clips[index];
  if (!clip) return null;
  const centerRatio = (clip.leftPct + clip.widthPct / 2) / 100;
  await seekNleRatio(page, centerRatio);
  await page.waitForTimeout(350);
  return centerRatio;
}

async function seekSelectedNleClipCenter(page) {
  const state = await readNleState(page);
  if (!state.selectedClip) return null;
  const centerRatio = (state.selectedClip.leftPct + state.selectedClip.widthPct / 2) / 100;
  await seekNleRatio(page, centerRatio);
  await page.waitForTimeout(350);
  return centerRatio;
}

async function dragNleSelectedTrimStart(page, targetRatio) {
  const before = await readNleState(page);
  const handle = page.locator('button[aria-label="Trim selected clip start"]');
  const handleBox = await requiredBox(handle, 'NLE trim start');
  const bodies = page.locator('[data-ui-region="nle-lane-bodies"]');
  const bodyBox = await requiredBox(bodies, 'NLE lane bodies');
  await handle.dragTo(bodies, {
    sourcePosition: { x: handleBox.width / 2, y: handleBox.height / 2 },
    targetPosition: { x: bodyBox.width * targetRatio, y: handleBox.y + handleBox.height / 2 - bodyBox.y },
  });
  await page.waitForTimeout(500);
  const after = await readNleState(page);
  return { changed: geometryChanged(before.selectedClip, after.selectedClip), before: before.selectedClip, after: after.selectedClip };
}

async function dragNleClipHandle(page, index, edge, deltaX) {
  await selectNleClipAtIndexAndSeekCenter(page, index);
  const before = await readNleState(page);
  const handle = page.locator(`button[aria-label="Trim selected clip ${edge === 'left' ? 'start' : 'end'}"]`);
  const handleBox = await requiredBox(handle, `NLE trim ${edge}`);
  const x = handleBox.x + handleBox.width / 2;
  const y = handleBox.y + handleBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX / 2, y, { steps: 8 });
  await page.mouse.move(x + deltaX, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const after = await readNleState(page);
  return { changed: geometryChanged(before.selectedClip, after.selectedClip), before: before.selectedClip, after: after.selectedClip };
}

async function dragNleClipAtIndex(page, index, deltaX) {
  await selectNleClipAtIndexAndSeekCenter(page, index);
  return dragSelectedNleClipIntoGap(page, deltaX);
}

async function dragSelectedNleClipIntoGap(page, deltaX) {
  const before = await readNleState(page);
  const clip = page.locator('[data-ui-region="nle-timeline"] .nleClipBlock.selected');
  const box = await requiredBox(clip, 'selected NLE clip');
  const trimSafeInset = Math.min(22, Math.max(0, box.width / 3));
  const x = box.x + Math.max(trimSafeInset, Math.min(box.width - trimSafeInset, box.width / 2));
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX / 2, y, { steps: 8 });
  await page.mouse.move(x + deltaX, y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const after = await readNleState(page);
  return { changed: geometryChanged(before.selectedClip, after.selectedClip), before: before.selectedClip, after: after.selectedClip };
}

async function seekNleRatio(page, ratio) {
  const ruler = await requiredBox(page.locator('[data-ui-region="nle-time-ruler"]'), 'NLE ruler');
  await page.mouse.click(ruler.x + ruler.width * ratio, ruler.y + ruler.height / 2);
  await page.waitForTimeout(250);
}

async function readRecordingState(page) {
  return page.evaluate(() => {
    const track = document.querySelector('[data-timeline-lane="screen"] .laneTrack');
    const clip = document.querySelector('[data-timeline-lane="screen"] .clipBar');
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    const clips = Array.from(document.querySelectorAll('[data-timeline-lane="screen"] .clipBar')).map((item) => rectState(item, track)).filter(Boolean);
    return { clip: rectState(clip, track), clips, canvas: window.__editorReadCanvasStats(), canvasRect: rect(canvas), hiddenCuts: document.querySelectorAll('.hiddenCutRange').length, clipCount: document.querySelectorAll('[data-timeline-lane="screen"] .clipBar').length };
    function rectState(element, parent) {
      if (!(element instanceof HTMLElement) || !(parent instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const base = parent.getBoundingClientRect();
      return { leftPct: ((rect.left - base.left) / base.width) * 100, widthPct: (rect.width / base.width) * 100, x: rect.x, width: rect.width };
    }
    function rect(element) {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }
  });
}

async function readNleState(page) {
  return page.evaluate(() => {
    const monitor = document.querySelector('.nleProgramMonitor');
    const body = document.querySelector('[data-ui-region="nle-lane-bodies"] .nleTrackLaneBody[data-track-kind="video"]');
    const firstClip = body?.querySelector('.nleClipBlock');
    const selectedClip = body?.querySelector('.nleClipBlock.selected');
    const canvas = document.querySelector('canvas.styledPreviewCanvas');
    const clips = Array.from(body?.querySelectorAll('.nleClipBlock') ?? []).map((clip) => rectState(clip, body)).filter(Boolean);
    return { clip: rectState(firstClip, body), selectedClip: rectState(selectedClip, body), clips, canvas: window.__editorReadCanvasStats(), canvasRect: rect(canvas), monitor: rect(monitor), clipCount: document.querySelectorAll('[data-ui-region="nle-timeline"] .nleClipBlock').length };
    function rectState(element, parent) {
      if (!(element instanceof HTMLElement) || !(parent instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const base = parent.getBoundingClientRect();
      return { leftPct: ((rect.left - base.left) / base.width) * 100, widthPct: (rect.width / base.width) * 100, x: rect.x, width: rect.width };
    }
    function rect(element) {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }
  });
}

function geometryChanged(before, after) {
  return Boolean(before && after) && (Math.abs(before.leftPct - after.leftPct) > 1.5 || Math.abs(before.widthPct - after.widthPct) > 1.5);
}

function readCanvasStats() {
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) return { ok: false, reason: 'missing-canvas', saturation: 0, contrast: 0, darkRatio: 1 };
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { ok: false, reason: 'missing-context', saturation: 0, contrast: 0, darkRatio: 1 };
  const sampleWidth = Math.min(240, canvas.width);
  const sampleHeight = Math.min(160, canvas.height);
  const data = context.getImageData(Math.floor((canvas.width - sampleWidth) / 2), Math.floor((canvas.height - sampleHeight) / 2), sampleWidth, sampleHeight).data;
  let saturation = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let dark = 0;
  const pixels = data.length / 4;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    saturation += Math.max(red, green, blue) - Math.min(red, green, blue);
    if (luma < 16) dark += 1;
  }
  const stats = { saturation: saturation / pixels, contrast: maxLuma - minLuma, darkRatio: dark / pixels };
  return { ...stats, ok: stats.saturation > 4 && stats.contrast > 10 && stats.darkRatio < 0.98 };
}

async function capture(page, path) {
  await page.screenshot({ path, fullPage: false, timeout: 30000 });
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} bounding box was unavailable.`);
  return box;
}

function buildFilter(width, height, label) {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    `testsrc2=size=${width}x${height}:rate=30`,
    `drawtext=fontfile=${font}:text='${label.toUpperCase()}':fontcolor=white:fontsize=${Math.max(22, Math.round(width / 20))}:x=24:y=28:box=1:boxcolor=0x00000099`,
    `drawbox=x=${Math.round(width * 0.10)}:y=${Math.round(height * 0.74)}:w=${Math.round(width * 0.16)}:h=${Math.round(height * 0.14)}:color=0xff0000:t=fill`,
    `drawbox=x=${Math.round(width * 0.42)}:y=${Math.round(height * 0.74)}:w=${Math.round(width * 0.16)}:h=${Math.round(height * 0.14)}:color=0x00ff00:t=fill`,
    `drawbox=x=${Math.round(width * 0.74)}:y=${Math.round(height * 0.74)}:w=${Math.round(width * 0.16)}:h=${Math.round(height * 0.14)}:color=0x0000ff:t=fill`,
  ].join(',');
}

function summarize(result) {
  return {
    ok: result?.ok ?? false,
    reportPath,
    root,
    screenshots,
    recordingScrub: result?.landscape?.scrub?.changed ?? false,
    recordingTrimEnd: result?.landscape?.trimEnd?.changed ?? false,
    recordingTrimStart: result?.landscape?.trimStart?.changed ?? false,
    recordingCutCreated: result?.landscape?.cut?.created ?? false,
    recordingCutClipCountAfter: result?.landscape?.cut?.clipCountAfter ?? 0,
    recordingAdversarialOk: result?.recordingAdversarial?.ok ?? false,
    recordingAdversarialOuterStart: result?.recordingAdversarial?.outerStart?.changed ?? false,
    recordingAdversarialFirstInner: result?.recordingAdversarial?.firstInner?.changed ?? false,
    recordingAdversarialSecondInner: result?.recordingAdversarial?.secondInner?.changed ?? false,
    recordingAdversarialOuterEnd: result?.recordingAdversarial?.outerEnd?.changed ?? false,
    nleSplitCreated: result?.landscape?.nleSplit?.created ?? false,
    nleSplitKeptSelection: result?.landscape?.nleSplit?.keptSelection ?? false,
    nleTrimChanged: result?.landscape?.nleTrim?.changed ?? false,
    nleDragChanged: result?.landscape?.nleDrag?.changed ?? false,
    adversarialOk: result?.adversarial?.ok ?? false,
    adversarialFirstSplit: result?.adversarial?.firstSplit?.created ?? false,
    adversarialMove: result?.adversarial?.moveSecond?.changed ?? false,
    adversarialSecondSplit: result?.adversarial?.secondSplit?.created ?? false,
    portraitVisible: result?.portrait?.ok ?? false,
    portraitCanvas: result?.portrait?.state?.canvasRect ?? null,
    portraitMonitor: result?.portrait?.state?.monitor ?? null,
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
