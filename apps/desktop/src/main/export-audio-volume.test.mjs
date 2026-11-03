import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withClipAudioLevel, withRecordingAudioLevel } from '@rough-cut/project-model';
import { createProjectForRecording, getPrimaryRecording } from './project-files.mjs';
import { buildRawTimelineExportArgs, buildStyledExportArgs, exportProjectToMp4, resolveTimelineExportRecording } from './export-service.mjs';

// Track and clip volume in the export: each timeline section's sound gets the
// same gain the preview's gain nodes play (clip volume x track volume).

const BASH_STUBS = process.platform === 'win32' ? 'uses #!/usr/bin/env bash ffmpeg stubs' : false;

function recordingProject(sourcePath = '/tmp/source.mp4', seconds = 4) {
  return createProjectForRecording({
    recording: {
      startedAt: '2026-04-28T12:00:00.000Z',
      stoppedAt: `2026-04-28T12:00:0${seconds}.000Z`,
      outputPath: sourcePath,
      width: 1280,
      height: 720,
      fps: 30,
    },
  });
}

/** The project's recording split into [0,30) [30,90) with linked screen and sound clips. */
function splitProject(project) {
  const screenTrack = project.timeline.tracks.find((track) => track.clips.some((clip) => clip.mediaId.endsWith(':screen')));
  const screen = screenTrack.clips[0];
  const sections = [
    { suffix: 'a', timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30 },
    { suffix: 'b', timelineIn: 30, timelineOut: 90, sourceIn: 60, sourceOut: 120 },
  ];
  return {
    ...project,
    composition: { ...project.composition, duration: 90 },
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => {
        const first = track.clips[0];
        if (!first || first.linkGroupId !== screen.linkGroupId) return track;
        return { ...track, clips: sections.map(({ suffix, ...range }) => ({ ...first, ...range, id: `${track.id}:${suffix}` })) };
      }),
    },
  };
}

const screenClipId = (project, suffix) => project.timeline.tracks
  .flatMap((track) => track.clips)
  .find((clip) => clip.mediaId.endsWith(':screen') && clip.id.endsWith(`:${suffix}`)).id;

test('an untouched project exports exactly as before: no gains, an unsplit take stays a single clip', () => {
  const project = recordingProject();
  const recording = resolveTimelineExportRecording(project, getPrimaryRecording(project));
  assert.deepEqual(recording.timelineSegments, []);
  assert.equal(recording.sourceTimingSegments.some((segment) => 'audioGain' in segment), false);
  const split = splitProject(project);
  const splitRecording = resolveTimelineExportRecording(split, getPrimaryRecording(split));
  assert.deepEqual(splitRecording.timelineSegments, [
    { timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30 },
    { timelineIn: 30, timelineOut: 90, sourceIn: 60, sourceOut: 120 },
  ]);
});

test('track volume on an unsplit take sends it through the per-section path with that gain', () => {
  const project = withRecordingAudioLevel(recordingProject(), { volume: 0.5 });
  const recording = resolveTimelineExportRecording(project, getPrimaryRecording(project));
  assert.equal(recording.timelineSegments.length, 1);
  assert.equal(recording.timelineSegments[0].audioGain, 0.5);
  const muted = withRecordingAudioLevel(recordingProject(), { muted: true });
  assert.equal(resolveTimelineExportRecording(muted, getPrimaryRecording(muted)).timelineSegments[0].audioGain, 0);
});

test('each section carries its clip volume times the track volume', () => {
  let project = splitProject(recordingProject());
  project = withClipAudioLevel(project, [screenClipId(project, 'b')], { volume: 0.5 });
  project = withRecordingAudioLevel(project, { volume: 2 });
  const recording = resolveTimelineExportRecording(project, getPrimaryRecording(project));
  // 100% x 200% = 2 for the first section; 50% x 200% = 1 (as recorded) for the second.
  assert.deepEqual(recording.timelineSegments.map((segment) => segment.audioGain ?? 1), [2, 1]);
  const muted = withClipAudioLevel(project, [screenClipId(project, 'a')], { muted: true });
  assert.deepEqual(resolveTimelineExportRecording(muted, getPrimaryRecording(muted)).timelineSegments.map((segment) => segment.audioGain ?? 1), [0, 1]);
});

test('the audio filter gives each section its own volume, and limits only boosted sound', () => {
  const segments = [
    { timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30, audioGain: 0.5 },
    { timelineIn: 30, timelineOut: 90, sourceIn: 60, sourceOut: 120 },
  ];
  const quieter = buildRawTimelineExportArgs({ inputPath: '/tmp/in.mp4', outputPath: '/tmp/out.mp4', sourceWidth: 1280, sourceHeight: 720, fps: 30, durationFrames: 90, segments, includeAudio: true }).join(' ');
  assert.match(quieter, /\[0:a\]atrim=start=0:end=1,asetpts=PTS-STARTPTS,afade=t=out:st=0\.933:d=0\.067,volume=0\.5,adelay=0:all=1\[audio_seg_0\]/);
  assert.match(quieter, /\[0:a\]atrim=start=2:end=4,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0\.067,adelay=1000:all=1\[audio_seg_1\]/);
  assert.match(quieter, /normalize=0\[a\]/);
  assert.doesNotMatch(quieter, /alimiter/);

  const boosted = buildRawTimelineExportArgs({ inputPath: '/tmp/in.mp4', outputPath: '/tmp/out.mp4', sourceWidth: 1280, sourceHeight: 720, fps: 30, durationFrames: 90, segments: [{ ...segments[0], audioGain: 2 }, segments[1]], includeAudio: true }).join(' ');
  assert.match(boosted, /volume=2,adelay=0/);
  assert.match(boosted, /normalize=0\[a_boosted\];\[a_boosted\]alimiter=limit=0\.89:level=false:latency=true\[a\]/);

  const plain = buildRawTimelineExportArgs({ inputPath: '/tmp/in.mp4', outputPath: '/tmp/out.mp4', sourceWidth: 1280, sourceHeight: 720, fps: 30, durationFrames: 90, segments: segments.map(({ audioGain, ...rest }) => (void audioGain, rest)), includeAudio: true }).join(' ');
  assert.doesNotMatch(plain, /volume=|alimiter/);
});

test('styled export applies the same section volumes, joins and fades unchanged', () => {
  const segments = [
    { timelineIn: 0, timelineOut: 30, sourceIn: 0, sourceOut: 30, audioGain: 0 },
    { timelineIn: 30, timelineOut: 90, sourceIn: 60, sourceOut: 120, audioGain: 1.5 },
  ];
  const args = buildStyledExportArgs({ inputPath: '/tmp/in.mp4', outputPath: '/tmp/out.mp4', sourceWidth: 1280, sourceHeight: 720, sourceFps: 30, timelineSegments: segments, timelineAudioSegments: segments, timelineDurationFrames: 90, sourceHasAudio: true }).join(' ');
  // Source jumps 30 -> 60 at the join, so both sides keep their 2-frame fades; the volume comes after them.
  assert.match(args, /atrim=start=0:end=1,asetpts=PTS-STARTPTS,afade=t=out:st=0\.933:d=0\.067,volume=0,adelay=0:all=1/);
  assert.match(args, /atrim=start=2:end=4,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0\.067,volume=1\.5,adelay=1000:all=1/);
  assert.match(args, /alimiter=limit=0\.89:level=false:latency=true\[a\]/);
  assert.match(args, /-map \[a\]/);
});

async function stubFfmpeg(root) {
  const binDir = join(root, 'bin');
  const callsPath = join(root, 'ffmpeg-calls.txt');
  await mkdir(binDir, { recursive: true });
  await writeFile(join(binDir, 'ffprobe'), '#!/usr/bin/env bash\nprintf \'{"streams":[{"index":1}]}\'\n');
  // Logs every call on one line, writes a non-empty output file (never to "-", the measuring pass's null output).
  await writeFile(join(binDir, 'ffmpeg'), `#!/usr/bin/env bash\necho "$*" >> "${callsPath}"\nlast="\${@: -1}"\nif [ "$last" != "-" ]; then printf encoded > "$last"; fi\n`);
  await Promise.all([chmod(join(binDir, 'ffprobe'), 0o755), chmod(join(binDir, 'ffmpeg'), 0o755)]);
  return { binDir, callsPath };
}

test('a raw export with the track at 50% re-encodes with the gain and is not auto-leveled', { skip: BASH_STUBS }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'rough-cut-volume-export-'));
  const sourcePath = join(root, 'source.mp4');
  await writeFile(sourcePath, Buffer.from('source'));
  const { binDir, callsPath } = await stubFfmpeg(root);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}:${originalPath ?? ''}`;
  try {
    const project = withRecordingAudioLevel(recordingProject(sourcePath), { volume: 0.5 });
    const result = await exportProjectToMp4({ project, outputPath: join(root, 'out.mp4'), mode: 'raw' });
    assert.equal(result.byteEqualCandidate, false);
    const calls = (await readFile(callsPath, 'utf8')).trim().split('\n');
    assert.equal(calls.length, 1, 'only the export itself; no loudness measuring pass');
    assert.match(calls[0], /volume=0\.5/);
    assert.doesNotMatch(calls[0], /ebur128/);

    // Clip volumes alone keep the usual quiet-export leveling (it measures first).
    await rm(callsPath, { force: true });
    const split = splitProject(recordingProject(sourcePath));
    const clipOnly = withClipAudioLevel(split, [screenClipId(split, 'a')], { volume: 0.5 });
    await exportProjectToMp4({ project: clipOnly, outputPath: join(root, 'out-2.mp4'), mode: 'raw' });
    const clipCalls = (await readFile(callsPath, 'utf8')).trim().split('\n');
    assert.ok(clipCalls.some((call) => /ebur128/.test(call)), 'leveling still measures');
    assert.match(clipCalls[0], /volume=0\.5/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
});
