import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getPrimaryRecording } from './project-files.mjs';

export async function exportProjectToMp4({ project, outputPath, onProgress = () => undefined }) {
  const recording = getPrimaryRecording(project);
  if (!recording) throw new Error('Project has no recording to export.');
  if (!isSingleUneditedRecording(project, recording.assetId)) {
    throw new Error('Only unedited single-recording exports are supported in the MVP.');
  }

  onProgress({ phase: 'copying', progress: 0 });
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(recording.filePath, outputPath);
  const [source, exported] = await Promise.all([stat(recording.filePath), stat(outputPath)]);
  onProgress({ phase: 'complete', progress: 1 });

  return {
    outputPath,
    sourcePath: recording.filePath,
    bytes: exported.size,
    byteEqualCandidate: source.size === exported.size,
  };
}

export function isSingleUneditedRecording(project, assetId) {
  if (project.assets.length !== 1) return false;
  const tracks = project.composition.tracks;
  if (tracks.length !== 1) return false;
  const clips = tracks[0].clips;
  if (clips.length !== 1) return false;

  const clip = clips[0];
  const asset = project.assets[0];
  return (
    asset.id === assetId &&
    clip.assetId === asset.id &&
    clip.enabled === true &&
    clip.timelineIn === 0 &&
    clip.sourceIn === 0 &&
    clip.timelineOut === asset.duration &&
    clip.sourceOut === asset.duration &&
    clip.effects.length === 0 &&
    clip.keyframes.length === 0 &&
    project.composition.duration === asset.duration
  );
}
