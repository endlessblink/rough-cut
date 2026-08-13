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
writeFileSync(testDesktopEntryPath, 'Exec=env ROUGH_CUT_DOCK_LAUNCH=1 /tmp/dist/rough-cut-mvp-linux-x64/run.sh\n');
writeFileSync(testPinnedEntryPath, 'Exec=env ROUGH_CUT_DOCK_LAUNCH=1 /tmp/dist/rough-cut-mvp-linux-x64/dock-launch.sh\n');
for (const [key, path] of Object.entries(runtimeScreenshotPaths)) writeFileSync(path, `runtime-${key}`);
writeFileSync(testProvenancePath, JSON.stringify({
  version: 1,
  launchSource: 'installed-desktop-entry',
  pid: process.pid,
  executable: process.execPath,
  appPath: '/tmp/dist/rough-cut-mvp-linux-x64/resources/app',
  startedAt: new Date().toISOString(),
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
      surface: 'full-desktop',
      dockVisible: true,
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
      pinnedEntryPath: testPinnedEntryPath,
    },
    checklist,
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

test('visual proof rejects cropped app-only screenshots', () => {
  const review = reviewArtifact();
  delete review.capture;
  assert.match(
    validateReviewArtifact(review, []),
    /full-desktop capture/i,
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
  }));
  assert.match(validateReviewArtifact(review, []), /not started by the installed desktop entry/i);
  writeFileSync(testProvenancePath, JSON.stringify({
    version: 1,
    launchSource: 'installed-desktop-entry',
    pid: process.pid,
    executable: process.execPath,
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
