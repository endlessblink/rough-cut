import { existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VISUAL_PROOF_MARKER,
  changedUiFiles,
  fileSha256,
  packagedUiFingerprint,
  validateFindings,
  uiFingerprint,
} from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const screenshotPath = process.argv[2] ? resolve(process.argv[2]) : '';
const findings = process.argv.slice(3).join(' ').trim();

if (!screenshotPath || findings.length < 12) {
  throw new Error('Usage: node scripts/record-ui-visual-proof.mjs <screenshot> <visual findings>');
}
if (!existsSync(screenshotPath)) throw new Error(`Screenshot does not exist: ${screenshotPath}`);
validateFindings(findings);

const paths = changedUiFiles(root);
const packagedFingerprint = packagedUiFingerprint(root);
if (!packagedFingerprint) throw new Error('Package the dock-launched app before recording visual proof.');
const proof = {
  version: 2,
  reviewedAt: new Date().toISOString(),
  reviewer: process.env.ROUGH_CUT_VISUAL_REVIEWER || 'visual-subagent',
  reviewMode: 'dock-launched',
  screenshotPath,
  screenshotSha256: fileSha256(screenshotPath),
  screenshotMtimeMs: statSync(screenshotPath).mtimeMs,
  uiFingerprint: uiFingerprint(root, paths),
  packagedUiFingerprint: packagedFingerprint,
  changedUiFiles: paths,
  findings,
};

writeFileSync(resolve(root, VISUAL_PROOF_MARKER), `${JSON.stringify(proof, null, 2)}\n`);
process.stdout.write(`Recorded visual proof for ${paths.length} changed UI files.\n`);
