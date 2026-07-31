import { resolve } from 'node:path';
import { validateUiVisualProof } from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const cwd = resolve(process.cwd());
if (cwd !== root && !cwd.startsWith(`${root}/`)) process.exit(0);

const result = validateUiVisualProof(root);
if (result.ok) process.exit(0);

const reason = [
  `Visual proof gate blocked completion: ${result.reason}.`,
  'Capture the live Rough Cut window, inspect it with a visual subagent, then run:',
  'node scripts/record-ui-visual-proof.mjs <screenshot-path> "<findings>"',
].join(' ');

process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
