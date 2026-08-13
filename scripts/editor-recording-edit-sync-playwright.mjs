/**
 * Exercises real edits in both shipped editing surfaces against a disposable
 * copy of a real project. The assertions are deliberately state-based: a pane
 * can look healthy while the other pane still has an older canonical document.
 */
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const sourceProjectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_EDIT_SYNC_PROJECT_PATH || '');
if (!sourceProjectPath || !existsSync(sourceProjectPath)) {
  throw new Error('Usage: node scripts/editor-recording-edit-sync-playwright.mjs <real-project.roughcut>');
}

const outputRoot = resolve(process.env.ROUGH_CUT_EDIT_SYNC_OUTPUT || `/tmp/rough-cut-edit-sync-${Date.now()}`);
mkdirSync(outputRoot, { recursive: true });
const disposableProjectRoot = join(dirname(sourceProjectPath), `.rough-cut-edit-sync-${Date.now()}`);
mkdirSync(disposableProjectRoot, { recursive: true });
const projectPath = join(disposableProjectRoot, 'edit-sync-project.roughcut');
copyFileSync(sourceProjectPath, projectPath);
const reportPath = join(outputRoot, 'editor-recording-edit-sync-report.json');
const userDataPath = join(outputRoot, 'electron-user-data');
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appPath = join(artifactRoot, 'resources', 'app');
const electronPath = join(artifactRoot, 'electron');
if (!existsSync(appPath) || !existsSync(electronPath)) {
  throw new Error('The packaged app is missing; run pnpm package:linux first.');
}

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', `--user-data-dir=${userDataPath}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: process.env.ROUGH_CUT_EDIT_SYNC_WINDOW_HEIGHT || '1000',
    ROUGH_CUT_SCREEN_LAYER_RENDERER: process.env.ROUGH_CUT_SCREEN_LAYER_RENDERER || 'canvas2d',
  },
});

const errors = [];
const events = [];
let report;
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push({ kind: 'pageerror', text: String(error) }));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ kind: 'console', text: message.text().slice(0, 500) });
  });
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => {
    window.__roughCutEditSyncEvents = [];
    window.__roughCutEditSyncUnsubscribe = window.roughCut.onProjectUpdated((update) => {
      window.__roughCutEditSyncEvents.push(update);
    });
  });

  const tab = (label) => page.locator(`[data-ui-region="app-view-tabstrip"] button[title="${label}"]`);
  const goTo = async (label, expectedView) => {
    await tab(label).click({ force: true });
    await page.waitForFunction((view) => document.querySelector('[data-active-app-view]')?.getAttribute('data-active-app-view') === view, expectedView);
    await page.waitForTimeout(1200);
  };
  const readState = async () => page.evaluate(async (path) => {
    const state = await window.roughCut.openProjectPath(path);
    const document = state?.document ?? state ?? {};
    const timeline = document.timeline ?? {};
    const composition = document.composition ?? {};
    const compositionTracks = Array.isArray(composition.tracks)
      ? composition.tracks
      : Array.isArray(document.tracks) ? document.tracks : [];
    const items = compositionTracks.flatMap((track) => Array.isArray(track.clips) ? track.clips : []);
    const tracks = compositionTracks;
    const editorTimeline = document.freecutTimeline ?? {};
    const editorItems = Array.isArray(editorTimeline.items) ? editorTimeline.items : [];
    const zoomMarkers = Array.isArray(timeline.markers) ? timeline.markers : [];
    return {
      id: document.id ?? state?.id ?? null,
      version: state?.projectVersion ?? state?.version ?? null,
      aspectRatio: document.settings?.aspectRatio ?? document.settings?.aspect ?? null,
      itemIds: items.map((item) => item.id ?? null),
      itemCount: items.length,
      trackIds: tracks.map((track) => track.id ?? null),
      trackCount: tracks.length,
      itemFrames: items.map((item) => ({ id: item.id ?? null, from: item.from ?? item.timelineIn ?? null, to: item.to ?? item.timelineOut ?? null })),
      itemOpacity: items.map((item) => ({ id: item.id ?? null, opacity: item.transform?.opacity ?? item.opacity ?? null })),
      itemPosition: items.map((item) => ({ id: item.id ?? null, x: item.transform?.x ?? null, y: item.transform?.y ?? null })),
      editorItemIds: editorItems.map((item) => item.id ?? null),
      editorItemFrames: editorItems.map((item) => ({ id: item.id ?? null, from: item.from ?? null, to: (item.from ?? 0) + (item.durationInFrames ?? 0) })),
      zoomMarkerCount: zoomMarkers.length,
      freecutTimeline: document.freecutTimeline ?? null,
      debugKeys: { state: Object.keys(state ?? {}), document: Object.keys(document), timeline: Object.keys(timeline), composition: Object.keys(composition) },
    };
  }, projectPath);
  const eventSnapshot = () => page.evaluate(() => window.__roughCutEditSyncEvents ?? []);
  const surfaceState = () => page.evaluate(() => ({
    activeView: document.querySelector('[data-active-app-view]')?.getAttribute('data-active-app-view') ?? null,
    recordingVisible: document.querySelector('[data-active-app-view]')?.getAttribute('data-active-app-view') === 'editor',
    editorVisible: document.querySelector('[data-ui-region="persistent-editor-slot"]')?.hidden === false,
    editorReady: document.querySelector('[data-freecut-ready="true"]') !== null,
    editorProjectId: document.querySelector('[data-freecut-project-id]')?.getAttribute('data-freecut-project-id') ?? null,
  }));
  const waitUntil = async (predicate, label, timeout = 30000) => {
    await page.waitForFunction(predicate, { label }, { timeout });
  };

  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[data-freecut-ready="true"]') !== null, null, { timeout: 60000 });
  await goTo('Recording edit', 'editor');
  const initial = await readState();
  const initialSurface = await surfaceState();
  const initialEvents = await eventSnapshot();

  // Recording edit mutation: add a real zoom marker through the visible timeline.
  const zoomLane = page.locator('[aria-label="Zoom markers"]');
  await zoomLane.waitFor({ state: 'visible' });
  const zoomBox = await zoomLane.boundingBox();
  if (!zoomBox || zoomBox.width < 100) throw new Error('Recording edit zoom lane is not interactive.');
  await zoomLane.click({ position: { x: Math.round(zoomBox.width * 0.42), y: Math.max(4, Math.round(zoomBox.height / 2)) } });
  await page.waitForTimeout(1200);
  const recordingEdited = await readState();
  const recordingEditEvents = await eventSnapshot();
  if (recordingEdited.zoomMarkerCount <= initial.zoomMarkerCount) {
    console.info(JSON.stringify({
      zoomLane: await zoomLane.evaluate((element) => ({ html: element.outerHTML.slice(0, 800), rect: element.getBoundingClientRect().toJSON() })),
      buttons: await page.locator('[data-ui-region="recording-workspace"] button, [data-ui-region="recording-workspace"] select').evaluateAll((elements) => elements.slice(0, 80).map((element) => ({ tag: element.tagName, label: element.getAttribute('aria-label'), title: element.getAttribute('title'), text: element.textContent?.trim().slice(0, 100), value: element instanceof HTMLSelectElement ? element.value : null }))),
      initial,
      recordingEdited,
    }, null, 2));
    throw new Error('Recording edit did not add a zoom marker to the canonical project.');
  }

  // The Recording edit mutation must be visible after entering the Editor and
  // must survive the editor's own mount/readiness cycle.
  await goTo('Editor', 'nle');
  await page.waitForFunction(() => document.querySelector('[data-freecut-ready="true"]') !== null, null, { timeout: 60000 });
  const editorAfterRecordingEdit = await readState();
  const editorSurfaceAfterRecordingEdit = await surfaceState();
  if (editorAfterRecordingEdit.zoomMarkerCount !== recordingEdited.zoomMarkerCount) {
    throw new Error('The Editor did not observe the Recording edit zoom marker.');
  }

  // FreeCut mutation: select and delete a real timeline item in the visible timeline,
  // then verify the host receives and persists the changed snapshot.
  const frame = page.frameLocator('iframe[data-freecut-embed="vendored"]');
  const timelineItems = frame.locator('[data-item-id]');
  const hitTarget = timelineItems.last();
  await hitTarget.waitFor({ state: 'visible', timeout: 60000 });
  const editorBaseline = {
    ...editorAfterRecordingEdit,
    editorItemIds: await timelineItems.evaluateAll((items) => items.map((item) => item.getAttribute('data-item-id')).filter(Boolean)),
  };
  editorBaseline.editorItemFrames = editorAfterRecordingEdit.editorItemFrames;
  await hitTarget.click({ force: true });
  await hitTarget.press('Delete');
  const saveButton = frame.getByRole('button', { name: /^Save$/i });
  if (await saveButton.count()) await saveButton.click({ force: true });
  await page.waitForTimeout(2500);
  const editorPositionEdited = await readState();
  const editorEditEvents = await eventSnapshot();
  if (JSON.stringify(editorPositionEdited.editorItemIds) === JSON.stringify(editorBaseline.editorItemIds)) {
    report = {
      ok: false,
      projectPath,
      sourceProjectPath,
      projectId: initial.id,
      checks: {
        recordingEditChangedCanonicalState: recordingEdited.zoomMarkerCount > initial.zoomMarkerCount,
        recordingEditVisibleInEditor: editorAfterRecordingEdit.zoomMarkerCount === recordingEdited.zoomMarkerCount,
        editorMutationChangedCanonicalState: false,
        editorMutationPublishedProjectUpdate: false,
        editorMutationVisibleInRecordingEdit: false,
      },
      states: { initial, recordingEdited, editorAfterRecordingEdit, editorPositionEdited },
      surfaces: { initialSurface, editorSurfaceAfterRecordingEdit },
      events: { initial: initialEvents, afterRecordingEdit: recordingEditEvents, afterEditorEdit: editorEditEvents },
      freecutTarget: await hitTarget.evaluate((element) => ({
        html: element.outerHTML.slice(0, 1200),
        rect: element.getBoundingClientRect().toJSON(),
        pointerEvents: getComputedStyle(element).pointerEvents,
      })).catch((error) => ({ error: String(error) })),
      localTimelineItemCountAfterDelete: await frame.locator('[data-item-id]').count().catch(() => null),
      errors: [...errors, { kind: 'assertion', text: 'FreeCut timeline delete did not change the canonical timeline.' }].slice(0, 30),
      screenshotSha256: null,
    };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    throw new Error('FreeCut timeline delete did not change the canonical timeline.');
  }

  // Undo in the Editor must restore the exact timeline before the user changes
  // panes, then the restored project must be visible in Recording edit.
  const undoButtonIndex = await frame.locator('button').evaluateAll((buttons) => buttons.findIndex((button) =>
    /undo/i.test(`${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`),
  ));
  if (undoButtonIndex >= 0) {
    await frame.locator('button').nth(undoButtonIndex).click({ force: true });
  } else {
    await frame.locator('body').click({ position: { x: 8, y: 8 } });
    await frame.locator('body').press('Control+z');
  }
  const saveButtonIndex = await frame.locator('button').evaluateAll((buttons) => buttons.findIndex((button) =>
    /save/i.test(`${button.getAttribute('aria-label') ?? ''} ${button.textContent ?? ''}`),
  ));
  if (saveButtonIndex >= 0) await frame.locator('button').nth(saveButtonIndex).click({ force: true });
  const localTimelineItemCountAfterUndo = await frame.locator('[data-item-id]').count();
  await page.waitForTimeout(1500);
  const editorUndo = await readState();
  if (localTimelineItemCountAfterUndo < 2 || JSON.stringify(editorUndo.editorItemIds) !== JSON.stringify(editorBaseline.editorItemIds)) {
    report = {
      ok: false,
      projectPath,
      sourceProjectPath,
      projectId: initial.id,
      checks: {
        recordingEditChangedCanonicalState: recordingEdited.zoomMarkerCount > initial.zoomMarkerCount,
        recordingEditVisibleInEditor: editorAfterRecordingEdit.zoomMarkerCount === recordingEdited.zoomMarkerCount,
      editorMutationChangedCanonicalState: JSON.stringify(editorPositionEdited.editorItemFrames) !== JSON.stringify(editorBaseline.editorItemFrames),
        editorMutationPublishedProjectUpdate: editorEditEvents.length > recordingEditEvents.length,
        editorUndoRestoredItems: localTimelineItemCountAfterUndo >= 2,
        editorUndoPersistedCanonicalState: false,
      },
      states: { initial, recordingEdited, editorAfterRecordingEdit, editorPositionEdited, editorUndo },
      surfaces: { initialSurface, editorSurfaceAfterRecordingEdit },
      events: { initial: initialEvents, afterRecordingEdit: recordingEditEvents, afterEditorEdit: editorEditEvents },
      undoControls: {
        buttonIndex: undoButtonIndex,
        saveButtonIndex,
        localTimelineItemCountAfterUndo,
        buttons: await frame.locator('button').evaluateAll((buttons) => buttons.map((button) => ({
          aria: button.getAttribute('aria-label'),
          text: button.textContent?.trim(),
          disabled: button.disabled,
        })).filter((button) => /undo|redo/i.test(`${button.aria ?? ''} ${button.text ?? ''}`))),
      },
      errors: [...errors, { kind: 'assertion', text: 'FreeCut undo did not restore the prior timeline placement.' }].slice(0, 30),
      screenshotSha256: null,
    };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    throw new Error('FreeCut undo did not restore the prior timeline placement.');
  }
  await goTo('Recording edit', 'editor');
  const recordingAfterEditorEdit = await readState();
  const recordingSurfaceAfterEdit = await surfaceState();
  if (JSON.stringify(recordingAfterEditorEdit.editorItemIds) !== JSON.stringify(editorUndo.editorItemIds)) {
    throw new Error('Recording edit did not observe the restored FreeCut timeline.');
  }
  const recordingAfterUndo = await readState();

  // Undo the Recording edit and verify both views return to the exact baseline.
  const undoButton = page.getByRole('button', { name: 'Undo last edit' });
  await undoButton.click({ force: true });
  await page.waitForTimeout(5000);
  const afterRecordingUndo = await readState();
  const finalEvents = await eventSnapshot();
  const diskAfterRecordingUndo = JSON.parse(readFileSync(projectPath, 'utf8'));

  // Reload persistence: the restored canonical state must remain identical.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[data-freecut-ready="true"]') !== null, null, { timeout: 60000 });
  const afterReload = await readState();
  const diskAfterReload = JSON.parse(readFileSync(projectPath, 'utf8'));

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checks = {
    recordingEditChangedCanonicalState: recordingEdited.zoomMarkerCount > initial.zoomMarkerCount,
    recordingEditPublishedProjectUpdate: editorAfterRecordingEdit.zoomMarkerCount === recordingEdited.zoomMarkerCount,
    recordingEditVisibleInEditor: editorAfterRecordingEdit.zoomMarkerCount === recordingEdited.zoomMarkerCount,
    editorMutationChangedCanonicalState: JSON.stringify(editorPositionEdited.editorItemIds) !== JSON.stringify(editorBaseline.editorItemIds),
    editorMutationPublishedProjectUpdate: editorEditEvents.length > recordingEditEvents.length,
    editorMutationVisibleInRecordingEdit: JSON.stringify(recordingAfterEditorEdit.editorItemIds) === JSON.stringify(editorUndo.editorItemIds),
    editorUndoRestoredItems: JSON.stringify(editorUndo.editorItemIds) === JSON.stringify(editorBaseline.editorItemIds),
    recordingUndoObservedEditorRestore: JSON.stringify(recordingAfterUndo.editorItemIds) === JSON.stringify(editorUndo.editorItemIds),
    restoredStateSurvivesReload: same(diskAfterReload, diskAfterRecordingUndo),
    recordingUndoRestoredBaseline: afterRecordingUndo.zoomMarkerCount === initial.zoomMarkerCount,
    finalStateMatchesBaselineExceptVersion: afterRecordingUndo.itemIds.join(',') === initial.itemIds.join(',')
      && afterRecordingUndo.itemFrames.length === initial.itemFrames.length,
    bothSurfacesReported: initialSurface.recordingVisible && editorSurfaceAfterRecordingEdit.editorVisible
      && editorSurfaceAfterRecordingEdit.editorReady && recordingSurfaceAfterEdit.recordingVisible,
    noActionableErrors: errors.length === 0,
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    projectPath,
    sourceProjectPath,
    projectId: initial.id,
    checks,
    states: { initial, recordingEdited, editorAfterRecordingEdit, editorPositionEdited, recordingAfterEditorEdit, editorUndo, recordingAfterUndo, afterReload, afterRecordingUndo, diskAfterRecordingUndo, diskAfterReload },
    surfaces: { initialSurface, editorSurfaceAfterRecordingEdit, recordingSurfaceAfterEdit },
    events: { initial: initialEvents, afterRecordingEdit: recordingEditEvents, afterEditorEdit: editorEditEvents, final: finalEvents },
    errors: errors.slice(0, 30),
    screenshotSha256: null,
  };
} finally {
  await app.close().catch(() => undefined);
  rmSync(disposableProjectRoot, { recursive: true, force: true });
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({ ...report, reportPath }, null, 2));
if (!report?.ok) process.exitCode = 1;

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire('/home/endlessblink/.npm-global/lib/node_modules/playwright/package.json')('playwright');
}
