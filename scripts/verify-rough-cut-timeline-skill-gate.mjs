import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const skillPath = join(root, '.agents/skills/rough-cut-editor-fundamentals/SKILL.md');
const text = readFileSync(skillPath, 'utf8');
const required = [
  ['researched NLE model', '## Research-derived model'],
  ['$sure checkpoint', 'Run `$sure`'],
  ['linked audio contract', 'linked audio'],
  ['hard non-overlap contract', 'must never intersect or paint over'],
  ['scenario matrix', 'complete focused scenario matrix'],
  ['fresh visual proof boundary', 'fresh dock-launched screenshot'],
  ['unverified boundary', 'UNVERIFIED'],
];
const references = [
  'https://support.apple.com/guide/final-cut-pro/arrange-clips-in-the-timeline-verc147f195/mac',
  'https://support.apple.com/en-lamr/guide/final-cut-pro/ver7a77ef9e/mac',
  'https://helpx.adobe.com/uk/premiere/desktop/add-audio-effects/basic-audio-editing/link-audio-video-clips.html',
  'https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-ripple-edits.html',
  'https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-10-Reference-Manual.pdf',
];
const failures = required.filter(([, phrase]) => !text.includes(phrase)).map(([name]) => `missing rule: ${name}`);
for (const url of references) if (!text.includes(url)) failures.push(`missing research reference: ${url}`);
if (text.length > 24000) failures.push('skill is too large for reliable progressive loading');
if (failures.length) {
  console.error(`Rough Cut timeline skill gate failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Rough Cut timeline skill gate: HIGH');
