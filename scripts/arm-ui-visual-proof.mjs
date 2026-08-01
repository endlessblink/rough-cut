import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VISUAL_PROOF_ARM_MARKER } from './ui-visual-proof-lib.mjs';

const root = resolve(import.meta.dirname, '..');
writeFileSync(resolve(root, VISUAL_PROOF_ARM_MARKER), `${JSON.stringify({
  armedAt: new Date().toISOString(),
  reason: 'completion review',
}, null, 2)}\n`);
process.stdout.write('Visual proof gate armed for completion.\n');
