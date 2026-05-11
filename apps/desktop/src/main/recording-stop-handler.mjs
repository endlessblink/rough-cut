import { writeRecordingDiagnosticsReport as defaultWriteRecordingDiagnosticsReport } from './recording-diagnostics.mjs';

export async function stopRecordingAndCreateProject({
  recordingSession,
  assertReadableMp4,
  remuxMkvToMp4,
  saveProjectForRecording,
  formatProject,
  probeVideoTiming = null,
  probeVideoStreamsTiming = null,
  computeSyncedRecordingTiming = null,
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
  const isUnifiedCapture = Boolean(result.cameraRawPath && result.cameraRawPath === result.rawPath);
  captureRemuxWarning('screen', await remuxMkvToMp4({
    rawPath: result.rawPath,
    outputPath: result.outputPath,
    maps: isUnifiedCapture ? ['0:v:0', '0:a?'] : ['0'],
    onLog: onRemuxLog,
  }));
  console.info('[recording:stop] phase=screen-remux-done');
  console.info('[recording:stop] phase=screen-assert-begin');
  await assertReadableMp4(result.outputPath);
  console.info(`[recording:stop] phase=screen-assert-done ${result.outputPath}`);
  let recordingForProject = result;
  if (result.cameraRawPath && result.cameraOutputPath) {
    try {
      console.info(`[recording:stop] phase=camera-remux-begin ${result.cameraRawPath} -> ${result.cameraOutputPath}`);
      captureRemuxWarning('camera', await remuxMkvToMp4({
        rawPath: result.cameraRawPath,
        outputPath: result.cameraOutputPath,
        maps: isUnifiedCapture ? [`0:v:${result.camera?.sourceStreamIndex ?? 1}`] : ['0'],
        onLog: onRemuxLog,
      }));
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
  if (typeof probeVideoTiming === 'function' && typeof computeSyncedRecordingTiming === 'function') {
    try {
      console.info('[recording:stop] phase=sync-probe-begin');
      let screenTiming = null;
      let cameraTiming = null;
      let cameraSourceInFrames = recordingForProject.camera?.sourceInFrames ?? 0;
      if (isUnifiedCapture && typeof probeVideoStreamsTiming === 'function') {
        const streams = await probeVideoStreamsTiming(recordingForProject.rawPath, { fps: recordingForProject.fps });
        const screenStream = streams.find((stream) => stream.index === 0) ?? streams[0] ?? null;
        const cameraStreamIndex = recordingForProject.camera?.sourceStreamIndex ?? 1;
        const cameraStream = streams.find((stream) => stream.index === cameraStreamIndex) ?? streams[1] ?? null;
        screenTiming = screenStream;
        cameraTiming = cameraStream;
        if (screenStream && cameraStream) {
          cameraSourceInFrames = Math.max(
            0,
            Math.round(((cameraStream.startTimeSeconds ?? 0) - (screenStream.startTimeSeconds ?? 0)) * recordingForProject.fps),
          );
          recordingForProject = {
            ...recordingForProject,
            camera: recordingForProject.camera
              ? {
                  ...recordingForProject.camera,
                  sourceInFrames: cameraSourceInFrames,
                  streamTiming: cameraStream,
                }
              : null,
            streamTiming: { screen: screenStream, camera: cameraStream },
          };
        }
      } else {
        screenTiming = await probeVideoTiming(recordingForProject.outputPath, { fps: recordingForProject.fps });
        cameraTiming = recordingForProject.camera?.outputPath
          ? await probeVideoTiming(recordingForProject.camera.outputPath, { fps: recordingForProject.fps })
          : null;
      }
      const sync = computeSyncedRecordingTiming({
        screen: screenTiming,
        camera: cameraTiming,
        cameraSourceInFrames,
        fps: recordingForProject.fps,
      });
      const leakedSyncWarningAsCameraError = sync.syncWarning
        && recordingForProject.cameraError === sync.syncWarning;
      recordingForProject = {
        ...recordingForProject,
        cameraError: leakedSyncWarningAsCameraError ? null : recordingForProject.cameraError,
        sync,
      };
      console.info('[recording:stop] phase=sync-probe-done', sync);
    } catch (err) {
      console.warn('[recording:stop] phase=sync-probe-failed:', err?.message ?? err);
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
