import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectForRecording } from './project-files.mjs';
import { buildCursorAss, buildStyledExportArgs, exportProjectToMp4, isSingleUneditedRecording, normalizeExportMode } from './export-service.mjs';

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
  assert(joined.includes('crop=iw*1:ih*1'));
  assert(joined.includes('force_original_aspect_ratio=decrease'));
  assert(joined.includes('geq=r='));
  assert(joined.includes('boxblur=58:5'));
  assert(joined.includes('studio-demo'));
  assert(args.includes('/tmp/source.mp4'));
  assert.equal(args.at(-1), '/tmp/export.mp4');
});

test('styled export args include cursor subtitle layer when provided', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    cursorAssPath: '/tmp/cursor.ass',
  });
  const joined = args.join(' ');

  assert(joined.includes('[0:v]setpts=PTS-STARTPTS[base]'));
  assert(joined.includes('[base]subtitles=/tmp/cursor.ass[with_cursor]'));
  assert(joined.includes('[with_cursor]crop=iw*1:ih*1'));
});

test('styled export args swap crop+scale for zoompan when zoom markers are present', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 30,
    zoomMarkers: [
      {
        id: 'm1',
        startFrame: 30,
        endFrame: 90,
        kind: 'manual',
        strength: 1,
        focalPoint: { x: 0.5, y: 0.5 },
        zoomInDuration: 9,
        zoomOutDuration: 9,
      },
    ],
  });
  const joined = args.join(' ');

  assert(joined.includes('zoompan=z='));
  assert(joined.includes(':d=1:s=1280x720:fps=30'));
  assert(joined.includes('force_original_aspect_ratio=decrease'));
  assert(!joined.includes('crop=iw*1:ih*1'));
});

test('styled export args pin nullsrc rate to source fps so the canvas matches input rate', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 60,
  });
  const joined = args.join(' ');

  assert(joined.includes('nullsrc=s=1920x1080:r=60'));
});

test('styled export args keep static crop+scale when no zoom markers', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    zoomMarkers: [],
  });
  const joined = args.join(' ');

  assert(joined.includes('crop=iw*1:ih*1'));
  assert(!joined.includes('zoompan='));
});

test('cursor ASS layer interpolates movement and limits dense telemetry', () => {
  const events = Array.from({ length: 500 }, (_value, index) => ({ frame: index, x: index, y: index, type: 'move', button: 0 }));
  const ass = buildCursorAss({ cursorEvents: events, width: 1280, height: 720, fps: 30, maxEvents: 100 });

  assert(ass.includes('PlayResX: 1280'));
  assert(ass.includes('PlayResY: 720'));
  assert(ass.includes('\\move(0,0,5,5,0,167)'));
  assert(ass.includes('m 0 0 l 0 26'));
  assert.equal((ass.match(/^Dialogue:/gm) ?? []).length, 100);
});

test('cursor ASS layer passes off-screen positions through so cursor disappears past the edge', () => {
  const ass = buildCursorAss({
    cursorEvents: [
      { frame: 0, x: 1900, y: 360, type: 'move', button: 0 },
      { frame: 30, x: 2400, y: 360, type: 'move', button: 0 },
    ],
    width: 1920,
    height: 1080,
    fps: 30,
  });

  // Anchor must be at the recorded position, not clamped to (width - cursorExtent).
  assert(ass.includes('\\move(1900,360,2400,360'));
  assert(!ass.includes('1892'));
});

test('cursor ASS layer passes negative coordinates through (cursor on a left-side monitor)', () => {
  const ass = buildCursorAss({
    cursorEvents: [
      { frame: 0, x: -50, y: 200, type: 'move', button: 0 },
      { frame: 30, x: 100, y: 200, type: 'move', button: 0 },
    ],
    width: 1920,
    height: 1080,
    fps: 30,
  });

  assert(ass.includes('\\move(-50,200,100,200'));
});

test('cursor ASS layer keeps final cursor visible through recording end', () => {
  const ass = buildCursorAss({
    cursorEvents: [{ frame: 12, x: 640, y: 360, type: 'move', button: 0 }],
    width: 1280,
    height: 720,
    fps: 30,
    durationFrames: 90,
  });

  assert(ass.includes('Dialogue: 0,0:00:00.40,0:00:03.00'));
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
