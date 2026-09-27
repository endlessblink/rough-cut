import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateUiVisualProof } from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const expected = 'I visually confirmed the exact packaged app after the automated checks passed.';
if (process.argv.slice(2).join(' ') !== expected) {
  throw new Error(`Type this exact confirmation after inspecting the app:\n${expected}`);
}

const proof = validateUiVisualProof(root);
if (!proof.ok) throw new Error(`Cannot confirm before visual proof passes: ${proof.reason}`);

writeFileSync(resolve(root, '.git/rough-cut-user-visual-confirmation.json'), `${JSON.stringify({
  confirmedBy: 'user',
  visualCheck: 'passed',
  confirmedAt: new Date().toISOString(),
  screenshotPath: proof.proof?.screenshotPath ?? null,
}, null, 2)}\n`);
process.stdout.write('User visual confirmation recorded.\n');
