import { writeRecordingDiagnosticsReport as defaultWriteRecordingDiagnosticsReport } from './recording-diagnostics.mjs';
import { validateRemuxedMp4 as defaultValidateRemuxedMp4 } from './remux-service.mjs';

export async function stopRecordingAndCreateProject({
  recordingSession,
  assertReadableMp4,
  remuxMkvToMp4,
  remuxMkvSegmentsToMp4 = null,
  saveProjectForRecording,
  formatProject,
  probeVideoTiming = null,
  probeVideoStreamsTiming = null,
  computeSyncedRecordingTiming = null,
  validateRemuxedMp4 = defaultValidateRemuxedMp4,
  writeRecordingDiagnosticsReport = defaultWriteRecordingDiagnosticsReport,
}) {
  const timing = createPhaseTimer('recording:stop');
  console.info('[recording:stop] phase=session-stop-begin');
  const result = await recordingSession.stop();
  console.info('[recording:stop] phase=session-stop-done', summarizeRecordingResult(result));
  timing.mark('session-stop');
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
  const screenRawSegments = Array.isArray(result.rawSegments) && result.rawSegments.length > 0 ? result.rawSegments : null;
  captureRemuxWarning('screen', screenRawSegments && typeof remuxMkvSegmentsToMp4 === 'function'
    ? await remuxMkvSegmentsToMp4({
        rawPaths: screenRawSegments,
        outputPath: result.outputPath,
        maps: isUnifiedCapture ? ['0:v:0', '0:a?'] : ['0'],
        onLog: onRemuxLog,
        validate: skipDeepRemuxValidation,
      })
    : await remuxMkvToMp4({
        rawPath: result.rawPath,
        outputPath: result.outputPath,
        maps: isUnifiedCapture ? ['0:v:0', '0:a?'] : ['0'],
        onLog: onRemuxLog,
        validate: skipDeepRemuxValidation,
  }));
  console.info('[recording:stop] phase=screen-remux-done');
  timing.mark('screen-remux');
  console.info('[recording:stop] phase=screen-assert-begin');
  await assertReadableMp4(result.outputPath);
  console.info(`[recording:stop] phase=screen-assert-done ${result.outputPath}`);
  timing.mark('screen-assert');
  let recordingForProject = result;
  if (result.cameraRawPath && result.cameraOutputPath) {
    try {
      console.info(`[recording:stop] phase=camera-remux-begin ${result.cameraRawPath} -> ${result.cameraOutputPath}`);
      const cameraRawSegments = Array.isArray(result.cameraRawSegments) && result.cameraRawSegments.length > 0 ? result.cameraRawSegments : null;
      captureRemuxWarning('camera', cameraRawSegments && typeof remuxMkvSegmentsToMp4 === 'function'
        ? await remuxMkvSegmentsToMp4({
            rawPaths: cameraRawSegments,
            outputPath: result.cameraOutputPath,
            maps: isUnifiedCapture ? [`0:v:${result.camera?.sourceStreamIndex ?? 1}`] : ['0'],
            onLog: onRemuxLog,
            validate: skipDeepRemuxValidation,
          })
        : await remuxMkvToMp4({
            rawPath: result.cameraRawPath,
            outputPath: result.cameraOutputPath,
            maps: isUnifiedCapture ? [`0:v:${result.camera?.sourceStreamIndex ?? 1}`] : ['0'],
            onLog: onRemuxLog,
            validate: skipDeepRemuxValidation,
      }));
      console.info('[recording:stop] phase=camera-remux-done');
      timing.mark('camera-remux');
      console.info('[recording:stop] phase=camera-assert-begin');
      await assertReadableMp4(result.cameraOutputPath);
      console.info(`[recording:stop] phase=camera-assert-done ${result.cameraOutputPath}`);
      timing.mark('camera-assert');
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
  timing.mark('save-project');
  const formattedProject = formatProject(project);
  const finalization = {
    state: 'pending',
    diagnosticsPath: null,
    remuxWarnings,
    error: null,
  };
  const finalizationPromise = runDeferredFinalization({
    recordingForProject,
    project,
    remuxLogs,
    remuxWarnings,
    isUnifiedCapture,
    timing,
    validateRemuxedMp4,
    probeVideoTiming,
    probeVideoStreamsTiming,
    computeSyncedRecordingTiming,
    saveProjectForRecording,
    writeRecordingDiagnosticsReport,
  }).then((completed) => {
    Object.assign(finalization, completed);
    return finalization;
  }).catch((err) => {
    const error = err?.message ?? String(err);
    console.warn('[recording:stop] phase=deferred-finalization-failed:', error);
    Object.assign(finalization, { state: 'failed', error });
    return finalization;
  });
  console.info('[recording:stop] phase=returning', {
    outputPath: recordingForProject.outputPath,
    projectPath: formattedProject.path,
    hasMediaUrl: Boolean(formattedProject.mediaUrl),
    hasCamera: Boolean(recordingForProject.camera),
    cameraError: recordingForProject.cameraError ?? null,
  });
  timing.mark('return');
  const response = {
    ...recordingForProject,
    diagnosticsPath: null,
    project: formattedProject,
    remuxWarnings,
    finalization,
  };
  Object.defineProperty(response, 'finalizationPromise', {
    value: finalizationPromise,
    enumerable: false,
  });
  return response;
}

async function runDeferredFinalization({
  recordingForProject,
  project,
  remuxLogs,
  remuxWarnings,
  isUnifiedCapture,
  timing,
  validateRemuxedMp4,
  probeVideoTiming,
  probeVideoStreamsTiming,
  computeSyncedRecordingTiming,
  saveProjectForRecording,
  writeRecordingDiagnosticsReport,
}) {
  let finalizedRecording = recordingForProject;
  try {
    console.info('[recording:stop] phase=deep-validate-begin');
    captureRemuxWarning('screen', remuxWarnings, await validateRemuxedMp4(recordingForProject.outputPath));
    if (recordingForProject.camera?.outputPath) {
      captureRemuxWarning('camera', remuxWarnings, await validateRemuxedMp4(recordingForProject.camera.outputPath));
    }
    console.info('[recording:stop] phase=deep-validate-done');
    timing.mark('deep-validate');
  } catch (err) {
    console.warn('[recording:stop] phase=deep-validate-failed:', err?.message ?? err);
    timing.mark('deep-validate-failed');
  }

  if (typeof probeVideoTiming === 'function' && typeof computeSyncedRecordingTiming === 'function') {
    try {
      finalizedRecording = await probeSyncedRecording({
        recordingForProject: finalizedRecording,
        isUnifiedCapture,
        probeVideoTiming,
        probeVideoStreamsTiming,
        computeSyncedRecordingTiming,
      });
      console.info('[recording:stop] phase=sync-save-project-begin');
      await saveProjectForRecording(finalizedRecording);
      console.info(`[recording:stop] phase=sync-save-project-done ${project.path}`);
      timing.mark('sync-probe-and-save');
    } catch (err) {
      console.warn('[recording:stop] phase=sync-probe-failed:', err?.message ?? err);
      timing.mark('sync-probe-failed');
    }
  }

  let diagnosticsPath = null;
  try {
    console.info('[recording:stop] phase=diagnostics-begin');
    const diagnostics = await writeRecordingDiagnosticsReport({
      recording: finalizedRecording,
      projectPath: project.path,
      remuxLogs,
    });
    diagnosticsPath = diagnostics.path;
    console.info('[recording:stop] phase=diagnostics-done');
    timing.mark('diagnostics');
  } catch (err) {
    console.warn('[recording:stop] phase=diagnostics-failed:', err?.message ?? err);
    timing.mark('diagnostics-failed');
  }

  return {
    state: 'complete',
    diagnosticsPath,
    remuxWarnings,
    error: null,
  };
}

async function probeSyncedRecording({
  recordingForProject,
  isUnifiedCapture,
  probeVideoTiming,
  probeVideoStreamsTiming,
  computeSyncedRecordingTiming,
}) {
  console.info('[recording:stop] phase=sync-probe-begin');
  let screenTiming = null;
  let cameraTiming = null;
  let cameraSourceInFrames = recordingForProject.camera?.sourceInFrames ?? 0;
  let recordingWithTiming = recordingForProject;
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
      recordingWithTiming = {
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
    && recordingWithTiming.cameraError === sync.syncWarning;
  const finalized = {
    ...recordingWithTiming,
    cameraError: leakedSyncWarningAsCameraError ? null : recordingWithTiming.cameraError,
    sync,
  };
  console.info('[recording:stop] phase=sync-probe-done', sync);
  return finalized;
}

function captureRemuxWarning(label, remuxWarnings, remuxResult) {
  if (remuxResult && typeof remuxResult === 'object' && remuxResult.warning) {
    remuxWarnings.push({ source: label, message: remuxResult.warning });
  }
}

async function skipDeepRemuxValidation() {
  return { coherent: true, integrity: null, warning: null };
}

function createPhaseTimer(label) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  return {
    mark(phase) {
      const now = Date.now();
      console.info(`[${label}] timing phase=${phase} ms=${now - lastAt} totalMs=${now - startedAt}`);
      lastAt = now;
    },
  };
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
