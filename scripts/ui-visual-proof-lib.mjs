import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const VISUAL_PROOF_MARKER = '.git/rough-cut-ui-visual-proof.json';

export function isUiPath(path) {
  return path.startsWith('apps/desktop/src/renderer/src/')
    && /\.(?:css|mjs|ts|tsx)$/.test(path);
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
  const fingerprint = uiFingerprint(root, paths);
  if (proof.uiFingerprint !== fingerprint) {
    return { ok: false, reason: 'UI source changed after the last visual review' };
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
  return { ok: true, reason: 'fresh visual review matches current UI source', proof };
}
