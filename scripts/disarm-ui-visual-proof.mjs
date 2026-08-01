import { unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { VISUAL_PROOF_ARM_MARKER } from './ui-visual-proof-lib.mjs';

const marker = resolve(import.meta.dirname, '..', VISUAL_PROOF_ARM_MARKER);
if (existsSync(marker)) unlinkSync(marker);
process.stdout.write('Visual proof gate disarmed until the next completion review.\n');
