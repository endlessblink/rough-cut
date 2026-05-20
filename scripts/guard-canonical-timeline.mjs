import { readFile } from 'node:fs/promises';

const checks = [
  {
    files: [
      'apps/desktop/src/renderer/src/nle/clip-mutations.mjs',
      'apps/desktop/src/renderer/src/nle/drag-session.mjs',
      'apps/desktop/src/renderer/src/nle/nle-timeline.tsx',
      'apps/desktop/src/renderer/src/nle/project-shape.mjs',
      'apps/desktop/src/renderer/src/nle/snap.mjs',
      'apps/desktop/src/renderer/src/nle/timeline-clips.mjs',
      'apps/desktop/src/renderer/src/nle/trim-session.mjs',
      'apps/desktop/src/renderer/src/main.tsx',
    ],
    patterns: [
      /composition\.tracks/g,
      /document\.tracks/g,
      /presentation\?\.cutRanges/g,
    ],
  },
];

const violations = [];
for (const check of checks) {
  for (const file of check.files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of check.patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(`${file}:${line}: active timeline code must not read ${match[0]} as truth`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.info('[guard-canonical-timeline] ok');
