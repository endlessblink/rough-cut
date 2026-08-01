import { resolve } from 'node:path';
import { validateUiVisualProof } from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const result = validateUiVisualProof(root);
if (!result.ok) {
  process.stderr.write(`Visual proof failed: ${result.reason}\n`);
  process.exit(1);
}
process.stdout.write(`Visual proof passed: ${result.reason}.\n`);
