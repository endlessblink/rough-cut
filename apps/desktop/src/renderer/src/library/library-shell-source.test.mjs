import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

test('Projects view exposes naming for new projects and context-menu rename', async () => {
  const source = await readFile(join(here, 'library-shell.tsx'), 'utf8');

  assert.match(source, /setNewProjectDialogOpen\(true\)/);
  assert.match(source, /<ProjectNameDialog[\s\S]*title="New empty project"[\s\S]*actionLabel="Create"/);
  assert.match(source, /handleContextRename/);
  assert.match(source, /\{ id: 'rename', label: 'Rename'/);
  assert.match(source, /title="Rename project"/);
});
