// Project → per-lane clip blocks for the NLE Editor timeline.
// Read-only: each clip becomes a positioned rectangle with leftPct +
// widthPct normalized against `project.composition.duration`. No drag,
// trim, or playhead — TASK-140 owns the interactive timeline.

const SUPPORTED_KINDS = Object.freeze(['video', 'audio', 'captions', 'motion-graphics']);

const TRACK_TYPE_FOR_KIND = Object.freeze({
  video: 'video',
  audio: 'audio',
  // captions + motion-graphics don't exist as Track.type yet (v13 schema
  // only supports 'video' | 'audio'). They land in TASK-134 + TASK-145.
  captions: null,
  'motion-graphics': null,
});

export function buildLaneClips(project, kind) {
  if (!project || typeof project !== 'object') return [];
  if (!SUPPORTED_KINDS.includes(kind)) return [];
  const trackType = TRACK_TYPE_FOR_KIND[kind];
  if (trackType === null) return [];

  const document = project.document;
  const composition = document?.composition;
  const totalFrames = Number(composition?.duration);
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) return [];

  const tracks = Array.isArray(composition?.tracks) ? composition.tracks : [];
  const blocks = [];

  for (const track of tracks) {
    if (!track || track.type !== trackType) continue;
    const clips = Array.isArray(track.clips) ? track.clips : [];
    for (const clip of clips) {
      const block = buildClipBlock(clip, totalFrames);
      if (block) blocks.push(block);
    }
  }

  return blocks;
}

function buildClipBlock(clip, totalFrames) {
  if (!clip || typeof clip !== 'object') return null;
  const inFrame = Number(clip.timelineIn);
  const outFrame = Number(clip.timelineOut);
  if (!Number.isFinite(inFrame) || !Number.isFinite(outFrame)) return null;
  const safeIn = Math.max(0, Math.min(totalFrames, inFrame));
  const safeOut = Math.max(safeIn, Math.min(totalFrames, outFrame));
  const widthFrames = safeOut - safeIn;
  if (widthFrames <= 0) return null;

  const leftPct = (safeIn / totalFrames) * 100;
  const widthPct = (widthFrames / totalFrames) * 100;
  return {
    id: typeof clip.id === 'string' ? clip.id : null,
    assetId: typeof clip.assetId === 'string' ? clip.assetId : null,
    name: typeof clip.name === 'string' && clip.name ? clip.name : null,
    leftPct,
    widthPct,
    enabled: clip.enabled !== false,
  };
}
