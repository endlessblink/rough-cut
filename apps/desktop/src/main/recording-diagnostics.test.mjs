import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecordingDiagnosticsReport, diagnosticsPathForRecording } from './recording-diagnostics.mjs';

const recording = {
  startedAt: '2026-04-28T12:00:00.000Z',
  stoppedAt: '2026-04-28T12:00:03.000Z',
  rawPath: '/tmp/capture.mkv',
  outputPath: '/tmp/capture.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  cursorTelemetryPath: '/tmp/capture.cursor.json',
  cursorEvents: [
    { frame: 0, x: 10, y: 20, type: 'move' },
    { frame: 10, x: 30, y: 40, type: 'down', button: 0 },
    { frame: 11, x: 30, y: 40, type: 'up', button: 0 },
  ],
  audio: { micSource: 'alsa_input.test' },
};

test('buildRecordingDiagnosticsReport summarizes media, cursor, and remux health', () => {
  const report = buildRecordingDiagnosticsReport({
    recording,
    projectPath: '/tmp/capture.roughcut',
    generatedAt: '2026-04-28T12:00:04.000Z',
    remuxLogs: ['[remux] ok'],
    probe: {
      format: { durationSeconds: 2.967 },
      video: { codec: 'h264', width: 1920, height: 1080, avgFrameRate: '30/1', durationSeconds: 2.967, frames: 89 },
      audio: { codec: 'aac', width: null, height: null, avgFrameRate: '0/0', durationSeconds: 2.967, frames: null },
    },
  });

  assert.equal(report.version, 1);
  assert.equal(report.status, 'ok');
  assert.equal(report.recording.expectedDurationMs, 3000);
  assert.equal(report.recording.mediaDurationMs, 2967);
  assert.equal(report.recording.durationDeltaMs, -33);
  assert.equal(report.media.hasVideo, true);
  assert.equal(report.media.hasAudio, true);
  assert.equal(report.media.expectedAudio, true);
  assert.equal(report.cursor.totalEvents, 3);
  assert.equal(report.cursor.moveEvents, 1);
  assert.equal(report.cursor.buttonEvents, 2);
  assert.equal(report.cursor.firstFrame, 0);
  assert.equal(report.cursor.lastFrame, 11);
});

test('buildRecordingDiagnosticsReport flags remux frame drop or queue warnings', () => {
  const report = buildRecordingDiagnosticsReport({
    recording: { ...recording, audio: null },
    remuxLogs: [
      '[ffmpeg] Thread message queue blocking; consider raising thread_queue_size',
      'frame=20 fps=10 drop=4',
    ],
    probe: { format: { durationSeconds: 3 }, video: { codec: 'h264' }, audio: null },
  });

  assert.equal(report.status, 'warning');
  assert.equal(report.media.expectedAudio, false);
  assert.equal(report.remux.frameDrops, 4);
  assert.equal(report.remux.queueWarnings, 1);
  assert.equal(report.remux.hasDropOrQueueWarnings, true);
  assert.equal(report.remux.warningLines.length, 2);
});

test('diagnosticsPathForRecording writes next to output mp4', () => {
  assert.equal(diagnosticsPathForRecording('/tmp/foo/bar.mp4'), '/tmp/foo/bar.diagnostics.json');
  assert.equal(diagnosticsPathForRecording('/tmp/foo/bar.m4v'), '/tmp/foo/bar.m4v.diagnostics.json');
});
