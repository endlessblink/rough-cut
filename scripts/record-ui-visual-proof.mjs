import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VISUAL_PROOF_MARKER,
  changedUiFiles,
  fileSha256,
  uiFingerprint,
} from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const screenshotPath = process.argv[2] ? resolve(process.argv[2]) : '';
const findings = process.argv.slice(3).join(' ').trim();

if (!screenshotPath || findings.length < 12) {
  throw new Error('Usage: node scripts/record-ui-visual-proof.mjs <screenshot> <visual findings>');
}

const paths = changedUiFiles(root);
const proof = {
  reviewedAt: new Date().toISOString(),
  screenshotPath,
  screenshotSha256: fileSha256(screenshotPath),
  uiFingerprint: uiFingerprint(root, paths),
  changedUiFiles: paths,
  findings,
};

writeFileSync(resolve(root, VISUAL_PROOF_MARKER), `${JSON.stringify(proof, null, 2)}\n`);
process.stdout.write(`Recorded visual proof for ${paths.length} changed UI files.\n`);
