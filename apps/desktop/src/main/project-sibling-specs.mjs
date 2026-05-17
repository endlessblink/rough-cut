// Canonical sibling files a saved project may have on disk. Two patterns:
//   - APPEND: live at `${projectPath}<suffix>` — `.roughcut.bak`, `.roughcut.tmp`
//   - REPLACE: live at `${stem}<suffix>` (stem = projectPath without `.roughcut`)
//       — `<stem>.mp4`, `<stem>.mkv`, `<stem>.thumb.jpg`, `<stem>.cursor.json`,
//         `<stem>.events.log`
//
// Single source of truth shared by `deleteProjectFiles` (project-gallery.mjs)
// and `duplicateProjectFile` (project-files.mjs) so the two operations can
// never drift on which files belong to a project.
export const PROJECT_SIBLING_SPECS = [
  { kind: 'append', suffix: '.bak' },
  { kind: 'append', suffix: '.tmp' },
  { kind: 'replace', suffix: '.thumb.jpg' },
  { kind: 'replace', suffix: '.mp4' },
  { kind: 'replace', suffix: '.mkv' },
  { kind: 'replace', suffix: '.cursor.json' },
  { kind: 'replace', suffix: '.events.log' },
];

import { basename, dirname, join } from 'node:path';

// Given a project's `.roughcut` path and a sibling spec, return where the
// sibling lives on disk.
export function siblingPathFor(projectPath, spec, projectFileExtension) {
  if (spec.kind === 'append') return `${projectPath}${spec.suffix}`;
  const stem = basename(projectPath).replace(
    new RegExp(`${escapeRegExp(projectFileExtension)}$`, 'i'),
    '',
  );
  return join(dirname(projectPath), `${stem}${spec.suffix}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
