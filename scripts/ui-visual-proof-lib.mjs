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
      || path === 'apps/desktop/src/main/index.mjs'
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

function validateLinkedBoundaryEvidence(linkedBoundary, context) {
  if (!linkedBoundary || linkedBoundary.verdict !== 'pass' || typeof linkedBoundary.evidence !== 'string' || linkedBoundary.evidence.trim().length < 12) {
    return 'the linked-boundary review is not an evidenced pass';
  }
  if (typeof linkedBoundary.selectedScreenClipId !== 'string' || linkedBoundary.selectedScreenClipId.length === 0) {
    return 'linked-boundary evidence has no selected SCREEN clip identity';
  }
  if (linkedBoundary.renderedScreenCount !== 2 || linkedBoundary.renderedAudioCount !== 2
    || !Array.isArray(linkedBoundary.renderedScreenClipIds) || linkedBoundary.renderedScreenClipIds.length !== 2
    || !Array.isArray(linkedBoundary.renderedAudioClipIds) || linkedBoundary.renderedAudioClipIds.length !== 2
    || !Number.isFinite(linkedBoundary.boundaryFrame)
    || !Number.isFinite(linkedBoundary.screenBoundaryX) || !Number.isFinite(linkedBoundary.audioBoundaryX)
    || !Number.isFinite(linkedBoundary.boundaryErrorPx) || linkedBoundary.boundaryErrorPx > 0.5) {
    return 'linked-boundary evidence does not prove equal rendered edge pixels';
  }
  if (!Array.isArray(linkedBoundary.renderedRanges) || linkedBoundary.renderedRanges.length !== 2
    || linkedBoundary.renderedRanges.some((range) => (
      range.audioId !== `audio:${range.screenId}`
      || !Number.isFinite(range.screenIn) || !Number.isFinite(range.audioIn)
      || !Number.isFinite(range.screenOut) || !Number.isFinite(range.audioOut)
      || range.screenIn !== range.audioIn || range.screenOut !== range.audioOut
    ))) {
    return 'linked-boundary evidence does not prove paired equal rendered ranges';
  }
  const repeated = linkedBoundary.repeatedCutEvidence;
  if (!repeated || repeated.linkedLaneStatus !== 'pass' || repeated.linkedLaneMismatchCount !== 0
    || !Array.isArray(repeated.screen) || repeated.screen.length < 3
    || !Array.isArray(repeated.audio) || repeated.audio.length !== repeated.screen.length) {
    return 'linked-boundary evidence does not prove repeated linked cuts';
  }
  const painted = linkedBoundary.paintedBoundaryEvidence;
  if (!painted || !Array.isArray(painted.boundaries) || painted.boundaries.length < 2
    || !Number.isFinite(painted.threshold)
    || painted.boundaries.some((boundary) => (
      !Number.isFinite(boundary.x)
      || !Number.isFinite(boundary.screenScore)
      || !Number.isFinite(boundary.audioScore)
      || boundary.screenScore < painted.threshold
      || boundary.audioScore < painted.threshold
    ))) {
    return 'linked-boundary evidence does not prove painted SCREEN/AUDIO pixels match';
  }
  if (typeof linkedBoundary.repeatedBoundaryCloseupScreenshotPath !== 'string'
    || typeof linkedBoundary.repeatedBoundaryCloseupScreenshotSha256 !== 'string'
    || linkedBoundary.repeatedBoundaryCloseupScreenshotSha256.length !== 64) {
    return 'linked-boundary evidence has no complete repeated-boundary close-up screenshot';
  }
  const repeatedAudioByScreenId = new Map(repeated.audio.map((clip) => [
    clip.id?.startsWith('audio:') ? clip.id.slice('audio:'.length) : clip.id,
    clip,
  ]));
  const repeatedMismatch = repeated.screen.some((screenClip, index) => {
    const audioClip = repeatedAudioByScreenId.get(screenClip.id);
    if (!audioClip) return true;
    const rangeMismatch = screenClip.timelineIn !== audioClip.timelineIn || screenClip.timelineOut !== audioClip.timelineOut;
    const edgeMismatch = Math.abs(screenClip.left - audioClip.left) > 0.5 || Math.abs(screenClip.right - audioClip.right) > 0.5;
    const markerMismatch = index > 0 && (!Number.isFinite(screenClip.boundaryFrame)
      || screenClip.boundaryFrame !== audioClip.boundaryFrame);
    return rangeMismatch || edgeMismatch || markerMismatch;
  });
  if (repeatedMismatch) return 'repeated linked-boundary evidence contains a SCREEN/AUDIO mismatch';
  if (typeof linkedBoundary.repeatedBoundaryScreenshotPath !== 'string' || !existsSync(linkedBoundary.repeatedBoundaryScreenshotPath)
    || linkedBoundary.repeatedBoundaryScreenshotSha256 !== fileSha256(linkedBoundary.repeatedBoundaryScreenshotPath)) {
    return 'repeated linked-boundary screenshot is missing or has a bad hash';
  }
  if (typeof linkedBoundary.screenshotPath !== 'string' || !existsSync(linkedBoundary.screenshotPath)) {
    return 'linked-boundary screenshot is missing';
  }
  if (linkedBoundary.screenshotSha256 !== fileSha256(linkedBoundary.screenshotPath)) {
    return 'linked-boundary screenshot hash does not match';
  }
  if (typeof linkedBoundary.boundaryZoomScreenshotPath !== 'string' || !existsSync(linkedBoundary.boundaryZoomScreenshotPath)
    || linkedBoundary.boundaryZoomScreenshotSha256 !== fileSha256(linkedBoundary.boundaryZoomScreenshotPath)) {
    return 'zoomed linked-boundary screenshot is missing or has a bad hash';
  }
  if (typeof linkedBoundary.interactionReportPath !== 'string' || !existsSync(linkedBoundary.interactionReportPath)) {
    return 'linked-boundary interaction report is missing';
  }
  let interactionReport;
  try { interactionReport = JSON.parse(readFileSync(linkedBoundary.interactionReportPath, 'utf8')); } catch { return 'linked-boundary interaction report is unreadable'; }
  if (linkedBoundary.interactionReportSha256 !== fileSha256(linkedBoundary.interactionReportPath)) {
    return 'linked-boundary interaction report hash does not match';
  }
  const reportEvidence = interactionReport.renderedCutEvidence;
  if (!reportEvidence
    || reportEvidence.selectedScreenClipId !== linkedBoundary.selectedScreenClipId
    || reportEvidence.boundaryFrame !== linkedBoundary.boundaryFrame
    || reportEvidence.renderedScreenCount !== linkedBoundary.renderedScreenCount
    || reportEvidence.renderedAudioCount !== linkedBoundary.renderedAudioCount
    || reportEvidence.screenBoundaryX !== linkedBoundary.screenBoundaryX
    || reportEvidence.audioBoundaryX !== linkedBoundary.audioBoundaryX
    || reportEvidence.boundaryErrorPx !== linkedBoundary.boundaryErrorPx
    || JSON.stringify(reportEvidence.renderedRanges) !== JSON.stringify(linkedBoundary.renderedRanges)
    || JSON.stringify(reportEvidence.repeatedCutEvidence) !== JSON.stringify(linkedBoundary.repeatedCutEvidence)) {
    return 'linked-boundary proof is not bound to the interaction report';
  }
  if (JSON.stringify(reportEvidence.paintedBoundaryEvidence) !== JSON.stringify(linkedBoundary.paintedBoundaryEvidence)) {
    return 'painted linked-boundary proof is not bound to the interaction report';
  }
  if (reportEvidence.repeatedBoundaryCloseupScreenshotPath !== linkedBoundary.repeatedBoundaryCloseupScreenshotPath
    || reportEvidence.repeatedBoundaryCloseupScreenshotSha256 !== linkedBoundary.repeatedBoundaryCloseupScreenshotSha256) {
    return 'repeated linked-boundary close-up is not bound to the interaction report';
  }
  if (context.screenshotPath && linkedBoundary.screenshotPath !== context.screenshotPath) {
    return 'linked-boundary evidence is bound to a different screenshot';
  }
  return null;
}

function validateDockProvenance(dock, root, { historicalProof = false } = {}) {
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
  if (!Number.isInteger(provenance.pid) || provenance.pid < 1 || (!historicalProof && !existsSync(`/proc/${provenance.pid}`))) {
    return 'the dock provenance does not point to a live packaged process';
  }
  if (typeof provenance.executable !== 'string' || !existsSync(provenance.executable)) {
    return 'the dock provenance executable is not live';
  }
  if (dock.launchExecutable !== provenance.executable) {
    return 'the review is not bound to the current packaged executable';
  }
  if (root) {
    const identityPath = join(root, 'dist', 'rough-cut-mvp-linux-x64', 'resources', 'app', 'package-identity.json');
    if (!existsSync(identityPath)) return 'the packaged app has no package identity';
    let currentIdentity;
    try { currentIdentity = JSON.parse(readFileSync(identityPath, 'utf8')); } catch { return 'the package identity is unreadable'; }
    if (JSON.stringify(provenance.packageIdentity) !== JSON.stringify(currentIdentity)) {
      return 'the dock-launched process is running a stale packaged bundle';
    }
    if (!Date.parse(provenance.startedAt) || !Date.parse(currentIdentity.packagedAt)
      || Date.parse(provenance.startedAt) < Date.parse(currentIdentity.packagedAt)) {
      return 'the dock-launched process predates the current package';
    }
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
  const needsLinkedBoundaryEvidence = paths.some((path) => path === 'apps/desktop/src/renderer/src/main.tsx' || path === 'apps/desktop/src/renderer/src/timeline-rail.mjs');
  if (needsLinkedBoundaryEvidence) {
    const linkedBoundaryError = validateLinkedBoundaryEvidence(review.linkedBoundary, context);
    if (linkedBoundaryError) return linkedBoundaryError;
  }
  if (
    !review.capture
    || !['full-desktop', 'app-window'].includes(review.capture.surface)
    || review.capture.appWindowVisible !== true
    || (review.capture.surface === 'full-desktop' && review.capture.dockVisible !== true)
  ) {
    return 'the review must use a full-desktop capture with the dock or a PID-matched packaged app-window capture';
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
  if (context.historicalProof === true && review.dock.liveProcessObserved !== true) {
    return 'historical dock proof does not record a live packaged process observation';
  }
  const dockError = validateDockProvenance(review.dock, context.root, { historicalProof: context.historicalProof === true });
  if (dockError) return dockError;
  const pinnedDockError = validatePinnedDockEntry(review.dock);
  if (pinnedDockError) return pinnedDockError;
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
  const reviewError = validateReviewArtifact(proof.review, paths, { root, screenshotPath: proof.screenshotPath, packagedFingerprint, historicalProof: true });
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
