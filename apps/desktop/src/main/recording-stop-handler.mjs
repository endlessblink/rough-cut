import { writeRecordingDiagnosticsReport as defaultWriteRecordingDiagnosticsReport } from './recording-diagnostics.mjs';

export async function stopRecordingAndCreateProject({
  recordingSession,
  assertReadableMp4,
  remuxMkvToMp4,
  saveProjectForRecording,
  formatProject,
  writeRecordingDiagnosticsReport = defaultWriteRecordingDiagnosticsReport,
}) {
  console.info('[recording:stop] stopping active recording session');
  const result = await recordingSession.stop();
  console.info('[recording:stop] session stopped', summarizeRecordingResult(result));
  if (result.state !== 'saved') return result;

  const remuxLogs = [];
  const remuxWarnings = [];
  const onRemuxLog = (line) => {
    remuxLogs.push(line);
    console.info(line);
  };
  const captureRemuxWarning = (label, remuxResult) => {
    if (remuxResult && typeof remuxResult === 'object' && remuxResult.warning) {
      remuxWarnings.push({ source: label, message: remuxResult.warning });
    }
  };
  console.info(`[recording:stop] remuxing screen recording ${result.rawPath} -> ${result.outputPath}`);
  captureRemuxWarning('screen', await remuxMkvToMp4({ rawPath: result.rawPath, outputPath: result.outputPath, onLog: onRemuxLog }));
  await assertReadableMp4(result.outputPath);
  console.info(`[recording:stop] screen recording is readable: ${result.outputPath}`);
  let recordingForProject = result;
  if (result.cameraRawPath && result.cameraOutputPath) {
    try {
      console.info(`[recording:stop] remuxing camera recording ${result.cameraRawPath} -> ${result.cameraOutputPath}`);
      captureRemuxWarning('camera', await remuxMkvToMp4({ rawPath: result.cameraRawPath, outputPath: result.cameraOutputPath, onLog: onRemuxLog }));
      await assertReadableMp4(result.cameraOutputPath);
      console.info(`[recording:stop] camera recording is readable: ${result.cameraOutputPath}`);
    } catch (err) {
      const cameraError = err instanceof Error ? err.message : String(err);
      console.warn(`[recording:stop] camera recording unavailable; saving screen-only project: ${cameraError}`);
      recordingForProject = {
        ...result,
        cameraRawPath: null,
        cameraOutputPath: null,
        camera: null,
        cameraError,
      };
    }
  }
  const project = await saveProjectForRecording(recordingForProject);
  console.info(`[recording:stop] saved project ${project.path}`);
  let diagnosticsPath = null;
  try {
    const diagnostics = await writeRecordingDiagnosticsReport({
      recording: recordingForProject,
      projectPath: project.path,
      remuxLogs,
    });
    diagnosticsPath = diagnostics.path;
  } catch (err) {
    console.warn('[recording-diagnostics] failed:', err?.message ?? err);
  }
  const formattedProject = formatProject(project);
  console.info('[recording:stop] returning saved recording', {
    outputPath: recordingForProject.outputPath,
    projectPath: formattedProject.path,
    hasMediaUrl: Boolean(formattedProject.mediaUrl),
    hasCamera: Boolean(recordingForProject.camera),
    cameraError: recordingForProject.cameraError ?? null,
  });
  return { ...recordingForProject, diagnosticsPath, project: formattedProject, remuxWarnings };
}

function summarizeRecordingResult(result) {
  if (!result || result.state !== 'saved') return result;
  return {
    state: result.state,
    rawPath: result.rawPath,
    outputPath: result.outputPath,
    cameraRawPath: result.cameraRawPath ?? null,
    cameraOutputPath: result.cameraOutputPath ?? null,
    cameraError: result.cameraError ?? null,
  };
}
