import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isUiPath, validateReviewArtifact, UI_PROOF_CHECKLIST } from './ui-visual-proof-lib.mjs';

const testDesktopEntryPath = '/tmp/rough-cut-proof-test.desktop';
const testProvenancePath = '/tmp/rough-cut-proof-test-provenance.json';
const testPinnedEntryPath = '/tmp/rough-cut-proof-test-pinned.desktop';
writeFileSync(testDesktopEntryPath, 'Exec=env ROUGH_CUT_DOCK_LAUNCH=1 /tmp/dist/rough-cut-mvp-linux-x64/run.sh\n');
writeFileSync(testPinnedEntryPath, 'Exec=env ROUGH_CUT_DOCK_LAUNCH=1 /tmp/dist/rough-cut-mvp-linux-x64/dock-launch.sh\n');
writeFileSync(testProvenancePath, JSON.stringify({
  version: 1,
  launchSource: 'installed-desktop-entry',
  pid: process.pid,
  executable: process.execPath,
  appPath: '/tmp/dist/rough-cut-mvp-linux-x64/resources/app',
  startedAt: new Date().toISOString(),
}));

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
      before: { projectId: 'project-123456', screenshotPath: '/tmp/rough-cut-runtime-before.png', screenshotSha256: '1d0b9e602f7a68dc8c6ff5ca3cf33fe1d28c104a0ffaf37d49621afacb274bca', timelineFingerprint: 'before' },
      change: { projectId: 'project-123456', screenshotPath: '/tmp/rough-cut-runtime-change.png', screenshotSha256: 'd5b6c8538ba18b41b301e4cc9b3ff531f9ac86d50307f9187ff0296d326d12c1', timelineFingerprint: 'change' },
      after: { projectId: 'project-123456', screenshotPath: '/tmp/rough-cut-runtime-after.png', screenshotSha256: '3715f168cafbdd5f928b85fe91c00205c3d683ad170ea8b21bf11c970b5bf77d', timelineFingerprint: 'after' },
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
