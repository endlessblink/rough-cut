import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectForRecording } from './project-files.mjs';
import { buildStyledExportArgs, exportProjectToMp4, isSingleUneditedRecording, normalizeExportMode } from './export-service.mjs';

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

test('raw export mode keeps byte-for-byte copy behavior', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-export-mode-'));
  const sourcePath = join(root, 'source.mp4');
  const outputPath = join(root, 'exported.mp4');
  const sourceBytes = Buffer.from('raw mode copy bytes');
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

  const result = await exportProjectToMp4({ project, outputPath, mode: 'raw' });

  assert.equal(result.byteEqualCandidate, true);
  assert.deepEqual(await readFile(outputPath), sourceBytes);

  await rm(root, { recursive: true, force: true });
});

test('export mode validation accepts planned modes and rejects unknown modes', () => {
  assert.equal(normalizeExportMode(), 'raw');
  assert.equal(normalizeExportMode('raw'), 'raw');
  assert.equal(normalizeExportMode('styled'), 'styled');
  assert.throws(() => normalizeExportMode('other'), /Unsupported export mode/);
});

test('styled export mode uses the ffmpeg styled canvas path', async () => {
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

  await assert.rejects(() => exportProjectToMp4({ project, outputPath: '/tmp/export.mp4', mode: 'styled' }), /source.mp4/);
});

test('styled export args build a 16:9 canvas render command', () => {
  const args = buildStyledExportArgs({ inputPath: '/tmp/source.mp4', outputPath: '/tmp/export.mp4' });
  const joined = args.join(' ');

  assert(args.includes('-filter_complex'));
  assert(joined.includes('1920x1080'));
  assert(joined.includes('nullsrc'));
  assert(joined.includes('crop=iw*0.76:ih*0.76'));
  assert(joined.includes('force_original_aspect_ratio=decrease'));
  assert(joined.includes('geq=r='));
  assert(joined.includes('boxblur=58:5'));
  assert(joined.includes('studio-demo'));
  assert(args.includes('/tmp/source.mp4'));
  assert.equal(args.at(-1), '/tmp/export.mp4');
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
