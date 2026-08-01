import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const VISUAL_PROOF_MARKER = '.git/rough-cut-ui-visual-proof.json';
export const VISUAL_PROOF_ARM_MARKER = '.git/rough-cut-ui-visual-proof-arm.json';
export const VISUAL_PROOF_VERSION = 2;
export const UI_PROOF_CHECKLIST = [
  'dock=pass', 'shell=pass', 'layout=pass', 'media=pass', 'playback=pass',
  'effects=pass', 'timeline=pass', 'no-blank=pass', 'no-overlap=pass', 'scope=pass',
];

export function isUiPath(path) {
  return (
    (path.startsWith('apps/desktop/src/renderer/src/') || path.startsWith('vendor/freecut/src/'))
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

function missingChecklist(findings) {
  return UI_PROOF_CHECKLIST.filter((item) => !findings.includes(item));
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
    return { ok: false, reason: 'the visual review record is outdated; record a v2 proof' };
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
  if (typeof proof.findings !== 'string' || proof.findings.trim().length < 12) {
    return { ok: false, reason: 'the visual review has no meaningful findings' };
  }
  if (proof.reviewer !== 'visual-subagent' || proof.reviewMode !== 'dock-launched') {
    return { ok: false, reason: 'the proof was not identified as a dock-launched visual-subagent review' };
  }
  const missing = missingChecklist(proof.findings);
  if (missing.length > 0) {
    return { ok: false, reason: `the visual review is missing checklist results: ${missing.join(', ')}` };
  }
  if (statSync(proof.screenshotPath).mtimeMs < latestMtime(paths)) {
    return { ok: false, reason: 'the screenshot predates the current UI source' };
  }
  return { ok: true, reason: 'fresh dock-launched visual review matches current UI source and package', proof };
}

export function validateFindings(findings) {
  const missing = missingChecklist(findings);
  if (missing.length > 0) throw new Error(`Visual proof findings must include: ${missing.join(', ')}`);
}

export function isVisualProofArmed(root) {
  return existsSync(join(root, VISUAL_PROOF_ARM_MARKER));
}
