import { resolve } from 'node:path';
import { isVisualProofArmed, validateUiVisualProof } from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const cwd = resolve(process.cwd());
if (cwd !== root && !cwd.startsWith(`${root}/`)) process.exit(0);

if (!isVisualProofArmed(root)) {
  process.exit(0);
}

const result = validateUiVisualProof(root);
if (result.ok) process.exit(0);

const reason = [
  `Visual proof blocked — failed: ${result.reason}.`,
  'Why: proof must match the current UI source, packaged app, screenshot, and full checklist.',
  'Fix: launch the packaged Rough Cut from the dock, capture and inspect a screenshot, then run',
  'node scripts/record-ui-visual-proof.mjs <screenshot> <review.json>',
].join(' ');

process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
