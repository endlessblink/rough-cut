import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAsset,
  createLibrary,
  createProject,
  createProjectLibraryReference,
} from '../../packages/project-model/src/index.js';
import { test, expect } from './fixtures/electron-app.js';

test.describe('project relative paths', () => {
  test('saves portable media paths and resolves them after moving the project folder', async ({
    appPage,
  }) => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'rough-cut-relative-paths-'));
    const initialDir = join(tempRoot, 'initial');
    const movedDir = join(tempRoot, 'moved');
    const mediaDir = join(initialDir, 'media');
    const librariesDir = join(initialDir, 'libraries');
    const projectPath = join(initialDir, 'portable-project.roughcut');

    await mkdir(mediaDir, { recursive: true });
    await mkdir(librariesDir, { recursive: true });

    const recordingPath = join(mediaDir, 'recording.webm');
    const thumbnailPath = join(mediaDir, 'recording.jpg');
    const cursorEventsPath = join(mediaDir, 'recording.ndjson');
    const libraryPath = join(librariesDir, 'portable-library.roughcutlib');

    await writeFile(recordingPath, 'video');
    await writeFile(thumbnailPath, 'thumb');
    await writeFile(cursorEventsPath, '{"frame":0}\n');
    await writeFile(libraryPath, JSON.stringify({ version: 1, name: 'Portable Library' }), 'utf-8');

    const library = createLibrary('Portable Library');
    const asset = createAsset('recording', recordingPath, {
      thumbnailPath,
      metadata: {
        cursorEventsPath,
      },
    });
    const project = createProject({
      name: 'Portable Project',
      assets: [asset],
      libraryReferences: [createProjectLibraryReference(library, libraryPath)],
    });

    try {
      const saved = await appPage.evaluate(
        async ({ project, projectPath }) => {
          return (
            window as unknown as {
              roughcut: { projectSave: (project: unknown, filePath: string) => Promise<boolean> };
            }
          ).roughcut.projectSave(project, projectPath);
        },
        { project, projectPath },
      );

      expect(saved).toBe(true);

      const savedProject = JSON.parse(await readFile(projectPath, 'utf-8'));
      expect(savedProject.assets[0]?.filePath).toBe('media/recording.webm');
      expect(savedProject.assets[0]?.thumbnailPath).toBe('media/recording.jpg');
      expect(savedProject.assets[0]?.metadata?.cursorEventsPath).toBe('media/recording.ndjson');
      expect(savedProject.libraryReferences[0]?.filePath).toBe(
        'libraries/portable-library.roughcutlib',
      );

      await rename(initialDir, movedDir);

      const reopenedProjectPath = join(movedDir, 'portable-project.roughcut');
      const reopenedProject = await appPage.evaluate(async (filePath) => {
        return (
          window as unknown as { roughcut: { projectOpenPath: (filePath: string) => Promise<any> } }
        ).roughcut.projectOpenPath(filePath);
      }, reopenedProjectPath);

      expect(reopenedProject.assets[0]?.filePath).toBe(join(movedDir, 'media', 'recording.webm'));
      expect(reopenedProject.assets[0]?.thumbnailPath).toBe(
        join(movedDir, 'media', 'recording.jpg'),
      );
      expect(reopenedProject.assets[0]?.metadata?.cursorEventsPath).toBe(
        join(movedDir, 'media', 'recording.ndjson'),
      );
      expect(reopenedProject.libraryReferences[0]?.filePath).toBe(
        join(movedDir, 'libraries', 'portable-library.roughcutlib'),
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
