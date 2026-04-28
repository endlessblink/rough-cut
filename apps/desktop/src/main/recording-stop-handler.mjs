export async function stopRecordingAndCreateProject({
  recordingSession,
  assertReadableMp4,
  remuxMkvToMp4,
  saveProjectForRecording,
  formatProject,
}) {
  const result = await recordingSession.stop();
  if (result.state !== 'saved') return result;

  await remuxMkvToMp4({ rawPath: result.rawPath, outputPath: result.outputPath, onLog: console.info });
  await assertReadableMp4(result.outputPath);
  const project = await saveProjectForRecording(result);
  return { ...result, project: formatProject(project) };
}
