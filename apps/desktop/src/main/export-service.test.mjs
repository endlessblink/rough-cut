import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectForRecording } from './project-files.mjs';
import { exportProjectToMp4, isSingleUneditedRecording } from './export-service.mjs';

test('unedited export copies source mp4 byte-for-byte', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-export-'));
  const sourcePath = join(root, 'source.mp4');
  const outputPath = join(root, 'exported.mp4');
  const sourceBytes = Buffer.from('fake mp4 bytes for deterministic copy test');
  await writeFile(sourcePath, sourceBytes);

  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: sourcePath,
      width: 1280,
      height: 720,
      fps: 30,
    },
  });
  const progress = [];

  const result = await exportProjectToMp4({
    project,
    outputPath,
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.outputPath, outputPath);
  assert.equal(result.byteEqualCandidate, true);
  assert.deepEqual(await readFile(outputPath), sourceBytes);
  assert.deepEqual(progress.map((event) => event.progress), [0, 1]);

  await rm(root, { recursive: true, force: true });
});

test('unedited export rejects edited projects', async () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
    },
  });
  const assetId = project.assets[0].id;
  const editedProject = {
    ...project,
    composition: {
      ...project.composition,
      tracks: [
        {
          ...project.composition.tracks[0],
          clips: [{ ...project.composition.tracks[0].clips[0], sourceIn: 3 }],
        },
      ],
    },
  };

  assert.equal(isSingleUneditedRecording(editedProject, assetId), false);
  await assert.rejects(
    () => exportProjectToMp4({ project: editedProject, outputPath: '/tmp/export.mp4' }),
    /Only unedited single-recording exports/,
  );
});
