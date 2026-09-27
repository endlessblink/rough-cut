import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = readFileSync(join(root, 'apps/desktop/src/renderer/src/main.tsx'), 'utf8');
const styles = readFileSync(join(root, 'apps/desktop/src/renderer/src/styles.css'), 'utf8');
const fundamentals = join(root, '.agents/skills/rough-cut-editor-fundamentals/SKILL.md');
const impeccable = '/home/endlessblink/.agents/skills/impeccable/SKILL.md';
const skillText = readFileSync(fundamentals, 'utf8');
const failures = [];

if (!existsSync(fundamentals)) failures.push('rough-cut editor fundamentals skill is missing');
if (!existsSync(impeccable)) failures.push('Impeccable design skill is missing');
for (const rule of ['Run `$sure`', 'visible gap', 'linked audio', 'complete focused scenario matrix', 'fresh dock-launched screenshot']) {
  if (!skillText.includes(rule)) failures.push(`fundamentals skill rule missing: ${rule}`);
}
for (const contract of [
  ['timeline is seekable', 'className="visualTimeline"'],
  ['selected clip has explicit trim handles', 'className={`trimHandle trimHandleStart'],
  ['audio is linked to screen clip identity', 'data-recording-audio-clip-id={region.id}'],
  ['non-selected trim handles are inert', '.clipBar:not(.selectedClip) .trimHandle'],
  ['selected clip has a visible focus treatment', '.clipBar.selectedClip'],
]) {
  const haystack = contract[0].includes('handles') || contract[0].includes('treatment') ? styles + source : source + styles;
  if (!haystack.includes(contract[1])) failures.push(`design contract missing: ${contract[0]}`);
}

if (failures.length > 0) {
  console.error(`Recording editor design gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Recording editor design gate: HIGH');
