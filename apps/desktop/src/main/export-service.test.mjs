import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectForRecording } from './project-files.mjs';
import { buildBackgroundExpression, buildCursorAss, buildRawTrimExportArgs, buildStyledExportArgs, exportProjectToMp4, isSingleTrimmedRecording, isSingleUneditedRecording, isSingleUneditedRecordingWithCamera, normalizeExportMode, parseFfmpegProgress } from './export-service.mjs';

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

test('raw trim export args cut to the persisted source frame range', () => {
  const args = buildRawTrimExportArgs({ inputPath: '/tmp/source.mp4', outputPath: '/tmp/export.mp4', startFrame: 30, endFrame: 120, fps: 30 });

  assert.deepEqual(args.slice(0, 7), ['-y', '-ss', '1', '-t', '3', '-i', '/tmp/source.mp4']);
  assert.deepEqual(args.slice(-5), ['-c', 'copy', '-movflags', '+faststart', '/tmp/export.mp4']);
});

test('single head/tail trimmed recording remains exportable', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:05.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
    },
  });
  const clip = project.composition.tracks[0].clips[0];
  const trimmed = {
    ...project,
    composition: {
      ...project.composition,
      duration: 90,
      tracks: [{ ...project.composition.tracks[0], clips: [{ ...clip, timelineIn: 0, timelineOut: 90, sourceIn: 30, sourceOut: 120 }] }],
    },
  };

  assert.equal(isSingleUneditedRecording(trimmed, project.assets[0].id), false);
  assert.equal(isSingleTrimmedRecording(trimmed, project.assets[0].id), true);
});

test('export rejects writing over the source recording', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-export-same-path-'));
  const sourcePath = join(root, 'source.mp4');
  await writeFile(sourcePath, Buffer.from('source bytes'));

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

  await assert.rejects(
    () => exportProjectToMp4({ project, outputPath: sourcePath, mode: 'styled' }),
    /Export output must be different from the source recording/,
  );

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

  assert(joined.includes('-progress pipe:1 -nostats'));
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

test('styled export args apply source trim before the main input', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceFps: 30,
    sourceTrimStartFrame: 45,
    sourceTrimEndFrame: 135,
  });

  assert.deepEqual(args.slice(args.indexOf('-ss'), args.indexOf('/tmp/source.mp4') + 1), ['-ss', '1.5', '-t', '3', '-i', '/tmp/source.mp4']);
});

test('styled export args remove middle cut ranges from output video', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceFps: 30,
    sourceTrimStartFrame: 30,
    sourceTrimEndFrame: 180,
    cutRanges: [{ id: 'cut-1', startFrame: 60, endFrame: 90 }],
  });
  const joined = args.join(' ');

  assert(joined.includes("select='not(between(n\\,30\\,59))'"));
  assert(joined.includes('setpts=N/FRAME_RATE/TB[base]'));
  assert(!args.includes('0:a?'));
  assert(args.includes('-an'));
});

test('ffmpeg progress parser maps out_time to normalized export progress', () => {
  assert.equal(parseFfmpegProgress('frame=10\nout_time_us=500000\nprogress=continue\n', 2), 0.25);
  assert.equal(parseFfmpegProgress('out_time_ms=3000000\n', 2), 1);
  assert.equal(parseFfmpegProgress('progress=continue\n', 2), null);
});

test('styled export args support a vertical canvas render command', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1080,
    height: 1920,
  });
  const joined = args.join(' ');

  assert(joined.includes('1080x1920'));
  assert(joined.includes('scale=888:1728:force_original_aspect_ratio=decrease'));
  assert(joined.includes('rough_cut_style=canvas:1080x1920:studio-demo'));
});

test('styled export args apply presentation padding, radius, and shadow controls', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    screenPadding: 160,
    screenCornerRadius: 44,
    screenShadowEnabled: true,
    screenShadowBlur: 72,
    screenShadowOpacity: 0.32,
    screenShadowOffsetY: 46,
  });
  const joined = args.join(' ');

  assert(joined.includes('scale=1600:760:force_original_aspect_ratio=decrease'));
  assert(joined.includes('boxblur=72:5'));
  assert(joined.includes('aa=0.32'));
  assert(joined.includes('overlay=(W-w)/2:(H-h)/2+46'));
  assert(joined.includes('hypot(44-X,44-Y)'));
});

test('styled export args apply preset background colors', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    backgroundStart: '#050816',
    backgroundEnd: '#101f3f',
  });
  const joined = args.join(' ');

  assert(joined.includes("r='5+11*X/W'"));
  assert(joined.includes("g='8+23*X/W'"));
  assert(joined.includes("b='22+41*X/W'"));
});

test('styled export args can use an exact background image', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    backgroundImagePath: '/tmp/backgrounds/dark-waves.png',
  });
  const joined = args.join(' ');

  assert(joined.includes('movie=/tmp/backgrounds/dark-waves.png'));
  assert(joined.includes('scale=1920:1080,format=rgba[bg_image]'));
  assert(!joined.includes('scale=1920:1080:force_original_aspect_ratio=increase'));
  assert(!joined.includes('crop=1920:1080'));
});

test('background expression falls back for invalid colors', () => {
  assert.equal(buildBackgroundExpression('bad', '#000000'), "r='232+8*X/W':g='235+-3*X/W':b='240+-8*X/W'");
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

test('styled export args overlay a camera input when provided', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    cameraInputPath: '/tmp/camera.mp4',
    cameraPresentation: { shape: 'circle', position: 'corner-br', roundness: 50, size: 100, visible: true },
  });
  const joined = args.join(' ');

  assert.deepEqual(args.slice(args.indexOf('/tmp/source.mp4') + 1, args.indexOf('/tmp/source.mp4') + 3), ['-i', '/tmp/camera.mp4']);
  assert(joined.includes('[1:v]setpts=PTS-STARTPTS'));
  assert(joined.includes('[with_screen][camera_rounded]overlay='));
  assert(joined.includes('format=yuv420p[v]'));
});

test('styled export args use a normalized cameraFrame override when provided', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    cameraInputPath: '/tmp/camera.mp4',
    cameraPresentation: { shape: 'circle', position: 'corner-br', roundness: 50, size: 100, visible: true },
    cameraFrame: { x: 0.1, y: 0.2, w: 0.25, h: 0.4 },
  });
  const joined = args.join(' ');

  // Override at 1920x1080 → x=192, y=216, w=480, h=432
  assert(joined.includes('scale=480:432:force_original_aspect_ratio=increase'));
  assert(joined.includes('crop=480:432'));
  assert(joined.includes('overlay=192:216:shortest=1'));
});

test('styled export args fall back to camera presentation when no normalized frame is set', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    cameraInputPath: '/tmp/camera.mp4',
    cameraPresentation: { shape: 'circle', position: 'corner-br', roundness: 50, size: 100, visible: true },
    cameraFrame: null,
  });
  const joined = args.join(' ');

  // Enum-derived corner-br placement at default size — should use the legacy formula
  assert(!joined.includes('overlay=192:216:'));
  assert(joined.includes('[with_screen][camera_rounded]overlay='));
});

test('styled export args trim camera pre-roll before overlay', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    cameraInputPath: '/tmp/camera.mp4',
    cameraSourceInFrames: 30,
  });
  const joined = args.join(' ');

  assert(joined.includes('[1:v]setpts=PTS-STARTPTS,trim=start_frame=30,setpts=PTS-STARTPTS,scale='));
});

test('styled export args use crop+sendcmd when a zoom layer is present', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 30,
    zoomCropFilter: 'crop=w=512:h=288:x=384:y=216',
    zoomSendcmdPath: '/tmp/zoom.cmd',
  });
  const joined = args.join(' ');

  assert(joined.includes('crop=w=512:h=288:x=384:y=216'));
  assert(joined.includes('sendcmd=f=/tmp/zoom.cmd'));
  assert(joined.includes('force_original_aspect_ratio=decrease'));
  assert(!joined.includes('zoompan='));
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

test('styled export args keep static crop+scale when no zoom layer', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
  });
  const joined = args.join(' ');

  assert(joined.includes('crop=iw*1:ih*1'));
  assert(!joined.includes('zoompan='));
  assert(!joined.includes('sendcmd='));
});

test('cursor ASS layer interpolates movement and limits dense telemetry', () => {
  const events = Array.from({ length: 500 }, (_value, index) => ({ frame: index, x: index, y: index, type: 'move', button: 0 }));
  const ass = buildCursorAss({ cursorEvents: events, width: 1280, height: 720, fps: 30, maxEvents: 100 });

  assert(ass.includes('PlayResX: 1280'));
  assert(ass.includes('PlayResY: 720'));
  assert(ass.includes('\\move(0,0,5,5,0,167)'));
  assert(ass.includes('m 0 0 l 0 26'));
  // 500 events / stride=5 -> 100 sampled, plus the explicit last-event
  // preservation (frame 499 not on the stride) yields 101 dialogue lines.
  assert.equal((ass.match(/^Dialogue:/gm) ?? []).length, 101);
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

test('cursor ASS layer always preserves the final recorded event under subsampling', () => {
  // 1500 unique cursor events; default maxEvents=600 forces stride=3.
  // Without the explicit last-event preservation, index 1499 would be dropped
  // (1499 % 3 = 2) and the cursor would render stuck at index 1497's position
  // for the tail of the recording.
  const events = Array.from({ length: 1500 }, (_value, index) => ({
    frame: index,
    x: 100 + index,
    y: 100 + index,
    type: 'move',
    button: 0,
  }));
  const ass = buildCursorAss({ cursorEvents: events, width: 1920, height: 1080, fps: 30 });
  // The final event has x = 100 + 1499 = 1599; the corresponding ASS \\move
  // call must reference this final position somewhere in the dialogue stream.
  assert(ass.includes('\\move(1599,1599'));
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

test('cursor ASS layer renders click emphasis events without move telemetry', () => {
  const ass = buildCursorAss({
    cursorEvents: [{ frame: 15, x: 320, y: 240, type: 'down', button: 0 }],
    width: 1280,
    height: 720,
    fps: 30,
  });

  assert(ass.includes('Style: Click'));
  assert(ass.includes('Dialogue: 1,0:00:00.50,0:00:00.90,Click'));
  assert(ass.includes('\\pos(320,240)'));
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
    /Only unedited or head\/tail-trimmed single-recording exports/,
  );
});

test('styled export accepts unedited recording with linked camera asset', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      camera: {
        rawPath: '/tmp/camera.mkv',
        outputPath: '/tmp/camera.mp4',
        devicePath: '/dev/video2',
        width: 1280,
        height: 720,
        fps: 30,
      },
    },
  });
  const assetId = project.assets[0].id;

  assert.equal(isSingleUneditedRecording(project, assetId), false);
  assert.equal(isSingleUneditedRecordingWithCamera(project, assetId), true);
});

test('styled export accepts unedited linked camera with preroll offset', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      camera: {
        rawPath: '/tmp/camera.mkv',
        outputPath: '/tmp/camera.mp4',
        devicePath: '/dev/video0',
        width: 1280,
        height: 720,
        fps: 30,
        sourceInFrames: 30,
        prerollMs: 1000,
      },
    },
  });
  const assetId = project.assets[0].id;

  assert.equal(isSingleUneditedRecordingWithCamera(project, assetId), true);
});
