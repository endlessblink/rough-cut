// Unified camera clips use the screen's virtual frame clock. Missing capture
// edges hold the boundary frame for at most 0.5s, then become absent. This keeps
// linked edits identical without pretending that boundary holds were captured.
export function unifiedCameraClock(screenStartSeconds, cameraStartSeconds, fps) {
  const delta = Math.round((cameraStartSeconds - screenStartSeconds) * fps);
  return {
    cameraClockVersion: 1,
    sourceInFrames: 0,
    cameraDelayFrames: delta,
    mediaTimeOffsetSec: cameraStartSeconds - delta / fps,
    boundaryHoldSeconds: 0.5,
  };
}

export function repairUnifiedCameraClock(document) {
  const assets = document?.assets ?? [];
  for (const recording of assets) {
    if (recording.type !== 'recording' || !recording.cameraAssetId) continue;
    const camera = assets.find(asset => asset.id === recording.cameraAssetId);
    const meta = camera?.metadata;
    if (!meta || meta.cameraClockVersion === 1 || !recording.metadata?.rawPath || recording.metadata.rawPath !== meta.rawPath) continue;
    const screenTiming = recording.metadata.streamTiming?.screen;
    const cameraTiming = meta.streamTiming ?? recording.metadata.streamTiming?.camera;
    if (!Number.isFinite(screenTiming?.startTimeSeconds) || !Number.isFinite(cameraTiming?.startTimeSeconds)) continue;
    const fps = recording.metadata.fps ?? document.settings.frameRate;
    const clock = unifiedCameraClock(screenTiming.startTimeSeconds, cameraTiming.startTimeSeconds, fps);
    const previousOffset = Math.max(0, Math.round(meta.sourceInFrames ?? 0));
    const correction = -previousOffset;
    const mediaTiming = meta.mediaTiming ?? cameraTiming;
    const cameraFrames = Math.max(1, Math.round(mediaTiming.durationFrames ?? camera.duration));
    if (Number.isFinite(meta.mediaTiming?.startTimeSeconds)) clock.mediaTimeOffsetSec = meta.mediaTiming.startTimeSeconds - clock.cameraDelayFrames / fps;
    for (const [tracks, matches] of [
      [document.composition?.tracks ?? [], clip => clip.assetId === camera.id],
      [document.timeline?.tracks ?? [], clip => clip.mediaId === `source:${recording.id}:camera`],
    ]) {
      for (const track of tracks) {
        track.clips = (track.clips ?? []).flatMap(clip => {
          if (!matches(clip)) return [clip];
          const screen = tracks.flatMap(track => track.clips ?? []).find(item => (item.assetId === recording.id || item.mediaId === `source:${recording.id}:screen`) && item.timelineIn === clip.timelineIn && item.timelineOut === clip.timelineOut);
          const shift = screen?.sourceIn === clip.sourceIn ? 0 : correction;
          const start = clip.sourceIn + shift;
          const end = clip.sourceOut + shift;
          if (start < 0) throw new Error('Camera clock repair found an invalid linked source range');
          return [{ ...clip, sourceIn: start, sourceOut: end }];
        });
      }
    }
    camera.duration = Math.max(recording.duration ?? 0, ...[...(document.composition?.tracks ?? []), ...(document.timeline?.tracks ?? [])].flatMap(track => (track.clips ?? []).filter(clip => clip.assetId === camera.id || clip.mediaId === `source:${recording.id}:camera`).map(clip => clip.sourceOut)));
    camera.metadata = { ...meta, ...clock, decodedDurationFrames: cameraFrames, decodedDurationSeconds: mediaTiming.durationSeconds ?? cameraFrames / fps };
    if (recording.metadata.sync) recording.metadata.sync = { ...recording.metadata.sync, cameraSourceInFrames: 0, cameraDelayFrames: clock.cameraDelayFrames };
  }
  return document;
}
