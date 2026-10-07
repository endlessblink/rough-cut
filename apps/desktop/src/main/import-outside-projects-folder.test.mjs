import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickImportProjectPath, validateProjectPath } from './project-files.mjs';

const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), 'index.mjs'), 'utf8');

// Beta.8 regression: Import creates the .roughcut next to the source video, but project:open-path
// only allowed the projects folder, so importing from anywhere else ended in
// "Project path is outside the allowed projects directory" and the project never opened.
test('an import project beside the source is outside the default roots until its folder is trusted', async () => {
  const recordingsDir = await mkdtemp(join(tmpdir(), 'rc-projects-'));
  const sourceDir = await mkdtemp(join(tmpdir(), 'rc-videos-'));
  const importedFilePath = join(sourceDir, 'clip.mp4');
  await writeFile(importedFilePath, '');
  const projectPath = await pickImportProjectPath({ importedFilePath, recordingsDir });
  assert.equal(dirname(projectPath), sourceDir);
  assert.throws(() => validateProjectPath(projectPath, { allowedRoots: [recordingsDir] }), /outside the allowed projects directory/);
  assert.equal(validateProjectPath(projectPath, { allowedRoots: [recordingsDir, dirname(projectPath)] }), projectPath);
});

test('main process trusts the folder of an imported or user-opened project', () => {
  assert.match(source, /const trustedProjectDirs = new Set\(\)/);
  assert.match(source, /\.\.\.trustedProjectDirs/);
  const openHandler = source.slice(source.indexOf('IPC_CHANNELS.PROJECT_OPEN,'), source.indexOf('IPC_CHANNELS.LIBRARY_PICK_IMPORT_FILE'));
  assert.match(openHandler, /trustProjectFolder\(safePath\)/);
  const importHandler = source.slice(source.indexOf('IPC_CHANNELS.LIBRARY_CREATE_FROM_IMPORT'), source.indexOf('IPC_CHANNELS.LIBRARY_CREATE_BLANK_PROJECT'));
  assert.match(importHandler, /trustProjectFolder\(saved\.path\)/);
});
