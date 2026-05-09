import { writeRecordingDiagnosticsReport as defaultWriteRecordingDiagnosticsReport } from './recording-diagnostics.mjs';

export async function stopRecordingAndCreateProject({
  recordingSession,
  assertReadableMp4,
  remuxMkvToMp4,
  saveProjectForRecording,
  formatProject,
  writeRecordingDiagnosticsReport = defaultWriteRecordingDiagnosticsReport,
}) {
  console.info('[recording:stop] phase=session-stop-begin');
  const result = await recordingSession.stop();
  console.info('[recording:stop] phase=session-stop-done', summarizeRecordingResult(result));
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
  console.info(`[recording:stop] phase=screen-remux-begin ${result.rawPath} -> ${result.outputPath}`);
  captureRemuxWarning('screen', await remuxMkvToMp4({ rawPath: result.rawPath, outputPath: result.outputPath, onLog: onRemuxLog }));
  console.info('[recording:stop] phase=screen-remux-done');
  console.info('[recording:stop] phase=screen-assert-begin');
  await assertReadableMp4(result.outputPath);
  console.info(`[recording:stop] phase=screen-assert-done ${result.outputPath}`);
  let recordingForProject = result;
  if (result.cameraRawPath && result.cameraOutputPath) {
    try {
      console.info(`[recording:stop] phase=camera-remux-begin ${result.cameraRawPath} -> ${result.cameraOutputPath}`);
      captureRemuxWarning('camera', await remuxMkvToMp4({ rawPath: result.cameraRawPath, outputPath: result.cameraOutputPath, onLog: onRemuxLog }));
      console.info('[recording:stop] phase=camera-remux-done');
      console.info('[recording:stop] phase=camera-assert-begin');
      await assertReadableMp4(result.cameraOutputPath);
      console.info(`[recording:stop] phase=camera-assert-done ${result.cameraOutputPath}`);
    } catch (err) {
      const cameraError = err instanceof Error ? err.message : String(err);
      console.warn(`[recording:stop] phase=camera-failed; falling back to screen-only: ${cameraError}`);
      recordingForProject = {
        ...result,
        cameraRawPath: null,
        cameraOutputPath: null,
        camera: null,
        cameraError,
      };
    }
  }
  console.info('[recording:stop] phase=save-project-begin');
  const project = await saveProjectForRecording(recordingForProject);
  console.info(`[recording:stop] phase=save-project-done ${project.path}`);
  let diagnosticsPath = null;
  try {
    console.info('[recording:stop] phase=diagnostics-begin');
    const diagnostics = await writeRecordingDiagnosticsReport({
      recording: recordingForProject,
      projectPath: project.path,
      remuxLogs,
    });
    diagnosticsPath = diagnostics.path;
    console.info('[recording:stop] phase=diagnostics-done');
  } catch (err) {
    console.warn('[recording:stop] phase=diagnostics-failed:', err?.message ?? err);
  }
  const formattedProject = formatProject(project);
  console.info('[recording:stop] phase=returning', {
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
