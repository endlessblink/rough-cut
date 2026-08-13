import { basename } from 'node:path';
import { openProjectFile, saveProjectFile } from '../apps/desktop/src/main/project-files.mjs';
import { restoreRecordingOriginalState } from '../apps/desktop/src/renderer/src/recording-timeline.mjs';

const projectPath = process.argv[2];
if (!projectPath || !projectPath.endsWith('.roughcut')) {
  throw new Error(`Usage: node scripts/restore-recording-original.mjs <project.roughcut>`);
}

const opened = await openProjectFile(projectPath);
const recording = opened.document.assets?.find((asset) => asset.type === 'recording');
if (!recording) throw new Error(`No recording asset found in ${basename(projectPath)}`);

const restored = restoreRecordingOriginalState(opened.document, { assetId: recording.id });
const saved = await saveProjectFile(projectPath, restored);
const restoredRecording = saved.document.assets.find((asset) => asset.id === recording.id);
const screenClips = saved.document.timeline?.tracks?.flatMap((track) => track.clips ?? [])
  .filter((clip) => clip.mediaId === `source:${recording.id}:screen`) ?? [];
const cameraClips = saved.document.timeline?.tracks?.flatMap((track) => track.clips ?? [])
  .filter((clip) => clip.mediaId === `source:${recording.id}:camera`) ?? [];

console.log(JSON.stringify({
  path: saved.path,
  projectId: saved.document.id,
  duration: restoredRecording?.duration ?? null,
  screenClips: screenClips.length,
  cameraClips: cameraClips.length,
  markers: saved.document.timeline?.markers?.length ?? 0,
  effects: saved.document.timeline?.effects?.length ?? 0,
  zoomMarkers: restoredRecording?.presentation?.zoom?.markers?.length ?? 0,
}, null, 2));
