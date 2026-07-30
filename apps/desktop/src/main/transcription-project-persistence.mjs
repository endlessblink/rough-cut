import { openProjectFile, saveProjectFile } from './project-files.mjs';

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function persistTranscriptToProject({
  projectPath,
  transcript,
  jobId,
  provider,
  fps,
  openProject = openProjectFile,
  saveProject = saveProjectFile,
}) {
  if (typeof projectPath !== 'string' || !projectPath) {
    throw new Error('Transcript project path is required');
  }
  if (
    !transcript ||
    !Array.isArray(transcript.words) ||
    !Array.isArray(transcript.paragraphs) ||
    !Array.isArray(transcript.nonSpeech)
  ) {
    throw new Error('A complete transcript is required');
  }
  if (
    typeof jobId !== 'string' ||
    !jobId ||
    !provider ||
    !['local', 'cloud'].includes(provider.kind) ||
    typeof provider.id !== 'string' ||
    !provider.id ||
    typeof provider.model !== 'string' ||
    !provider.model ||
    !Number.isFinite(fps) ||
    fps <= 0
  ) {
    throw new Error('Complete transcription provenance is required');
  }
  const transcription = {
    jobId,
    provider: structuredClone(provider),
    fps,
  };

  const opened = await openProject(projectPath);
  if (
    sameValue(opened.document.transcript, transcript) &&
    sameValue(opened.document.transcription, transcription)
  ) {
    return { ...opened, changed: false };
  }
  const saved = await saveProject(projectPath, {
    ...opened.document,
    transcript: structuredClone(transcript),
    transcription,
  });
  return { ...saved, changed: true };
}
