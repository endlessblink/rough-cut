import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const VISUAL_PROOF_MARKER = '.git/rough-cut-ui-visual-proof.json';
export const VISUAL_PROOF_ARM_MARKER = '.git/rough-cut-ui-visual-proof-arm.json';
export const VISUAL_PROOF_VERSION = 4;
export const UI_PROOF_CHECKLIST = [
  'dock=pass', 'shell=pass', 'layout=pass', 'media=pass', 'playback=pass',
  'effects=pass', 'timeline=pass', 'no-blank=pass', 'no-overlap=pass', 'scope=pass',
];

export function isUiPath(path) {
  return (
    (
      path.startsWith('apps/desktop/src/renderer/src/')
      || path.startsWith('vendor/freecut/src/')
      || [
        'apps/desktop/src/main/freecut-host.mjs',
        'apps/desktop/src/main/freecut-window.mjs',
        'apps/desktop/src/main/index.mjs',
      ].includes(path)
    )
    && /\.(?:css|mjs|ts|tsx|html)$/.test(path)
  );
}

export function changedUiFiles(root) {
  const tracked = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD'],
    { cwd: root, encoding: 'utf8' },
  );
  const untracked = execFileSync(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' },
  );
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter(isUiPath))].sort();
}

export function uiFingerprint(root, paths = changedUiFiles(root)) {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(root, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function artifactFiles(root) {
  const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64', 'resources', 'app');
  const roots = [
    join(artifactRoot, 'apps', 'desktop', 'dist', 'renderer'),
    join(artifactRoot, 'freecut'),
  ];
  const files = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  roots.forEach(visit);
  return files.sort();
}

export function packagedUiFingerprint(root) {
  const files = artifactFiles(root);
  if (files.length === 0) return null;
  const hash = createHash('sha256');
  for (const path of files) {
    hash.update(relative(root, path));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function latestMtime(paths) {
  return paths.reduce((latest, path) => Math.max(latest, statSync(path).mtimeMs), 0);
}

function changedFreecutUiFiles(paths) {
  return paths.some((path) => (
    path === 'apps/desktop/src/renderer/src/freecut-editor-surface.tsx'
    || path === 'apps/desktop/src/main/freecut-host.mjs'
    || path === 'vendor/freecut/src/main.tsx'
    || path === 'vendor/freecut/src/infrastructure/storage/rough-cut-host.ts'
    || path === 'vendor/freecut/src/features/editor/components/editor.tsx'
  ));
}

function validateChecklistEvidence(checklist) {
  if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) {
    return 'the visual review has no structured checklist';
  }
  for (const item of UI_PROOF_CHECKLIST) {
    const key = item.slice(0, item.indexOf('='));
    const result = checklist[key];
    if (!result || result.verdict !== 'pass' || typeof result.evidence !== 'string' || result.evidence.trim().length < 12) {
      return `the ${key} review is not an evidenced pass`;
    }
  }
  return null;
}

function validateSharedEditorEvidence(sharedEditor) {
  if (!sharedEditor || typeof sharedEditor !== 'object' || Array.isArray(sharedEditor)) {
    return 'the FreeCut review has no shared-editor evidence';
  }
  if (sharedEditor.projectIdentity !== 'shared-rough-cut-project') {
    return 'FreeCut project identity is not proven shared';
  }
  if (sharedEditor.timelineSource !== 'live-shared-timeline') {
    return 'FreeCut timeline is not proven live-shared';
  }
  if (sharedEditor.programMediaRole !== 'compositor-preview-only') {
    return 'program media is still being treated as editable timeline media';
  }
  if (!Array.isArray(sharedEditor.programMediaIds) || sharedEditor.programMediaIds.length !== 0) {
    return 'synthetic program media remains in the editable timeline';
  }
  if (sharedEditor.roundTrip !== 'verified') {
    return 'FreeCut edit round trip is not verified';
  }
  return null;
}

function validateRuntimeEvidence(runtimeEvidence) {
  if (!runtimeEvidence || typeof runtimeEvidence !== 'object' || Array.isArray(runtimeEvidence)) {
    return 'the FreeCut review has no machine-linked runtime evidence';
  }
  if (typeof runtimeEvidence.projectId !== 'string' || runtimeEvidence.projectId.trim().length < 8) {
    return 'runtime evidence has no project identity';
  }
  if (runtimeEvidence.eventSource !== 'rough-cut-host-sync' || runtimeEvidence.observed !== true) {
    return 'runtime evidence does not prove an observed host sync event';
  }
  if (
    runtimeEvidence.freecutMarker?.version !== 'vendored-freecut-1'
    || runtimeEvidence.freecutMarker?.embedded !== true
    || typeof runtimeEvidence.freecutMarker?.buildHash !== 'string'
    || runtimeEvidence.editorSurface?.ready !== true
    || runtimeEvidence.editorSurface?.projectId !== runtimeEvidence.projectId
  ) {
    return 'runtime evidence does not prove the visible Editor surface is ready embedded FreeCut';
  }
  const captures = [runtimeEvidence.before, runtimeEvidence.change, runtimeEvidence.after];
  for (const capture of captures) {
    if (!capture || capture.projectId !== runtimeEvidence.projectId || typeof capture.screenshotPath !== 'string') {
      return 'runtime before/change/after captures are not tied to one project';
    }
    if (!existsSync(capture.screenshotPath)) return 'a runtime evidence screenshot is missing';
    if (capture.screenshotSha256 !== fileSha256(capture.screenshotPath)) {
      return 'a runtime evidence screenshot hash does not match';
    }
  }
  if (
    typeof runtimeEvidence.before.timelineFingerprint !== 'string'
    || typeof runtimeEvidence.change.timelineFingerprint !== 'string'
    || typeof runtimeEvidence.after.timelineFingerprint !== 'string'
    || runtimeEvidence.before.timelineFingerprint === runtimeEvidence.change.timelineFingerprint
    || runtimeEvidence.change.timelineFingerprint === runtimeEvidence.after.timelineFingerprint
  ) {
    return 'runtime evidence does not show a changed and restored timeline';
  }
  return null;
}

function validateDockProvenance(dock) {
  if (!dock || dock.launchSource !== 'installed-desktop-entry' || typeof dock.provenancePath !== 'string') {
    return 'dock provenance must come from the installed desktop entry runtime';
  }
  if (!existsSync(dock.provenancePath)) return 'the dock provenance marker is missing';
  let provenance;
  try {
    provenance = JSON.parse(readFileSync(dock.provenancePath, 'utf8'));
  } catch {
    return 'the dock provenance marker is unreadable';
  }
  if (provenance.version !== 1 || provenance.launchSource !== 'installed-desktop-entry') {
    return 'the running app was not started by the installed desktop entry';
  }
  if (!Number.isInteger(provenance.pid) || provenance.pid < 1 || !existsSync(`/proc/${provenance.pid}`)) {
    return 'the dock provenance does not point to a live packaged process';
  }
  if (typeof provenance.executable !== 'string' || !existsSync(provenance.executable)) {
    return 'the dock provenance executable is not live';
  }
  if (dock.launchPid !== provenance.pid || dock.launchExecutable !== provenance.executable) {
    return 'the review is not bound to the running dock-launched process';
  }
  return null;
}

function validatePinnedDockEntry(dock) {
  const pinnedEntryPath = typeof dock?.pinnedEntryPath === 'string' ? dock.pinnedEntryPath : '';
  if (!pinnedEntryPath || !existsSync(pinnedEntryPath)) return 'the pinned dock entry cannot be verified';
  const pinnedEntry = readFileSync(pinnedEntryPath, 'utf8');
  if (
    !pinnedEntry.includes('ROUGH_CUT_DOCK_LAUNCH=1')
    || !pinnedEntry.includes('/dist/rough-cut-mvp-linux-x64/dock-launch.sh')
  ) {
    return 'the pinned dock entry still launches the development app';
  }
  return null;
}

function validateSharedEditorSource(root, paths) {
  if (!root) return null;
  const surfacePath = paths.find((path) => path.endsWith('/freecut-editor-surface.tsx'));
  if (surfacePath) {
    const surface = readFileSync(join(root, surfacePath), 'utf8');
    if (/StyledVideoPreview|freecutEditorModeBar|>Program<|>Source</.test(surface)) {
      return 'FreeCut surface still contains the rejected hybrid Program/Source renderer';
    }
    if (!/data-freecut-marker-version|data-freecut-project-id|data-freecut-ready/.test(surface)) {
      return 'FreeCut surface has no runtime identity or readiness proof';
    }
    if (!/freecut-command|applyFreecutCommand/.test(surface)) {
      return 'FreeCut surface has no host command bridge';
    }
  }
  const hostPath = join(root, 'apps/desktop/src/main/freecut-host.mjs');
  if (existsSync(hostPath)) {
    const host = readFileSync(hostPath, 'utf8');
    if (/mediaId:\s*isPrimaryVideo|roughCutProgramMediaId|roughCutProgramSourceAssetId/.test(host)) {
      return 'FreeCut host still exposes synthetic program media as editable media';
    }
    if (/startRoughCutHostSync|setInterval\(.*1000/.test(host)) {
      return 'FreeCut host still relies on polling instead of host-owned commands';
    }
  }
  return null;
}

export function validateReviewArtifact(review, paths = [], context = {}) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    return 'the visual review artifact is not an object';
  }
  if (review.schemaVersion !== 2) return 'the visual review artifact schema is outdated';
  if (review.reviewer !== 'visual-subagent' || review.reviewMode !== 'dock-launched') {
    return 'the review artifact is not identified as an independent dock-launched review';
  }
  const checklistError = validateChecklistEvidence(review.checklist);
  if (checklistError) return checklistError;
  if (
    !review.capture
    || review.capture.surface !== 'full-desktop'
    || review.capture.dockVisible !== true
    || review.capture.appWindowVisible !== true
  ) {
    return 'the review must use a full-desktop capture with the dock and app window visible';
  }
  if (!review.dock || review.dock.desktopEntry !== 'installed' || review.dock.packageExec !== 'current-packaged-runner') {
    return 'dock provenance is not independently evidenced';
  }
  const desktopEntryPath = typeof review.dock.desktopEntryPath === 'string' ? review.dock.desktopEntryPath : '';
  if (!desktopEntryPath || !existsSync(desktopEntryPath)) return 'the installed dock entry cannot be verified';
  const desktopEntry = readFileSync(desktopEntryPath, 'utf8');
  if (!desktopEntry.includes('Exec=')) return 'the installed dock entry has no executable';
  if (!desktopEntry.includes('/dist/rough-cut-mvp-linux-x64/run.sh')
    && !desktopEntry.includes('/dist/rough-cut-mvp-linux-x64/dock-launch.sh')) {
    return 'the dock entry does not launch the packaged runner';
  }
  if (!desktopEntry.includes('ROUGH_CUT_DOCK_LAUNCH=1') && !desktopEntry.includes('/dock-launch.sh')) {
    return 'the installed dock entry does not stamp its launch provenance';
  }
  const dockError = validateDockProvenance(review.dock);
  if (dockError) return dockError;
  const pinnedDockError = validatePinnedDockEntry(review.dock);
  if (pinnedDockError) return pinnedDockError;
  if (changedFreecutUiFiles(paths)) {
    const sourceError = validateSharedEditorSource(context.root, paths);
    if (sourceError) return sourceError;
    const sharedError = validateSharedEditorEvidence(review.sharedEditor);
    if (sharedError) return sharedError;
    return validateRuntimeEvidence(review.runtimeEvidence);
  }
  return null;
}

export function validateUiVisualProof(root) {
  const paths = changedUiFiles(root);
  if (paths.length === 0) return { ok: true, reason: 'no changed UI files' };
  const markerPath = join(root, VISUAL_PROOF_MARKER);
  if (!existsSync(markerPath)) {
    return { ok: false, reason: 'UI changed without a recorded visual review' };
  }
  let proof;
  try {
    proof = JSON.parse(readFileSync(markerPath, 'utf8'));
  } catch {
    return { ok: false, reason: 'the visual review record is unreadable' };
  }
  if (proof.version !== VISUAL_PROOF_VERSION) {
    return { ok: false, reason: 'the visual review record is outdated; record a v4 proof' };
  }
  const fingerprint = uiFingerprint(root, paths);
  if (proof.uiFingerprint !== fingerprint || JSON.stringify(proof.changedUiFiles) !== JSON.stringify(paths)) {
    return { ok: false, reason: 'UI source changed after the last visual review' };
  }
  const packagedFingerprint = packagedUiFingerprint(root);
  if (!packagedFingerprint) {
    return { ok: false, reason: 'the current packaged dock app is missing; package it before review' };
  }
  if (proof.packagedUiFingerprint !== packagedFingerprint) {
    return { ok: false, reason: 'the packaged dock app does not match the reviewed UI source' };
  }
  if (!proof.screenshotPath || !existsSync(proof.screenshotPath)) {
    return { ok: false, reason: 'the reviewed screenshot no longer exists' };
  }
  if (proof.screenshotSha256 !== fileSha256(proof.screenshotPath)) {
    return { ok: false, reason: 'the reviewed screenshot does not match its recorded hash' };
  }
  const reviewError = validateReviewArtifact(proof.review, paths, { root, screenshotPath: proof.screenshotPath, packagedFingerprint });
  if (reviewError) {
    return { ok: false, reason: reviewError };
  }
  if (statSync(proof.screenshotPath).mtimeMs < latestMtime(paths)) {
    return { ok: false, reason: 'the screenshot predates the current UI source' };
  }
  return { ok: true, reason: 'fresh dock-launched visual review matches current UI source and package', proof };
}

export function isVisualProofArmed(root) {
  return existsSync(join(root, VISUAL_PROOF_ARM_MARKER));
}
