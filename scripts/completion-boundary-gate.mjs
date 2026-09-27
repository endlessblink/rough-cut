import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateUiVisualProof } from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const confirmationPath = resolve(root, '.git/rough-cut-user-visual-confirmation.json');
const proof = validateUiVisualProof(root);

if (!proof.ok) {
  process.stdout.write(JSON.stringify({ state: 'AUTOMATED_PROOF_PENDING', reason: proof.reason }) + '\n');
  process.exit(1);
}

if (!existsSync(confirmationPath)) {
  process.stdout.write(JSON.stringify({
    state: 'READY_FOR_USER_VISUAL_CONFIRMATION',
    instruction: 'Inspect the exact packaged dock-launched app and record confirmation only after the visible check passes.',
    screenshotPath: proof.proof?.screenshotPath ?? null,
  }) + '\n');
  process.exit(2);
}

let confirmation;
try {
  confirmation = JSON.parse(readFileSync(confirmationPath, 'utf8'));
} catch {
  process.stdout.write(JSON.stringify({ state: 'USER_CONFIRMATION_INVALID', reason: 'confirmation record is unreadable' }) + '\n');
  process.exit(1);
}

if (confirmation.confirmedBy !== 'user' || confirmation.visualCheck !== 'passed' || typeof confirmation.confirmedAt !== 'string') {
  process.stdout.write(JSON.stringify({ state: 'USER_CONFIRMATION_INVALID', reason: 'confirmation must be user-recorded after a passed visual check' }) + '\n');
  process.exit(1);
}

process.stdout.write(JSON.stringify({ state: 'COMPLETE', confirmedAt: confirmation.confirmedAt }) + '\n');
