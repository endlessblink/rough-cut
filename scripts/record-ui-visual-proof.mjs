import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VISUAL_PROOF_MARKER,
  VISUAL_PROOF_VERSION,
  changedUiFiles,
  fileSha256,
  packagedUiFingerprint,
  validateReviewArtifact,
  uiFingerprint,
} from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const screenshotPath = process.argv[2] ? resolve(process.argv[2]) : '';
const reviewPath = process.argv[3] ? resolve(process.argv[3]) : '';

if (!screenshotPath || !reviewPath) {
  throw new Error('Usage: node scripts/record-ui-visual-proof.mjs <screenshot> <review.json>');
}
if (!existsSync(screenshotPath)) throw new Error(`Screenshot does not exist: ${screenshotPath}`);
if (!existsSync(reviewPath)) throw new Error(`Review artifact does not exist: ${reviewPath}`);

const paths = changedUiFiles(root);
const packagedFingerprint = packagedUiFingerprint(root);
if (!packagedFingerprint) throw new Error('Package the dock-launched app before recording visual proof.');
const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
const reviewError = validateReviewArtifact(review, paths, { root, screenshotPath, packagedFingerprint });
if (reviewError) throw new Error(`Invalid visual review artifact: ${reviewError}`);
const findings = Object.entries(review.checklist).map(([key, value]) => `${key}=${value.verdict}`).join(' ');
const proof = {
    version: VISUAL_PROOF_VERSION,
  reviewedAt: new Date().toISOString(),
  screenshotPath,
  screenshotSha256: fileSha256(screenshotPath),
  screenshotMtimeMs: statSync(screenshotPath).mtimeMs,
  uiFingerprint: uiFingerprint(root, paths),
  packagedUiFingerprint: packagedFingerprint,
  changedUiFiles: paths,
  review,
  findings,
};

writeFileSync(resolve(root, VISUAL_PROOF_MARKER), `${JSON.stringify(proof, null, 2)}\n`);
process.stdout.write(`Recorded visual proof for ${paths.length} changed UI files.\n`);
