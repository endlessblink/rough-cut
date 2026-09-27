import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isUiPath, validateReviewArtifact, UI_PROOF_CHECKLIST } from './ui-visual-proof-lib.mjs';

const testDesktopEntryPath = '/tmp/rough-cut-proof-test.desktop';
const testProvenancePath = '/tmp/rough-cut-proof-test-provenance.json';
const testPinnedEntryPath = '/tmp/rough-cut-proof-test-pinned.desktop';
const runtimeScreenshotPaths = {
  before: '/tmp/rough-cut-runtime-before.png',
  change: '/tmp/rough-cut-runtime-change.png',
  after: '/tmp/rough-cut-runtime-after.png',
};
const packageIdentityPath = resolve(import.meta.dirname, '../dist/rough-cut-mvp-linux-x64/resources/app/package-identity.json');
const packageIdentity = JSON.parse(readFileSync(packageIdentityPath, 'utf8'));
writeFileSync(testDesktopEntryPath, 'Exec=env ROUGH_CUT_DOCK_LAUNCH=1 /tmp/dist/rough-cut-mvp-linux-x64/run.sh\n');
writeFileSync(testPinnedEntryPath, 'Exec=env ROUGH_CUT_DOCK_LAUNCH=1 /tmp/dist/rough-cut-mvp-linux-x64/dock-launch.sh\n');
for (const [key, path] of Object.entries(runtimeScreenshotPaths)) writeFileSync(path, `runtime-${key}`);
writeFileSync(testProvenancePath, JSON.stringify({
  version: 1,
  launchSource: 'installed-desktop-entry',
  pid: process.pid,
  executable: process.execPath,
  appPath: '/tmp/dist/rough-cut-mvp-linux-x64/resources/app',
  startedAt: packageIdentity.packagedAt,
  packageIdentity,
}));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('visual proof gate recognizes renderer behavior and presentation files', () => {
  assert.equal(isUiPath('apps/desktop/src/renderer/src/editor.tsx'), true);
  assert.equal(isUiPath('apps/desktop/src/renderer/src/styles.css'), true);
  assert.equal(isUiPath('apps/desktop/src/renderer/src/model.mjs'), true);
  assert.equal(isUiPath('vendor/freecut/src/main.tsx'), true);
});

test('visual proof gate ignores backend, generated, and documentation files', () => {
  assert.equal(isUiPath('apps/desktop/src/main/freecut-host.mjs'), true);
  assert.equal(isUiPath('apps/desktop/src/main/freecut-window.mjs'), true);
  assert.equal(isUiPath('apps/desktop/src/main/index.mjs'), true);
  assert.equal(isUiPath('apps/desktop/dist/renderer/index.js'), false);
  assert.equal(isUiPath('DESIGN.md'), false);
});

test('the generated desktop entry stamps installed-launch provenance', () => {
  const prepareDockScript = readFileSync(resolve(import.meta.dirname, 'prepare-linux-dock.sh'), 'utf8');
  assert.match(prepareDockScript, /Exec=env ROUGH_CUT_DOCK_LAUNCH=1 \$APP_ROOT\/dock-launch\.sh/);
});

function reviewArtifact(overrides = {}) {
  const checklist = Object.fromEntries(UI_PROOF_CHECKLIST.map((item) => {
    const key = item.slice(0, item.indexOf('='));
    return [key, { verdict: 'pass', evidence: `Observed ${key} in the fresh dock screenshot.` }];
  }));
  return {
    schemaVersion: 2,
    reviewer: 'visual-subagent',
    reviewMode: 'dock-launched',
    capture: {
      surface: 'app-window',
      dockVisible: false,
      appWindowVisible: true,
    },
    dock: {
      desktopEntry: 'installed',
      packageExec: 'current-packaged-runner',
      desktopEntryPath: testDesktopEntryPath,
      launchSource: 'installed-desktop-entry',
      provenancePath: testProvenancePath,
      launchPid: process.pid,
      launchExecutable: process.execPath,
      liveProcessObserved: true,
      pinnedEntryPath: testPinnedEntryPath,
    },
    checklist,
    linkedBoundary: {
      verdict: 'pass',
      evidence: 'Selected post-cut rendered SCREEN and AUDIO edges match.',
      selectedScreenClipId: 'screen-clip-1',
      screenBoundaryX: 120,
      audioBoundaryX: 120,
      boundaryErrorPx: 0,
      boundaryFrame: 3,
      renderedScreenCount: 2,
      renderedAudioCount: 2,
      renderedScreenClipIds: ['screen-clip-1', 'screen-clip-2'],
      renderedAudioClipIds: ['audio:screen-clip-1', 'audio:screen-clip-2'],
      renderedRanges: [
        { screenId: 'screen-clip-1', audioId: 'audio:screen-clip-1', screenIn: 0, audioIn: 0, screenOut: 3, audioOut: 3 },
        { screenId: 'screen-clip-2', audioId: 'audio:screen-clip-2', screenIn: 3, audioIn: 3, screenOut: 900, audioOut: 900 },
      ],
      repeatedCutEvidence: {
        linkedLaneStatus: 'pass',
        linkedLaneMismatchCount: 0,
        screen: [
          { id: 'screen-clip-1', left: 120, right: 123, timelineIn: 0, timelineOut: 3, boundaryFrame: NaN },
          { id: 'screen-clip-2', left: 123, right: 126, timelineIn: 3, timelineOut: 6, boundaryFrame: 3 },
          { id: 'screen-clip-3', left: 126, right: 900, timelineIn: 6, timelineOut: 900, boundaryFrame: 6 },
        ],
        audio: [
          { id: 'audio:screen-clip-1', left: 120, right: 123, timelineIn: 0, timelineOut: 3, boundaryFrame: NaN },
          { id: 'audio:screen-clip-2', left: 123, right: 126, timelineIn: 3, timelineOut: 6, boundaryFrame: 3 },
          { id: 'audio:screen-clip-3', left: 126, right: 900, timelineIn: 6, timelineOut: 900, boundaryFrame: 6 },
        ],
      },
      repeatedBoundaryScreenshotPath: runtimeScreenshotPaths.change,
      repeatedBoundaryScreenshotSha256: sha256(runtimeScreenshotPaths.change),
      paintedBoundaryEvidence: {
        threshold: 24,
        boundaries: [
          { x: 123, screenScore: 80, audioScore: 80 },
          { x: 126, screenScore: 80, audioScore: 80 },
        ],
        screenshotPath: runtimeScreenshotPaths.change,
      },
      repeatedBoundaryCloseupScreenshotPath: runtimeScreenshotPaths.change,
      repeatedBoundaryCloseupScreenshotSha256: sha256(runtimeScreenshotPaths.change),
      screenshotPath: runtimeScreenshotPaths.change,
      screenshotSha256: sha256(runtimeScreenshotPaths.change),
      boundaryZoomScreenshotPath: runtimeScreenshotPaths.change,
      boundaryZoomScreenshotSha256: sha256(runtimeScreenshotPaths.change),
      interactionReportPath: runtimeScreenshotPaths.after,
      interactionReportSha256: sha256(runtimeScreenshotPaths.after),
    },
    sharedEditor: {
      projectIdentity: 'shared-rough-cut-project',
      timelineSource: 'live-shared-timeline',
      programMediaRole: 'compositor-preview-only',
      programMediaIds: [],
      roundTrip: 'verified',
    },
    runtimeEvidence: {
      projectId: 'project-123456',
      eventSource: 'rough-cut-host-sync',
      observed: true,
      freecutMarker: { version: 'vendored-freecut-1', embedded: true, buildHash: 'build-hash' },
      editorSurface: { ready: true, projectId: 'project-123456' },
      before: { projectId: 'project-123456', screenshotPath: runtimeScreenshotPaths.before, screenshotSha256: sha256(runtimeScreenshotPaths.before), timelineFingerprint: 'before' },
      change: { projectId: 'project-123456', screenshotPath: runtimeScreenshotPaths.change, screenshotSha256: sha256(runtimeScreenshotPaths.change), timelineFingerprint: 'change' },
      after: { projectId: 'project-123456', screenshotPath: runtimeScreenshotPaths.after, screenshotSha256: sha256(runtimeScreenshotPaths.after), timelineFingerprint: 'after' },
    },
    ...overrides,
  };
}

test('visual proof requires structured evidence for every review gate', () => {
  assert.equal(validateReviewArtifact(reviewArtifact(), []), null);
  assert.match(
    validateReviewArtifact({ schemaVersion: 2, reviewer: 'visual-subagent', reviewMode: 'dock-launched' }, []),
    /structured checklist/i,
  );
  const missingEvidence = reviewArtifact();
  delete missingEvidence.checklist.timeline;
  assert.match(validateReviewArtifact(missingEvidence, []), /timeline review/i);
});

test('visual proof requires selected rendered linked-boundary evidence for timeline UI changes', () => {
  const valid = reviewArtifact();
  writeFileSync(runtimeScreenshotPaths.after, JSON.stringify({ renderedCutEvidence: {
    selectedScreenClipId: 'screen-clip-1', boundaryFrame: 3, renderedScreenCount: 2, renderedAudioCount: 2,
    screenBoundaryX: 120, audioBoundaryX: 120, boundaryErrorPx: 0,
    renderedRanges: reviewArtifact().linkedBoundary.renderedRanges,
    repeatedCutEvidence: reviewArtifact().linkedBoundary.repeatedCutEvidence,
    paintedBoundaryEvidence: reviewArtifact().linkedBoundary.paintedBoundaryEvidence,
    repeatedBoundaryCloseupScreenshotPath: reviewArtifact().linkedBoundary.repeatedBoundaryCloseupScreenshotPath,
    repeatedBoundaryCloseupScreenshotSha256: reviewArtifact().linkedBoundary.repeatedBoundaryCloseupScreenshotSha256,
  } }));
  valid.linkedBoundary.interactionReportSha256 = sha256(runtimeScreenshotPaths.after);
  assert.equal(validateReviewArtifact(valid, ['apps/desktop/src/renderer/src/main.tsx']), null);
  const missing = reviewArtifact();
  delete missing.linkedBoundary;
  assert.match(validateReviewArtifact(missing, ['apps/desktop/src/renderer/src/main.tsx']), /linked-boundary review/i);
  const mismatched = reviewArtifact({ linkedBoundary: { ...reviewArtifact().linkedBoundary, boundaryErrorPx: 3 } });
  assert.match(validateReviewArtifact(mismatched, ['apps/desktop/src/renderer/src/main.tsx']), /equal rendered edge pixels/i);
  const missingRepeated = reviewArtifact();
  delete missingRepeated.linkedBoundary.repeatedCutEvidence;
  assert.match(validateReviewArtifact(missingRepeated, ['apps/desktop/src/renderer/src/main.tsx']), /repeated linked cuts/i);
  const missingPainted = reviewArtifact();
  delete missingPainted.linkedBoundary.paintedBoundaryEvidence;
  assert.match(validateReviewArtifact(missingPainted, ['apps/desktop/src/renderer/src/main.tsx']), /painted SCREEN\/AUDIO pixels/i);
  const paintedMismatch = reviewArtifact();
  paintedMismatch.linkedBoundary.paintedBoundaryEvidence.boundaries[1].screenScore = 0;
  assert.match(validateReviewArtifact(paintedMismatch, ['apps/desktop/src/renderer/src/main.tsx']), /painted SCREEN\/AUDIO pixels/i);
  const paintedXMismatch = reviewArtifact();
  paintedXMismatch.linkedBoundary.paintedBoundaryEvidence.boundaries = [
    { x: 123, screenScore: 80, audioScore: 0 },
    { x: 127, screenScore: 0, audioScore: 80 },
  ];
  assert.match(validateReviewArtifact(paintedXMismatch, ['apps/desktop/src/renderer/src/main.tsx']), /painted SCREEN\/AUDIO pixels/i);
  const missingCloseup = reviewArtifact();
  delete missingCloseup.linkedBoundary.repeatedBoundaryCloseupScreenshotPath;
  assert.match(validateReviewArtifact(missingCloseup, ['apps/desktop/src/renderer/src/main.tsx']), /close-up screenshot/i);
  const repeatedMismatch = reviewArtifact();
  repeatedMismatch.linkedBoundary.repeatedCutEvidence.screen[1].left += 4;
  assert.match(validateReviewArtifact(repeatedMismatch, ['apps/desktop/src/renderer/src/main.tsx']), /repeated linked-boundary evidence contains/i);
});

test('visual proof rejects cropped app-only screenshots', () => {
  const review = reviewArtifact();
  delete review.capture;
  assert.match(
    validateReviewArtifact(review, []),
    /full-desktop capture.*PID-matched packaged app-window capture/i,
  );
});

test('visual proof rejects a declared dock claim without a live installed-entry process', () => {
  const review = reviewArtifact({ dock: {
    desktopEntry: 'installed',
    packageExec: 'current-packaged-runner',
    desktopEntryPath: testDesktopEntryPath,
    launchSource: 'installed-desktop-entry',
    provenancePath: testProvenancePath,
    launchPid: process.pid,
    launchExecutable: process.execPath,
  } });
  writeFileSync(testProvenancePath, JSON.stringify({
    version: 1,
    launchSource: 'unknown',
    pid: process.pid,
    executable: process.execPath,
    startedAt: packageIdentity.packagedAt,
    packageIdentity,
  }));
  assert.match(validateReviewArtifact(review, []), /not started by the installed desktop entry/i);
  writeFileSync(testProvenancePath, JSON.stringify({
    version: 1,
    launchSource: 'installed-desktop-entry',
    pid: process.pid,
    executable: process.execPath,
    startedAt: packageIdentity.packagedAt,
    packageIdentity,
  }));
});

test('visual proof rejects a pinned dock entry that still launches development', () => {
  const review = reviewArtifact();
  writeFileSync(testPinnedEntryPath, 'Exec=/workspace/scripts/launch-dev-app.sh\n');
  assert.match(validateReviewArtifact(review, []), /pinned dock entry still launches the development app/i);
  writeFileSync(testPinnedEntryPath, 'Exec=env ROUGH_CUT_DOCK_LAUNCH=1 /tmp/dist/rough-cut-mvp-linux-x64/dock-launch.sh\n');
});

test('FreeCut visual proof rejects flattened program-media editing', () => {
  const review = reviewArtifact({ sharedEditor: {
    projectIdentity: 'shared-rough-cut-project',
    timelineSource: 'live-shared-timeline',
    programMediaRole: 'editable-timeline-media',
    programMediaIds: ['asset__program'],
    roundTrip: 'unverified',
  } });
  assert.match(
    validateReviewArtifact(review, ['apps/desktop/src/renderer/src/freecut-editor-surface.tsx']),
    /program media is still being treated as editable timeline media/i,
  );
  const duplicateFreecut = reviewArtifact({ sharedEditor: {
    projectIdentity: 'shared-rough-cut-project',
    timelineSource: 'live-shared-timeline',
    programMediaRole: 'compositor-preview-only',
    programMediaIds: ['asset__program'],
    roundTrip: 'verified',
  } });
  assert.match(
    validateReviewArtifact(duplicateFreecut, ['apps/desktop/src/renderer/src/freecut-editor-surface.tsx']),
    /synthetic program media remains/i,
  );
});

test('FreeCut proof accepts the shared source bridge after synthetic timeline media is removed', () => {
  assert.equal(
    validateReviewArtifact(
      reviewArtifact(),
      ['apps/desktop/src/renderer/src/freecut-editor-surface.tsx'],
      { root: resolve(import.meta.dirname, '..') },
    ),
    null,
  );
});

test('FreeCut proof rejects a review without observed runtime before/change/after evidence', () => {
  const review = reviewArtifact();
  delete review.runtimeEvidence;
  assert.match(
    validateReviewArtifact(review, ['apps/desktop/src/renderer/src/freecut-editor-surface.tsx']),
    /machine-linked runtime evidence/i,
  );
});
