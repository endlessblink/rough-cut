// Cheap self-check run on every finished export (ffprobe only, no re-render).
// It catches the failures that shipped silently before: an export with no sound,
// one padded with a frozen tail (too long), or cut short. Deep checks (sync, frozen
// camera, glitches, pictures to look at) live in scripts/export-review.

import { spawn } from 'node:child_process';
import { buildCutFrameRemap, resolveTimelineExportRecording } from './export-service.mjs';
import { getPrimaryRecording } from './project-files.mjs';

/** Pure: judge an ffprobe result against what the project says the export must be. */
export function evaluateExportVerification({ probe, expectedDurationSec = null, sourceHasAudio = false, graphics = null } = {}) {
  const problems = [];
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe?.format?.duration);

  if (!video) problems.push({ id: 'no-video', message: 'The exported file has no picture.' });
  if (!Number.isFinite(duration) || duration <= 0) problems.push({ id: 'no-duration', message: 'The exported file has no length.' });

  if (sourceHasAudio && !audio) {
    problems.push({ id: 'no-sound', message: 'The export has no sound, but the recording does.' });
  }
  if (audio && Number.isFinite(duration)) {
    const audioDuration = Number(audio.duration);
    if (Number.isFinite(audioDuration) && Math.abs(audioDuration - duration) > 0.6) {
      problems.push({ id: 'sound-length', message: `The sound is ${audioDuration.toFixed(1)} s long but the picture is ${duration.toFixed(1)} s.` });
    }
  }
  if (Number.isFinite(expectedDurationSec) && expectedDurationSec > 0 && Number.isFinite(duration)) {
    const tolerance = Math.max(0.5, expectedDurationSec * 0.005);
    if (duration - expectedDurationSec > tolerance) {
      problems.push({ id: 'too-long', message: `The export is ${duration.toFixed(1)} s but should be ${expectedDurationSec.toFixed(1)} s, so its ending is probably a frozen frame.` });
    } else if (expectedDurationSec - duration > tolerance) {
      problems.push({ id: 'too-short', message: `The export is ${duration.toFixed(1)} s but should be ${expectedDurationSec.toFixed(1)} s, so part of it is missing.` });
    }
  }

  // Animated graphics: if the project has them and the export does not, say so plainly (and why).
  const expectedGraphics = Number(graphics?.expected) || 0;
  const includedGraphics = Number(graphics?.included) || 0;
  if (expectedGraphics > 0 && includedGraphics < expectedGraphics) {
    const reason = graphics?.error ? ` Reason: ${graphics.error}` : '';
    problems.push({
      id: includedGraphics === 0 ? 'graphics-missing' : 'graphics-partial',
      message: includedGraphics === 0
        ? `The project has ${expectedGraphics} animated graphic${expectedGraphics === 1 ? '' : 's'}, but none are in this export.${reason}`
        : `Only ${includedGraphics} of ${expectedGraphics} animated graphics made it into this export.${reason}`,
    });
  }

  const summary = problems.length === 0
    ? `Checked: picture${audio ? ', sound' : ''}${expectedGraphics > 0 ? ', animations' : ''} and length look right${Number.isFinite(duration) ? ` (${duration.toFixed(1)} s)` : ''}.`
    : `Problem found: ${problems.map((problem) => problem.message).join(' ')}`;
  return { ok: problems.length === 0, problems, summary, durationSec: Number.isFinite(duration) ? duration : null, hasAudio: Boolean(audio) };
}

/** What the project says this export must contain (length after hidden ranges, sound or not). */
export async function expectedExportFacts({ project, exportScope = 'timeline', mode = 'styled', probe = probeFile } = {}) {
  const recording = getPrimaryRecording(project);
  if (!recording) return { expectedDurationSec: null, sourceHasAudio: false };
  const exportRecording = resolveTimelineExportRecording(project, recording, { exportScope }) ?? recording;
  const fps = Number.isFinite(exportRecording.fps) && exportRecording.fps > 0 ? exportRecording.fps : 30;
  const frames = exportRecording.timelineDurationFrames ?? exportRecording.trimmedDuration ?? exportRecording.duration;
  // Only the styled render removes hidden ranges from the length; raw modes keep their own rules.
  const removed = mode === 'styled' ? buildCutFrameRemap(exportRecording).removedFrames : 0;
  const expectedDurationSec = mode === 'styled' && Number.isFinite(frames) ? (frames - removed) / fps : null;
  const source = await probe(recording.filePath).catch(() => null);
  return {
    expectedDurationSec,
    sourceHasAudio: Boolean(source?.streams?.some((stream) => stream.codec_type === 'audio')),
  };
}

export async function verifyExportedFile({ outputPath, project, exportScope = 'timeline', mode = 'styled', graphics = null, probe = probeFile } = {}) {
  const [probed, facts] = await Promise.all([
    probe(outputPath),
    expectedExportFacts({ project, exportScope, mode, probe }),
  ]);
  return evaluateExportVerification({ probe: probed, ...facts, graphics });
}

function probeFile(path) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err.trim().slice(0, 200)}`));
      try { resolve(JSON.parse(out || '{}')); } catch (error) { reject(error); }
    });
  });
}
