// Export parity for Clean voice: the export must sound like the preview, which
// mixes (1 - amount) x original voice + amount x cleaned voice from the cached
// `<recording>.voice-clean.wav` (ch0 original, ch1 cleaned, on the video clock).
//
// Rather than teach every export path (raw copy, trim, timeline, styled,
// headless, captions, graphics, leveling) about a second audio input, the
// export runs on a temporary stand-in for the recording: the SAME video stream
// (stream copy: identical frames and timestamps, verified on an 18-min
// recording) with the mixed sound. Cuts, fades and leveling then apply exactly
// as they do today. The original recording is only read; the stand-in sits next
// to the export under a hidden working name and is always removed.
import { cleanedVoicePathFor, isVoiceCleanCacheFresh } from './voice-clean-service.mjs';

export function voiceCleanAmountOf(project) {
  const amount = Number(project?.settings?.voiceClean?.amount);
  return Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
}

function gain(value) {
  return String(Math.round(value * 10_000) / 10_000);
}

export function buildVoiceCleanMixSourceArgs({ sourcePath, cleanedPath, amount, outputPath }) {
  const dry = gain(1 - amount);
  const wet = gain(amount);
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel', 'error',
    '-y',
    '-i', sourcePath,
    '-i', cleanedPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    // Same mix as the preview's gain nodes; mono voice on both speakers.
    '-af', `pan=stereo|c0=${dry}*c0+${wet}*c1|c1=${dry}*c0+${wet}*c1`,
    '-c:a', 'aac',
    '-b:a', '256k',
    '-ar', '48000',
    '-movflags', '+faststart',
    outputPath,
  ];
}

/** The document with the primary recording asset pointing at another file. */
export function withPrimaryRecordingPath(project, filePath) {
  let replaced = false;
  const assets = (project?.assets ?? []).map((asset) => {
    if (replaced || (asset?.type !== 'recording' && asset?.type !== 'video')) return asset;
    replaced = true;
    return { ...asset, filePath, pathMode: 'absolute', metadata: { ...(asset.metadata ?? {}), absoluteFilePath: filePath } };
  });
  return replaced ? { ...project, assets } : project;
}

/**
 * Decides whether this export needs the clean-voice stand-in.
 * Returns null (export unchanged) when Amount is 0, there is no recording, or
 * no fresh cleaned file exists; the preview plays the plain sound then too.
 */
export async function planVoiceCleanExport({ project, isFresh = isVoiceCleanCacheFresh }) {
  const amount = voiceCleanAmountOf(project);
  if (amount <= 0) return null;
  const asset = (project?.assets ?? []).find((item) => item?.type === 'recording' || item?.type === 'video');
  const sourcePath = typeof asset?.filePath === 'string' ? asset.filePath : null;
  if (!sourcePath) return null;
  const cleanedPath = cleanedVoicePathFor(sourcePath);
  if (!(await isFresh(sourcePath, cleanedPath))) return null;
  return { amount, sourcePath, cleanedPath };
}
