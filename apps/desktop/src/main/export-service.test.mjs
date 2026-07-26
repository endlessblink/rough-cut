import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectForRecording, getPrimaryRecording } from './project-files.mjs';
import { buildBackgroundExpression, buildCensorSourceFilters, buildCursorAss, buildExperimentalHeadlessExportPlan, buildHeadlessFrameExportArgs, buildRawTrimExportArgs, buildSimpleStyledExportArgs, buildStyledExportArgs, canUseSimpleStyledExportFastPath, DEFAULT_MAX_CURSOR_ASS_EVENTS, exportExperimentalHeadlessProjectToMp4, exportProjectToMp4, isSingleTrimmedRecording, isSingleTrimmedTimelineRecording, isSingleUneditedRecording, isSingleUneditedRecordingWithCamera, isSingleUneditedTimelineRecording, normalizeExportMode, normalizeExportScope, parseFfmpegProgress, resolveTimelineExportRecording } from './export-service.mjs';

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

test('trimmed ffmpeg export can be cancelled and removes partial output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-export-cancel-'));
  const binDir = join(root, 'bin');
  const sourcePath = join(root, 'source.mp4');
  const outputPath = join(root, 'exported.mp4');
  const fakeFfmpegPath = join(binDir, 'ffmpeg');
  await mkdir(binDir, { recursive: true });
  await writeFile(sourcePath, Buffer.from('source'));
  await writeFile(fakeFfmpegPath, `#!/usr/bin/env bash
out="${'$'}{@: -1}"
printf partial > "${'$'}out"
trap 'exit 143' TERM
while true; do sleep 1; done
`);
  await chmod(fakeFfmpegPath, 0o755);

  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:05.000Z',
      outputPath: sourcePath,
      width: 1280,
      height: 720,
      fps: 30,
    },
  });
  const trimmed = withPrimaryTimelineClip(project, { timelineIn: 0, timelineOut: 90, sourceIn: 30, sourceOut: 120 }, 90);
  const controller = new AbortController();
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}:${originalPath ?? ''}`;

  try {
    const exportPromise = exportProjectToMp4({ project: trimmed, outputPath, mode: 'raw', signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    const result = await exportPromise;

    assert.equal(result.cancelled, true);
    await assert.rejects(() => readFile(outputPath), /ENOENT/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
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
  const trimmed = withPrimaryTimelineClip({
    ...project,
    composition: {
      ...project.composition,
      duration: 90,
      tracks: [{ ...project.composition.tracks[0], clips: [{ ...clip, timelineIn: 0, timelineOut: 90, sourceIn: 30, sourceOut: 120 }] }],
    },
  }, { timelineIn: 0, timelineOut: 90, sourceIn: 30, sourceOut: 120 }, 90);

  assert.equal(isSingleUneditedRecording(trimmed, project.assets[0].id), false);
  assert.equal(isSingleTrimmedRecording(trimmed, project.assets[0].id), true);
  assert.equal(isSingleTrimmedTimelineRecording(trimmed, project.assets[0].id), true);
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
  assert.equal(normalizeExportMode('experimental-headless'), 'experimental-headless');
  assert.throws(() => normalizeExportMode('other'), /Unsupported export mode/);
  assert.equal(normalizeExportScope(), 'timeline');
  assert.equal(normalizeExportScope('used-content'), 'used-content');
  assert.throws(() => normalizeExportScope('selection'), /Unsupported export scope/);
});

test('experimental headless export mode reports a composition plan and falls back to ffmpeg styled', async () => {
  const progress = [];
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/missing-headless-source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      cursorEvents: [{ frame: 30, x: 640, y: 360, type: 'move' }],
    },
  });

  await assert.rejects(
    () => exportProjectToMp4({
      project,
      outputPath: '/tmp/headless-export.mp4',
      mode: 'experimental-headless',
      onProgress: (event) => progress.push(event),
    }),
    /Styled export failed/,
  );

  const prototypeEvent = progress.find((event) => event.phase === 'rendering-headless-prototype');
  assert.equal(prototypeEvent?.experimentalBackend, 'headless-export');
  assert.equal(prototypeEvent?.headlessRender?.backend, 'electron-headless-compositor');
  assert.equal(prototypeEvent?.headlessRender?.attempted, false);
  assert.equal(prototypeEvent?.headlessRender?.reason, 'experimental-headless-export-disabled');
  assert.equal(prototypeEvent?.fallback?.active, true);
  assert.equal(prototypeEvent?.fallback?.to, 'ffmpeg-styled');
  assert.equal(prototypeEvent?.fallback?.reason, 'experimental-headless-export-disabled');
  assert.equal(prototypeEvent?.compositionPlan?.kind, 'experimental-headless-export-plan');
  assert.equal(prototypeEvent?.compositionPlan?.fallbackBackend, 'ffmpeg-styled');
  assert.equal(prototypeEvent?.compositionPlan?.frames?.length, 3);
  assert(prototypeEvent?.compositionPlan?.frames?.some((frame) => frame.cursor.sourcePosition), 'prototype plan should carry cursor placement from the shared frame resolver');
  assert(progress.some((event) => event.phase === 'rendering-styled' && event.fallback?.to === 'ffmpeg-styled'), 'fallback styled progress should stay visible');
});

test('experimental headless export encodes successful rendered frame artifacts without styled fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-headless-success-'));
  const binDir = join(root, 'bin');
  const frameDir = join(root, 'frames');
  const fakeFfmpegPath = join(binDir, 'ffmpeg');
  const outputPath = join(root, 'headless-success.mp4');
  const previousPath = process.env.PATH;
  const previousFlag = process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT;
  await mkdir(binDir, { recursive: true });
  await mkdir(frameDir, { recursive: true });
  await writeFile(join(frameDir, 'frame-000000.png'), Buffer.from('fake-png'));
  await writeFile(fakeFfmpegPath, `#!/usr/bin/env bash
out="${'$'}{@: -1}"
printf headless-mp4 > "${'$'}out"
`);
  await chmod(fakeFfmpegPath, 0o755);
  process.env.PATH = `${binDir}:${previousPath ?? ''}`;
  process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT = '1';

  try {
    const progress = [];
    const project = createProjectForRecording({
      recording: {
        startedAt: '2026-04-28T12:00:00.000Z',
        stoppedAt: '2026-04-28T12:00:01.000Z',
        outputPath: '/tmp/source-for-headless-success.mp4',
        width: 640,
        height: 360,
        fps: 30,
      },
    });
    const recording = {
      ...getPrimaryRecording(project),
      filePath: null,
    };
    const frameArtifact = {
      frameIndex: 0,
      path: join(frameDir, 'frame-000000.png'),
      bytes: 8,
    };
    const result = await exportExperimentalHeadlessProjectToMp4({
      project,
      recording,
      outputPath,
      onProgress: (event) => progress.push(event),
      attemptHeadlessRender: async ({ compositionPlan, outputPath: attemptedOutputPath }) => ({
        backend: 'electron-headless-compositor',
        attempted: true,
        available: true,
        ok: true,
        reason: null,
        outputPath: attemptedOutputPath,
        frameCount: compositionPlan.frames.length,
        output: compositionPlan.output,
        frameArtifacts: [frameArtifact],
        renderSurface: {
          ok: true,
          frameCount: compositionPlan.frames.length,
          framePattern: join(frameDir, 'frame-%06d.png'),
          frameArtifacts: [frameArtifact],
          renderResults: [{ frameIndex: 0, rendererKind: 'webgl', drewScreen: true }],
        },
      }),
    });

    assert.equal(result.outputPath, outputPath);
    assert.equal(result.experimentalBackend, 'headless-export');
    assert.equal(result.rendererBackend, 'electron-headless-compositor');
    assert.equal(result.fallback.active, false);
    assert.equal(result.fallback.to, 'ffmpeg-styled');
    assert.equal(result.headlessRender.ok, true);
    assert.equal(result.headlessRender.renderSurface.renderResults[0].rendererKind, 'webgl');
    assert.deepEqual(result.frameArtifacts, [frameArtifact]);
    assert.equal(result.audioPreserved, false);
    assert.equal(await readFile(outputPath, 'utf8'), 'headless-mp4');
    assert(progress.some((event) => event.phase === 'rendering-headless-export' && event.experimentalBackend === 'headless-export'));
    assert(!progress.some((event) => event.phase === 'rendering-styled'), 'successful headless render must not use styled fallback');
  } finally {
    process.env.PATH = previousPath;
    if (previousFlag === undefined) {
      delete process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT;
    } else {
      process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT = previousFlag;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('experimental headless export falls back to styled export when artifact encode fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-headless-encode-fallback-'));
  const binDir = join(root, 'bin');
  const frameDir = join(root, 'frames');
  const fakeFfmpegPath = join(binDir, 'ffmpeg');
  const outputPath = join(root, 'headless-fallback.mp4');
  const sourcePath = join(root, 'source.mp4');
  const logPath = join(root, 'ffmpeg-calls.log');
  const previousPath = process.env.PATH;
  const previousFlag = process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT;
  const previousEncoder = process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER;
  await mkdir(binDir, { recursive: true });
  await mkdir(frameDir, { recursive: true });
  await writeFile(sourcePath, Buffer.from('source-mp4'));
  await writeFile(join(frameDir, 'frame-000000.png'), Buffer.from('fake-png'));
  await writeFile(fakeFfmpegPath, `#!/usr/bin/env bash
printf '%s\\n' "${'$'}*" >> "${logPath}"
out="${'$'}{@: -1}"
if printf '%s\\n' "${'$'}*" | grep -q 'rough_cut_style=experimental-headless'; then
  printf headless-encode-failed >&2
  exit 1
fi
printf styled-fallback-mp4 > "${'$'}out"
`);
  await chmod(fakeFfmpegPath, 0o755);
  process.env.PATH = `${binDir}:${previousPath ?? ''}`;
  process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT = '1';
  process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER = 'libx264';

  try {
    const progress = [];
    const project = createProjectForRecording({
      recording: {
        startedAt: '2026-04-28T12:00:00.000Z',
        stoppedAt: '2026-04-28T12:00:01.000Z',
        outputPath: sourcePath,
        width: 640,
        height: 360,
        fps: 30,
      },
    });
    const recording = getPrimaryRecording(project);
    const frameArtifact = {
      frameIndex: 0,
      path: join(frameDir, 'frame-000000.png'),
      bytes: 8,
    };
    const result = await exportExperimentalHeadlessProjectToMp4({
      project,
      recording,
      outputPath,
      onProgress: (event) => progress.push(event),
      attemptHeadlessRender: async ({ compositionPlan, outputPath: attemptedOutputPath }) => ({
        backend: 'electron-headless-compositor',
        attempted: true,
        available: true,
        ok: true,
        reason: null,
        outputPath: attemptedOutputPath,
        frameCount: compositionPlan.frames.length,
        output: compositionPlan.output,
        frameArtifacts: [frameArtifact],
        renderSurface: {
          ok: true,
          frameCount: compositionPlan.frames.length,
          framePattern: join(frameDir, 'frame-%06d.png'),
          frameArtifacts: [frameArtifact],
          renderResults: [{ frameIndex: 0, rendererKind: 'webgl', drewScreen: true }],
        },
      }),
    });

    const fallbackEvent = progress.find((event) => event.fallback?.reason === 'experimental-headless-encode-failed');
    assert.equal(result.outputPath, outputPath);
    assert.equal(result.experimentalBackend, 'headless-export');
    assert.equal(result.fallback.active, true);
    assert.equal(result.fallback.reason, 'experimental-headless-encode-failed');
    assert.match(result.fallback.error, /Experimental headless export failed: headless-encode-failed/);
    assert.equal(result.headlessRender.ok, true);
    assert.equal(result.fastPath, 'simple-styled');
    assert.equal(await readFile(outputPath, 'utf8'), 'styled-fallback-mp4');
    assert.equal(fallbackEvent?.notice, 'Experimental headless export encode failed; falling back to FFmpeg styled export.');
    assert(progress.some((event) => event.phase === 'rendering-styled' && event.experimentalBackend === 'headless-export'));
    const calls = await readFile(logPath, 'utf8');
    assert.match(calls, /rough_cut_style=experimental-headless/);
    assert.match(calls, /rough_cut_style=canvas:1920x1080:studio-demo-fast/);
  } finally {
    process.env.PATH = previousPath;
    if (previousFlag === undefined) {
      delete process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT;
    } else {
      process.env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT = previousFlag;
    }
    if (previousEncoder === undefined) {
      delete process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER;
    } else {
      process.env.ROUGH_CUT_STYLED_VIDEO_ENCODER = previousEncoder;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('experimental headless export plan samples shared composition frames', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      cursorEvents: [{ frame: 0, x: 320, y: 180, type: 'move' }],
    },
  });

  const plan = buildExperimentalHeadlessExportPlan({ project, recording: getPrimaryRecording(project) });

  assert.equal(plan.kind, 'experimental-headless-export-plan');
  assert.equal(plan.backend, 'headless-export');
  assert.equal(plan.fallbackBackend, 'ffmpeg-styled');
  assert.equal(plan.fps, 30);
  assert.equal(plan.durationFrames, 90);
  assert.deepEqual(plan.frames.map((frame) => frame.frameIndex), [0, 45, 89]);
  assert(plan.frames.every((frame) => frame.output.width > 0 && frame.output.height > 0));
  assert(plan.frames.every((frame) => frame.background.color));
  assert(plan.frames.every((frame) => frame.background.startColor && frame.background.endColor));
  assert(plan.frames.some((frame) => frame.screen?.zoomTransform));
  assert.equal(plan.frames[0].screen.sourcePath, '/tmp/source.mp4');
  assert.match(plan.frames[0].screen.sourceUrl, /^file:\/\/\/tmp\/source\.mp4$/);
  assert.equal(plan.frames[0].screen.fps, 30);
  assert.equal(plan.frames[0].screen.frameSource, 'background-padding');
  assert.deepEqual(plan.frames[0].screen.frame, { x: 0.133203, y: 0.133333, w: 0.733594, h: 0.733333 });
  assert.equal(plan.frames[0].screen.style.cornerRadius, 32);
  assert.equal(plan.frames[0].screen.style.shadowBlur, 58);
  assert.equal(plan.audio.preservedBy, 'ffmpeg-styled-fallback');
});

test('experimental headless export plan carries background gradient colors', () => {
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
  project.assets[0].presentation = {
    ...project.assets[0].presentation,
    background: {
      ...project.assets[0].presentation.background,
      bgColor: '#101010',
      bgGradient: 'linear-gradient(135deg, #112233 0%, #445566 45%, #778899 100%)',
      bgImage: 'backgrounds/dark-waves.png',
    },
  };

  const plan = buildExperimentalHeadlessExportPlan({ project, recording: getPrimaryRecording(project) });

  assert.equal(plan.frames[0].background.color, '#101010');
  assert.equal(plan.frames[0].background.startColor, '#112233');
  assert.equal(plan.frames[0].background.endColor, '#778899');
  assert.equal(plan.frames[0].background.gradient, 'linear-gradient(135deg, #112233 0%, #445566 45%, #778899 100%)');
  assert.equal(plan.frames[0].background.image, 'backgrounds/dark-waves.png');
  assert.match(plan.frames[0].background.imagePath, /apps\/desktop\/src\/renderer\/public\/backgrounds\/dark-waves\.png$|dist\/renderer\/backgrounds\/dark-waves\.png$/);
  assert.match(plan.frames[0].background.imageUrl, /^file:\/\//);
  assert.match(plan.frames[0].background.imageUrl, /backgrounds\/dark-waves\.png$/);
  assert.equal(plan.frames[0].background.styleKind, 'gradient');
});

test('experimental headless export plan carries cursor style and click effect', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      cursorEvents: [{ frame: 0, x: 640, y: 360, type: 'down', button: 0 }],
    },
  });
  project.assets[0].presentation = {
    ...project.assets[0].presentation,
    cursor: {
      style: 'spotlight',
      clickEffect: 'ripple',
      sizePercent: 125,
      clickSoundEnabled: true,
    },
  };

  const plan = buildExperimentalHeadlessExportPlan({ project, recording: getPrimaryRecording(project) });

  assert.deepEqual(plan.frames[0].cursor.sourcePosition, { x: 0.5, y: 0.5 });
  assert.equal(plan.frames[0].cursor.style, 'spotlight');
  assert.equal(plan.frames[0].cursor.sizePercent, 125);
  assert.deepEqual(plan.frames[0].click.sourcePosition, { x: 0.5, y: 0.5 });
  assert.equal(plan.frames[0].click.visible, true);
  assert.equal(plan.frames[0].click.effect, 'ripple');
  assert.equal(plan.frames[0].click.soundEnabled, true);
});

test('experimental headless export plan carries manual screen and camera source viewports', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      camera: {
        outputPath: '/tmp/camera.mp4',
        width: 640,
        height: 480,
      },
    },
  });
  const recordingAsset = project.assets[0];
  recordingAsset.presentation = {
    ...recordingAsset.presentation,
    screenCrop: { enabled: true, x: 120, y: 40, width: 640, height: 360, aspectRatio: '16:9' },
    cameraCrop: { enabled: true, x: 20, y: 30, width: 320, height: 240, aspectRatio: '4:3' },
  };

  const plan = buildExperimentalHeadlessExportPlan({ project, recording: getPrimaryRecording(project) });

  assert.deepEqual(plan.frames[0].screen.sourceViewport, { enabled: true, x: 120, y: 40, width: 640, height: 360, aspectRatio: '16:9' });
  assert.deepEqual(plan.frames[0].screen.crop, { enabled: true, x: 120, y: 40, width: 640, height: 360, aspectRatio: '16:9' });
  assert.equal(plan.frames[0].screen.hasSourceViewport, true);
  assert.deepEqual(plan.frames[0].camera.sourceViewport, { enabled: true, x: 20, y: 30, width: 320, height: 240, aspectRatio: '4:3' });
  assert.deepEqual(plan.frames[0].camera.crop, { enabled: true, x: 20, y: 30, width: 320, height: 240, aspectRatio: '4:3' });
  assert.equal(plan.frames[0].camera.hasCrop, true);
});

test('experimental headless export plan resolves custom screen frame and background screen style', () => {
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
  project.assets[0].presentation = {
    ...project.assets[0].presentation,
    screenFrame: { x: 0.1, y: 0.1, w: 0.8, h: 0.4 },
    background: {
      ...project.assets[0].presentation.background,
      bgCornerRadius: 44,
      bgShadowEnabled: true,
      bgShadowBlur: 72,
      bgShadowOpacity: 0.31,
      bgShadowOffsetX: -12,
      bgShadowOffsetY: 24,
    },
  };

  const plan = buildExperimentalHeadlessExportPlan({ project, recording: getPrimaryRecording(project) });

  assert.equal(plan.frames[0].screen.frameSource, 'manual');
  assert.deepEqual(plan.frames[0].screen.frame, { x: 0.3, y: 0.1, w: 0.4, h: 0.4 });
  assert.deepEqual(plan.frames[0].screen.style, {
    cornerRadius: 44,
    shadowEnabled: true,
    shadowBlur: 72,
    shadowOpacity: 0.31,
    shadowOffsetX: -12,
    shadowOffsetY: 24,
  });
});

test('experimental headless export plan resolves camera shape frame radius and style', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      camera: {
        outputPath: '/tmp/camera.mp4',
        width: 640,
        height: 480,
      },
    },
  });
  project.assets[0].presentation = {
    ...project.assets[0].presentation,
    camera: {
      ...project.assets[0].presentation.camera,
      shape: 'circle',
      roundness: 50,
      shadowEnabled: true,
      shadowBlur: 32,
      shadowOpacity: 0.37,
    },
    cameraFrame: { x: 0.1, y: 0.2, w: 0.25, h: 0.4 },
  };

  const plan = buildExperimentalHeadlessExportPlan({ project, recording: getPrimaryRecording(project) });

  assert.equal(plan.frames[0].camera.frameSource, 'manual');
  assert.deepEqual(plan.frames[0].camera.frame, { x: 0.1125, y: 0.2, w: 0.225, h: 0.4 });
  assert.equal(plan.frames[0].camera.radius, 144);
  assert.equal(plan.frames[0].camera.presentation.shape, 'circle');
  assert.deepEqual(plan.frames[0].camera.style, {
    shape: 'circle',
    roundness: 50,
    shadowEnabled: true,
    shadowBlur: 32,
    shadowOpacity: 0.37,
  });
});

test('experimental headless export plan can expand to every output frame for real rendering', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:01.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
    },
  });

  const plan = buildExperimentalHeadlessExportPlan({
    project,
    recording: getPrimaryRecording(project),
    frameSelection: 'all',
  });

  assert.equal(plan.frameSelection, 'all');
  assert.equal(plan.durationFrames, 30);
  assert.deepEqual(plan.sampledFrames, [0, 15, 29]);
  assert.equal(plan.frames.length, 30);
  assert.deepEqual(plan.frames.slice(0, 4).map((frame) => frame.frameIndex), [0, 1, 2, 3]);
  assert.deepEqual(plan.frames.slice(-3).map((frame) => frame.frameIndex), [27, 28, 29]);
});

test('experimental headless export plan preserves timeline gaps and cut source frames', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:01.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
    },
  });
  const split = withPrimaryTimelineClips(project, [
    { id: 'screen-before-gap', timelineIn: 0, timelineOut: 10, sourceIn: 0, sourceOut: 10 },
    { id: 'screen-after-gap', timelineIn: 20, timelineOut: 30, sourceIn: 20, sourceOut: 30 },
  ], 30);
  const recording = resolveTimelineExportRecording(split, getPrimaryRecording(split));

  const plan = buildExperimentalHeadlessExportPlan({
    project: split,
    recording,
    frameSelection: 'all',
  });

  assert.equal(plan.durationFrames, 30);
  assert.equal(plan.frames[5].timelineGap, false);
  assert.equal(plan.frames[5].screen.sourceFrame, 5);
  assert.equal(plan.frames[15].timelineGap, true);
  assert.equal(plan.frames[15].screen, null);
  assert.equal(plan.frames[15].sourceFrame, null);
  assert.equal(plan.frames[25].timelineGap, false);
  assert.equal(plan.frames[25].screen.sourceFrame, 25);
});

test('headless frame export args encode a captured image sequence and preserve source audio when present', () => {
  const args = buildHeadlessFrameExportArgs({
    framePattern: '/tmp/rendered/frame-%06d.png',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    durationSeconds: 2,
    audioInputPath: '/tmp/source.mp4',
  });

  assert.deepEqual(args.slice(0, 10), [
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    '-framerate',
    '30',
    '-start_number',
    '0',
    '-i',
    '/tmp/rendered/frame-%06d.png',
  ]);
  assert(args.includes('/tmp/source.mp4'));
  assert(args.includes('-map'));
  assert(args.includes('1:a?'));
  assert(args.includes('-shortest'));
  assert(args.includes('rough_cut_style=experimental-headless:1920x1080:studio-demo'));
  assert.equal(args.at(-1), '/tmp/export.mp4');
});

test('headless frame export args can mux timeline audio segments over rendered frames', () => {
  const args = buildHeadlessFrameExportArgs({
    framePattern: '/tmp/rendered/frame-%06d.png',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    durationSeconds: 3,
    audioInputPath: '/tmp/source.mp4',
    timelineAudioSegments: [{ timelineIn: 30, timelineOut: 90, sourceIn: 15, sourceOut: 75 }],
  });
  const joined = args.join(' ');

  assert(joined.includes('anullsrc=channel_layout=stereo:sample_rate=48000:d=3[audio_blank]'));
  assert(joined.includes('[1:a]atrim=start=0.5:end=2.5,asetpts=PTS-STARTPTS,adelay=1000:all=1[audio_seg_0]'));
  assert(joined.includes('[audio_blank][audio_seg_0]amix=inputs=2:duration=first:dropout_transition=0[a]'));
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4), ['-map', '0:v', '-map', '[a]']);
  assert(!args.includes('-shortest'));
  assert(args.includes('aac'));
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

test('simple styled export announces the simple fast path before invoking ffmpeg', async () => {
  const progress = [];
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:06:00.000Z',
      outputPath: '/tmp/missing-long-source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
    },
  });

  await assert.rejects(
    () => exportProjectToMp4({ project, outputPath: '/tmp/export.mp4', mode: 'styled', onProgress: (event) => progress.push(event) }),
    /Styled export failed/,
  );
  assert(progress.some((event) => event.fastPath === 'simple-styled'), 'simple styled exports should use the simple fast path');
});

test('long styled export with custom presentation also uses the full preview-parity path', async () => {
  const progress = [];
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:06:00.000Z',
      outputPath: '/tmp/missing-long-custom-source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
    },
  });
  const recordingAsset = project.assets.find((asset) => asset.type === 'recording');
  recordingAsset.presentation = {
    ...recordingAsset.presentation,
    zoom: {
      ...recordingAsset.presentation?.zoom,
      markers: [],
    },
    screenFrame: { x: 0.063, y: 0.063, w: 0.874, h: 0.874 },
    background: {
      ...recordingAsset.presentation?.background,
      bgGradient: 'linear-gradient(135deg, #24120c 0%, #6f3f55 100%)',
      bgCornerRadius: 34,
      bgShadowBlur: 58,
    },
  };

  await assert.rejects(
    () => exportProjectToMp4({ project, outputPath: '/tmp/export.mp4', mode: 'styled', onProgress: (event) => progress.push(event) }),
    /Styled export failed/,
  );
  assert(!progress.some((event) => event.fastPath), 'custom styled exports must use the full preview-parity path');
});

test('simple styled fast path eligibility stays shape-gated', () => {
  assert.equal(canUseSimpleStyledExportFastPath(), true);
  assert.equal(canUseSimpleStyledExportFastPath({ cursorAssPath: '/tmp/cursor.ass' }), true);
  assert.equal(canUseSimpleStyledExportFastPath({ backgroundImagePath: '/tmp/background.png' }), false);
  assert.equal(canUseSimpleStyledExportFastPath({ zoomCropFilter: 'crop=iw:ih', zoomSendcmdPath: '/tmp/zoom.cmd' }), false);
  assert.equal(canUseSimpleStyledExportFastPath({ cameraInputPath: '/tmp/camera.mp4' }), false);
  assert.equal(canUseSimpleStyledExportFastPath({ cutRanges: [{ id: 'cut-1', startFrame: 1, endFrame: 2 }] }), false);
  assert.equal(canUseSimpleStyledExportFastPath({ timelineSegments: [{ timelineIn: 0, timelineOut: 1, sourceIn: 0, sourceOut: 1 }] }), false);
  assert.equal(canUseSimpleStyledExportFastPath({ screenFrame: { x: 0, y: 0, w: 1, h: 1 } }), false);
  assert.equal(canUseSimpleStyledExportFastPath({ screenCrop: { enabled: true, x: 0, y: 0, width: 100, height: 100 } }), false);
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
  assert(joined.includes('geq=lum='));
  assert(joined.includes('loop=loop=-1:size=1:start=0'));
  assert(joined.includes('[screen][screen_mask]alphamerge[rounded]'));
  assert(!joined.includes('[screen]geq='));
  assert(joined.includes('boxblur=58:5'));
  assert.deepEqual(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 7), ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt']);
  assert(joined.includes('studio-demo'));
  assert(args.includes('/tmp/source.mp4'));
  assert.equal(args.at(-1), '/tmp/export.mp4');
});

test('simple styled fast path args keep screen styling while omitting unsupported graph branches', () => {
  const args = buildSimpleStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 30,
    cursorAssPath: '/tmp/cursor.ass',
  });
  const joined = args.join(' ');

  assert(args.includes('-filter_complex'));
  assert(joined.includes('[base]subtitles=/tmp/cursor.ass[with_cursor]'));
  assert(joined.includes('[with_cursor]scale='));
  assert(joined.includes('[screen][screen_mask]alphamerge[rounded]'));
  assert(joined.includes('boxblur=58:5'));
  assert(joined.includes('[with_shadow][rounded]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[v]'));
  assert(joined.includes('studio-demo-fast'));
  assert(!joined.includes('sendcmd='));
  assert(!joined.includes('[camera_scaled]'));
  assert(!joined.includes('movie='));
  assert(!joined.includes('crop=iw*1:ih*1'));
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4), ['-map', '[v]', '-map', '0:a?']);
});

test('styled export args can use NVIDIA NVENC without changing the preview-parity graph', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    cursorAssPath: '/tmp/cursor.ass',
    cameraInputPath: '/tmp/camera.mp4',
    videoEncoder: 'h264_nvenc',
  });
  const joined = args.join(' ');

  assert.deepEqual(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 14), [
    '-c:v',
    'h264_nvenc',
    '-preset',
    'p4',
    '-tune',
    'hq',
    '-rc',
    'vbr',
    '-cq',
    '19',
    '-b:v',
    '0',
    '-pix_fmt',
    'yuv420p',
  ]);
  assert(!args.includes('libx264'));
  assert(joined.includes('[base]subtitles=/tmp/cursor.ass[with_cursor]'));
  assert(joined.includes('[screen][screen_mask]alphamerge[rounded]'));
  assert(joined.includes('boxblur=58:5'));
  assert(joined.includes('[camera_scaled][camera_mask]alphamerge[camera_rounded]'));
  assert(joined.includes('[with_screen][camera_rounded]overlay='));
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

test('canonical timeline export resolves moved clips, gaps, and cursor frames', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:03.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      cursorEvents: [
        { frame: 0, x: 10, y: 10, type: 'move', button: 0 },
        { frame: 15, x: 20, y: 20, type: 'move', button: 0 },
        { frame: 74, x: 30, y: 30, type: 'down', button: 0 },
      ],
    },
  });
  const moved = withPrimaryTimelineClip(project, { timelineIn: 30, timelineOut: 90, sourceIn: 15, sourceOut: 75 });
  const recording = resolveTimelineExportRecording(moved, getPrimaryRecording(moved));

  assert.deepEqual(recording.timelineSegments, [{ timelineIn: 30, timelineOut: 90, sourceIn: 15, sourceOut: 75 }]);
  assert.equal(recording.trimmedDuration, 90);
  assert.deepEqual(recording.cursorEvents.map((event) => ({ frame: event.frame, type: event.type })), [
    { frame: 30, type: 'move' },
    { frame: 89, type: 'down' },
  ]);
});

test('canonical timeline export preserves internal and trailing gaps', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:06.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      cursorEvents: [
        { frame: 20, x: 10, y: 10, type: 'move', button: 0 },
        { frame: 100, x: 20, y: 20, type: 'move', button: 0 },
        { frame: 130, x: 30, y: 30, type: 'move', button: 0 },
      ],
    },
  });
  const split = withPrimaryTimelineClips(project, [
    { id: 'screen-a', timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30 },
    { id: 'screen-b', timelineIn: 60, timelineOut: 90, sourceIn: 120, sourceOut: 150 },
  ], 150);
  const recording = resolveTimelineExportRecording(split, getPrimaryRecording(split));

  assert.deepEqual(recording.timelineSegments, [
    { timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30 },
    { timelineIn: 60, timelineOut: 90, sourceIn: 120, sourceOut: 150 },
  ]);
  assert.equal(recording.timelineDurationFrames, 150);
  assert.deepEqual(recording.cursorEvents.map((event) => event.frame), [20, 70]);
});

test('used-content export scope trims timeline gaps without changing source ranges', () => {
  const project = createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: '2026-04-28T12:00:05.000Z',
      outputPath: '/tmp/source.mp4',
      width: 1280,
      height: 720,
      fps: 30,
      cursorEvents: [{ frame: 45, x: 20, y: 20, type: 'move', button: 0 }],
    },
  });
  const moved = withPrimaryTimelineClip(project, { timelineIn: 30, timelineOut: 90, sourceIn: 30, sourceOut: 90 }, 150);
  const recording = resolveTimelineExportRecording(moved, getPrimaryRecording(moved), { exportScope: 'used-content' });

  assert.deepEqual(recording.timelineSegments, []);
  assert.equal(recording.timelineDurationFrames, 60);
  assert.equal(recording.sourceIn, 30);
  assert.equal(recording.sourceOut, 90);
  assert.deepEqual(recording.cursorEvents.map((event) => event.frame), [15]);
  assert.equal(isSingleTrimmedTimelineRecording(moved, project.assets[0].id, { exportScope: 'used-content' }), true);
});

test('styled export args compose canonical timeline segments over real gaps', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 30,
    sourceTrimStartFrame: 15,
    sourceTrimEndFrame: 75,
    timelineDurationFrames: 90,
    timelineSegments: [{ timelineIn: 30, timelineOut: 90, sourceIn: 15, sourceOut: 75 }],
  });
  const joined = args.join(' ');

  assert(!args.includes('-ss'));
  assert(!args.includes('-t'));
  assert(joined.includes('color=c=black:s=1280x720:r=30:d=1,format=rgba[base_gap_0]'));
  assert(joined.includes('[0:v]trim=start_frame=15:end_frame=75,setpts=PTS-STARTPTS,format=rgba[base_seg_0]'));
  assert(joined.includes('[base_gap_0][base_seg_0]concat=n=2:v=1:a=0[base]'));
  assert(args.includes('-an'));
});

test('styled export args can render timeline audio segments through filter audio', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 30,
    timelineDurationFrames: 90,
    timelineSegments: [{ timelineIn: 30, timelineOut: 90, sourceIn: 15, sourceOut: 75 }],
    timelineAudioSegments: [{ timelineIn: 30, timelineOut: 90, sourceIn: 15, sourceOut: 75 }],
  });
  const joined = args.join(' ');

  assert(joined.includes('anullsrc=channel_layout=stereo:sample_rate=48000:d=3[audio_blank]'));
  assert(joined.includes('[0:a]atrim=start=0.5:end=2.5,asetpts=PTS-STARTPTS,adelay=1000:all=1[audio_seg_0]'));
  assert(joined.includes('[audio_blank][audio_seg_0]amix=inputs=2:duration=first:dropout_transition=0[a]'));
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4), ['-map', '[v]', '-map', '[a]']);
  assert(args.includes('aac'));
});

test('styled export args can render linked camera timeline segments', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1280,
    sourceHeight: 720,
    sourceFps: 30,
    timelineDurationFrames: 90,
    timelineSegments: [{ timelineIn: 30, timelineOut: 90, sourceIn: 15, sourceOut: 75 }],
    cameraInputPath: '/tmp/camera.mp4',
    cameraSourceWidth: 640,
    cameraSourceHeight: 480,
    cameraTimelineSegments: [{ timelineIn: 30, timelineOut: 90, sourceIn: 45, sourceOut: 105 }],
  });
  const joined = args.join(' ');

  assert(joined.includes('color=c=black@0:s=640x480:r=30:d=1,format=rgba[camera_base_gap_0]'));
  assert(joined.includes('[1:v]trim=start_frame=45:end_frame=105,setpts=PTS-STARTPTS,format=rgba[camera_base_seg_0]'));
  assert(joined.includes('[camera_base_gap_0][camera_base_seg_0]concat=n=2:v=1:a=0[camera_base]'));
  assert(joined.includes('[camera_base]scale='));
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
  assert(joined.includes("*0.32',boxblur=72:5"));
  assert(joined.includes('overlay=(W-w)/2:(H-h)/2+46'));
  assert(joined.includes('hypot(44-X,44-Y)'));
});

test('styled export args apply signed shadow X offset and omit it when zero', () => {
  const positive = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    screenShadowOffsetY: 34,
    screenShadowOffsetX: 24,
  }).join(' ');
  assert(positive.includes('overlay=(W-w)/2+24:(H-h)/2+34:shortest=1[with_shadow]'));

  const negative = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    screenShadowOffsetY: 34,
    screenShadowOffsetX: -18,
  }).join(' ');
  assert(negative.includes('overlay=(W-w)/2-18:(H-h)/2+34:shortest=1[with_shadow]'));

  const zero = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    screenShadowOffsetY: 34,
    screenShadowOffsetX: 0,
  }).join(' ');
  // Back-compat: when X is zero, no `+0` is emitted in the overlay expression.
  assert(zero.includes('overlay=(W-w)/2:(H-h)/2+34:shortest=1[with_shadow]'));
});

test('styled export args use a normalized screenFrame override when provided', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    screenCornerRadius: 36,
    screenFrame: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 },
  });
  const joined = args.join(' ');

  // Override at 1920x1080 -> x=192, y=216, w=960, h=432.
  assert(joined.includes('scale=960:432:force_original_aspect_ratio=decrease,pad=960:432:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba'));
  assert(joined.includes('overlay=192:216+34:shortest=1[with_shadow]'));
  assert(joined.includes('overlay=192:216:shortest=1[with_screen]'));
  assert(joined.includes('hypot(36-X,36-Y)'));
});

test('styled export args preserve a custom screen frame without crop-to-fill', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    screenFrame: { x: 0.075, y: 0.05, w: 0.86, h: 0.82 },
  });
  const joined = args.join(' ');

  assert(joined.includes('scale=1651:886:force_original_aspect_ratio=decrease,pad=1651:886:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba'));
  assert(!joined.includes('scale=1651:886:force_original_aspect_ratio=increase,crop=1651:886'));
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
  assert(joined.includes('[bg_base][bg_image]overlay=(W-w)/2:(H-h)/2,loop=loop=-1:size=1:start=0'));
  assert(!joined.includes('[bg_base][bg_image]overlay=(W-w)/2:(H-h)/2:shortest=1[bg]'));
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

  // Circle shape is authoritative: the wide 480x432 override is centered
  // into a true 432x432 circle box before masking/export.
  assert(joined.includes('scale=432:432:force_original_aspect_ratio=increase'));
  assert(joined.includes('crop=432:432'));
  assert(joined.includes('overlay=216:216:eof_action=pass:repeatlast=0'));
});

test('styled export args apply manual camera crop before fitting the camera frame', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    cameraInputPath: '/tmp/camera.mp4',
    cameraSourceWidth: 1280,
    cameraSourceHeight: 720,
    cameraPresentation: { shape: 'rounded', aspectRatio: '16:9', position: 'corner-br', roundness: 50, size: 100, visible: true },
    cameraFrame: { x: 0.1, y: 0.2, w: 0.3, h: 0.3 },
    cameraCrop: { enabled: true, x: 120, y: 40, width: 640, height: 360, aspectRatio: '16:9' },
  });
  const joined = args.join(' ');

  assert(joined.includes('crop=640:360:120:40,scale=576:324:force_original_aspect_ratio=increase,crop=576:324,format=rgba[camera_scaled]'));
});

test('styled export args apply manual screen crop before fitting the screen frame', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    sourceWidth: 1280,
    sourceHeight: 720,
    screenFrame: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    screenCrop: { enabled: true, x: 120, y: 40, width: 640, height: 360, aspectRatio: '16:9' },
  });
  const joined = args.join(' ');

  assert(joined.includes('[base]crop=640:360:120:40,scale=1536:864:force_original_aspect_ratio=decrease'));
  assert(!joined.includes('crop=iw*1:ih*1'));
});

test('styled export args fall back to camera presentation when no normalized frame is set', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    width: 1920,
    height: 1080,
    cameraInputPath: '/tmp/camera.mp4',
    cameraPresentation: { shape: 'rounded', aspectRatio: '16:9', position: 'corner-br', roundness: 38, size: 100, visible: true },
    cameraFrame: null,
  });
  const joined = args.join(' ');

  // Shared camera layout fallback at 1920x1080:
  // width=1920*0.24=461, height=461/(16/9)=259, margin=(77,43).
  assert(joined.includes('scale=461:259:force_original_aspect_ratio=increase'));
  assert(joined.includes('crop=461:259'));
  assert(joined.includes('overlay=1382:778:eof_action=pass:repeatlast=0'));
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
  assert(joined.includes('pad='));
  assert(joined.includes('[screen][screen_mask]alphamerge[rounded]'));
  assert(!joined.includes("[screen]geq=r='r(X,Y)'"));
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

  assert(joined.includes('nullsrc=s=1920x1080:r=1:d=1'));
  assert(joined.includes('setpts=N/60/TB'));
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
  // 1500 unique cursor events with maxEvents=500 forces stride=3.
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
  const ass = buildCursorAss({ cursorEvents: events, width: 1920, height: 1080, fps: 30, maxEvents: 500 });
  // The final event has x = 100 + 1499 = 1599; the corresponding ASS \\move
  // call must reference this final position somewhere in the dialogue stream.
  assert(ass.includes('\\move(1599,1599'));
});

test('cursor ASS default maxEvents is generous enough that short and medium recordings do not stride', () => {
  assert.equal(DEFAULT_MAX_CURSOR_ASS_EVENTS, 30_000);
  const events = Array.from({ length: 5_000 }, (_value, index) => ({
    frame: index,
    x: 100 + (index % 1280),
    y: 100 + (index % 720),
    type: 'move',
    button: 0,
  }));
  const notices = [];
  const ass = buildCursorAss({
    cursorEvents: events,
    width: 1920,
    height: 1080,
    fps: 30,
    onDownsampleNotice: (info) => notices.push(info),
  });
  assert.equal((ass.match(/^Dialogue:/gm) ?? []).length, 5_000);
  assert.equal(notices.length, 0);
});

test('cursor ASS layer fires a downsample notice when telemetry exceeds the cap', () => {
  const events = Array.from({ length: 4_000 }, (_value, index) => ({
    frame: index,
    x: index,
    y: index,
    type: 'move',
    button: 0,
  }));
  const notices = [];
  buildCursorAss({
    cursorEvents: events,
    width: 1920,
    height: 1080,
    fps: 30,
    maxEvents: 1_000,
    onDownsampleNotice: (info) => notices.push(info),
  });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].originalEvents, 4_000);
  assert.equal(notices[0].stride > 1, true);
  assert.equal(notices[0].sampledEvents <= 1_000 + 1, true); // +1 for last-event preservation
});

test('cursor ASS layer copes with a 60-minute synthetic stream without crashing or hanging', () => {
  // 60 minutes at the 33ms cursor sample rate ≈ 109,090 samples. Pre-TASK-072
  // this would silently downsample to 600 lines; post-TASK-072 the default
  // 30k cap still applies but the build must remain fast and stable.
  const totalEvents = 60 * 60 * 30; // 108,000 (30 fps frame anchor)
  const events = Array.from({ length: totalEvents }, (_value, index) => ({
    frame: index,
    x: (index * 7) % 1920,
    y: (index * 11) % 1080,
    type: 'move',
    button: 0,
  }));
  const notices = [];
  const ass = buildCursorAss({
    cursorEvents: events,
    width: 1920,
    height: 1080,
    fps: 30,
    onDownsampleNotice: (info) => notices.push(info),
  });
  assert(typeof ass === 'string' && ass.length > 0);
  assert(ass.includes('PlayResX: 1920'));
  // Some downsampling should have happened, but the line count should stay at
  // or just above the cap — never exceed it by more than the last-event guard.
  const lineCount = (ass.match(/^Dialogue:/gm) ?? []).length;
  assert(lineCount <= DEFAULT_MAX_CURSOR_ASS_EVENTS + 1);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].originalEvents, totalEvents);
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
  const editedProject = withPrimaryTimelineClip(project, { timelineIn: 3, timelineOut: 93, sourceIn: 0, sourceOut: 90 });

  assert.equal(isSingleUneditedTimelineRecording(editedProject, assetId), false);
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

function withPrimaryTimelineClip(project, patch, compositionDuration = project.composition.duration) {
  const track = project.timeline.tracks.find((candidate) => candidate.clips.some((clip) => clip.mediaId === `source:${project.assets[0].id}:screen`));
  const clip = track?.clips.find((candidate) => candidate.mediaId === `source:${project.assets[0].id}:screen`);
  assert(track && clip, 'fixture must contain a primary timeline clip');
  return {
    ...project,
    composition: {
      ...project.composition,
      duration: compositionDuration,
    },
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((candidate) => candidate.id === track.id
        ? {
            ...candidate,
            clips: candidate.clips.map((item) => item.id === clip.id ? { ...item, ...patch } : item),
          }
        : candidate),
    },
  };
}

function withPrimaryTimelineClips(project, clipPatches, compositionDuration) {
  const track = project.timeline.tracks.find((candidate) => candidate.clips.some((clip) => clip.mediaId === `source:${project.assets[0].id}:screen`));
  const clip = track?.clips.find((candidate) => candidate.mediaId === `source:${project.assets[0].id}:screen`);
  assert(track && clip, 'fixture must contain a primary timeline clip');
  return {
    ...project,
    composition: {
      ...project.composition,
      duration: compositionDuration,
    },
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((candidate) => candidate.id === track.id
        ? {
            ...candidate,
            clips: clipPatches.map((patch) => ({ ...clip, ...patch, trackId: track.id, mediaId: clip.mediaId })),
          }
        : candidate),
    },
  };
}

test('buildCensorSourceFilters is a no-op passthrough when there are no censors', () => {
  const result = buildCensorSourceFilters({ censorRegions: [], sourceWidth: 1920, sourceHeight: 1080, fps: 30 });
  assert.deepEqual(result.filters, []);
  assert.equal(result.outputLabel, '[base]');
  assert.equal(result.count, 0);
});

test('buildCensorSourceFilters renders a solid censor as one time-gated drawbox', () => {
  const result = buildCensorSourceFilters({
    censorRegions: [{
      id: 'c1',
      rect: { x: 0.25, y: 0.5, w: 0.25, h: 0.25 },
      mode: 'solid',
      blockSize: 24,
      soften: false,
      startFrame: 30,
      endFrame: 90,
    }],
    sourceWidth: 1920,
    sourceHeight: 1080,
    fps: 30,
  });

  assert.equal(result.count, 1);
  assert.equal(result.filters.length, 1);
  assert.match(result.filters[0], /^\[base\]drawbox=x=480:y=540:w=480:h=270:color=0x0b0f14@1:t=fill:enable='between\(t,1,3\)'\[censored_0\]$/);
  assert.equal(result.outputLabel, '[censored_0]');
});

test('buildCensorSourceFilters exports pixelate as a solid drawbox too', () => {
  // The mosaic needs split+overlay, which deadlocks whenever zoom is active
  // (measured: 0% CPU, empty output, forever). A solid block hides the same pixels
  // and cannot hang, so the export uses it for both modes.
  const result = buildCensorSourceFilters({
    censorRegions: [{
      id: 'c1',
      rect: { x: 0, y: 0, w: 0.25, h: 0.25 },
      mode: 'pixelate',
      blockSize: 48,
      soften: true,
      startFrame: 0,
      endFrame: 60,
    }],
    sourceWidth: 1920,
    sourceHeight: 1080,
    fps: 30,
  });

  assert.equal(result.filters.length, 1);
  assert.match(result.filters[0], /^\[base\]drawbox=x=0:y=0:w=480:h=270:color=0x0b0f14@1:t=fill:enable='between\(t,0,2\)'\[censored_0\]$/);
});

test('the export never emits split or overlay for a censor', () => {
  // Guards the deadlock directly: split+overlay in the screen chain is what hung.
  const result = buildCensorSourceFilters({
    censorRegions: [
      { id: 'a', rect: { x: 0, y: 0, w: 0.2, h: 0.2 }, mode: 'pixelate', blockSize: 24, soften: true, startFrame: 0, endFrame: 60 },
      { id: 'b', rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, mode: 'solid', blockSize: 24, soften: false, startFrame: 0, endFrame: 60 },
    ],
    sourceWidth: 1920,
    sourceHeight: 1080,
    fps: 30,
  });
  const joined = result.filters.join(';');
  assert.doesNotMatch(joined, /split=/);
  assert.doesNotMatch(joined, /overlay=/);
  assert.doesNotMatch(joined, /flags=neighbor/);
});

test('buildCensorSourceFilters chains multiple censors so each one is applied', () => {
  const result = buildCensorSourceFilters({
    censorRegions: [
      { id: 'a', rect: { x: 0, y: 0, w: 0.2, h: 0.2 }, mode: 'solid', blockSize: 24, soften: false, startFrame: 0, endFrame: 30 },
      { id: 'b', rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, mode: 'solid', blockSize: 24, soften: false, startFrame: 0, endFrame: 30 },
    ],
    sourceWidth: 1920,
    sourceHeight: 1080,
    fps: 30,
  });

  assert.equal(result.count, 2);
  assert.match(result.filters[0], /^\[base\]drawbox/);
  // The second reads the first's output, so neither is dropped.
  assert.match(result.filters[1], /^\[censored_0\]drawbox/);
  assert.equal(result.outputLabel, '[censored_1]');
});

test('buildCensorSourceFilters clamps a censor that overhangs the frame edge', () => {
  const result = buildCensorSourceFilters({
    censorRegions: [{ id: 'c1', rect: { x: 0.9, y: 0.9, w: 0.4, h: 0.4 }, mode: 'solid', blockSize: 24, soften: false, startFrame: 0, endFrame: 30 }],
    sourceWidth: 1920,
    sourceHeight: 1080,
    fps: 30,
  });
  assert.match(result.filters[0], /x=1728:y=972:w=192:h=108/);
});

test('buildCensorSourceFilters drops regions with no usable area', () => {
  const result = buildCensorSourceFilters({
    censorRegions: [
      { id: 'zero', rect: { x: 0.5, y: 0.5, w: 0, h: 0.2 }, mode: 'solid', startFrame: 0, endFrame: 30 },
      { id: 'noRect', mode: 'solid', startFrame: 0, endFrame: 30 },
    ],
    sourceWidth: 1920,
    sourceHeight: 1080,
    fps: 30,
  });
  assert.equal(result.count, 0);
  assert.equal(result.outputLabel, '[base]');
});

test('styled export chain applies censors before the cursor burn-in and the zoom crop', () => {
  const args = buildStyledExportArgs({
    inputPath: '/tmp/source.mp4',
    outputPath: '/tmp/export.mp4',
    sourceWidth: 1920,
    sourceHeight: 1080,
    fps: 30,
    cursorAssPath: '/tmp/cursor.ass',
    censorRegions: [{ id: 'c1', rect: { x: 0.25, y: 0.25, w: 0.25, h: 0.25 }, mode: 'solid', blockSize: 24, soften: false, startFrame: 0, endFrame: 60 }],
  });
  const filter = args[args.indexOf('-filter_complex') + 1];

  // Censor reads [base]; the cursor subtitles step then reads the censored label,
  // so the cursor lands on top of the censor exactly as it does in the preview.
  assert.match(filter, /\[base\]drawbox=[^;]*\[censored_0\]/);
  assert.match(filter, /\[censored_0\]subtitles=/);
  assert.ok(
    filter.indexOf('drawbox') < filter.indexOf('subtitles='),
    'censor must be applied before the cursor is burned in',
  );
});

test('a censored project cannot take the simple styled fast path', () => {
  // The fast path skips the screen chain the censor filters live in, so taking it
  // would export the thing the user asked to hide.
  assert.equal(canUseSimpleStyledExportFastPath({ censorRegions: [] }), true);
  assert.equal(
    canUseSimpleStyledExportFastPath({
      censorRegions: [{ id: 'c1', rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, mode: 'solid', startFrame: 0, endFrame: 30 }],
    }),
    false,
  );
});
