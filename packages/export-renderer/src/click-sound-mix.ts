/**
 * Click sound mixing for the audio export pipeline.
 *
 * `collectClickTimestamps` walks the project's recording assets and produces
 * a sorted, timeline-domain (seconds) list of click moments that should
 * receive a synthesized click SFX, gated by:
 *   - `exportSettings.keepClickSounds` (per-export override)
 *   - `cursor.clickSoundEnabled` on the recording's presentation
 *
 * `mixClicksIntoFloat32` mixes the click waveform into an existing PCM
 * buffer at the given timeline offsets, writing in-place. Caller passes
 * the buffer's channel data and start timestamp; clicks outside the buffer
 * window are skipped.
 */
import type { ProjectDocument } from '@rough-cut/project-model';
import { CLICK_SOUND_DURATION_SEC } from './click-sound-synth.js';

export interface ClickTimestampSource {
  /** All click timestamps in timeline-domain seconds, sorted ascending. */
  readonly timestampsSec: readonly number[];
}

interface CursorFrameDataLike {
  readonly frames: Float32Array;
  readonly frameCount: number;
}

/**
 * Pull click timestamps out of the per-asset CursorFrameData maps that the
 * webcodecs export already loads. Result is sorted timeline-domain seconds.
 *
 * Returns an empty source when the export-time toggle is off, or when no
 * recording opted in. The caller should still call `mixClicksIntoFloat32`
 * — it short-circuits on an empty list.
 */
export function collectClickTimestamps(
  project: ProjectDocument,
  cursorDataByAssetId: ReadonlyMap<string, CursorFrameDataLike>,
  frameRate: number,
): ClickTimestampSource {
  if (!project.exportSettings.keepClickSounds) return { timestampsSec: [] };
  if (frameRate <= 0) return { timestampsSec: [] };

  // Index clip placements by asset so we can map source frames → timeline frames.
  const clipPlacementsByAsset = new Map<
    string,
    Array<{ timelineIn: number; sourceIn: number; sourceOut: number }>
  >();
  for (const track of project.composition.tracks) {
    for (const clip of track.clips) {
      if (!clip.enabled) continue;
      const list = clipPlacementsByAsset.get(clip.assetId) ?? [];
      list.push({
        timelineIn: clip.timelineIn,
        sourceIn: clip.sourceIn,
        sourceOut: clip.sourceOut,
      });
      clipPlacementsByAsset.set(clip.assetId, list);
    }
  }

  const timestamps: number[] = [];

  for (const asset of project.assets) {
    const cursor = asset.presentation?.cursor;
    if (!cursor?.clickSoundEnabled) continue;
    const data = cursorDataByAssetId.get(asset.id);
    if (!data) continue;
    const placements = clipPlacementsByAsset.get(asset.id);
    if (!placements || placements.length === 0) continue;

    // Scan every project-frame slot. Click flag lives in `frames[idx*3 + 2]`,
    // set to 1 by `buildCursorFrameData` exactly on 'down' event frames and
    // 0 on interpolated/non-click frames.
    for (let f = 0; f < data.frameCount; f++) {
      const flag = data.frames[f * 3 + 2];
      if (flag === undefined || flag < 0.5) continue;
      // Map this source-frame click through every placement that contains it.
      // (Same recording can be sliced into multiple clips; each appearance
      // produces its own click.)
      for (const placement of placements) {
        if (f < placement.sourceIn || f >= placement.sourceOut) continue;
        const timelineFrame = placement.timelineIn + (f - placement.sourceIn);
        timestamps.push(timelineFrame / frameRate);
      }
    }
  }

  timestamps.sort((a, b) => a - b);
  return { timestampsSec: timestamps };
}

/**
 * Mix the click waveform into a PCM channel buffer in-place.
 *
 * - `channel` is the destination buffer (caller-owned). Modified in-place.
 * - `clickPcm` is the synthesized click waveform at `sampleRate`.
 * - `bufferStartSec` is the timeline timestamp of `channel[0]`.
 * - `clickTimestampsSec` is the sorted list of click moments (timeline seconds).
 *
 * Clicks that fall outside the buffer's [start, start + duration] window are
 * skipped silently. Partial overlaps at edges are clamped.
 */
export function mixClicksIntoFloat32(
  channel: Float32Array,
  clickPcm: Float32Array,
  sampleRate: number,
  bufferStartSec: number,
  clickTimestampsSec: readonly number[],
): void {
  if (clickTimestampsSec.length === 0 || clickPcm.length === 0) return;
  if (sampleRate <= 0 || channel.length === 0) return;

  const bufferDurationSec = channel.length / sampleRate;
  const bufferEndSec = bufferStartSec + bufferDurationSec;
  // Allow clicks that started slightly before the buffer if their tail
  // bleeds into it. Offset window expanded by the click length on the left.
  const earliestRelevant = bufferStartSec - CLICK_SOUND_DURATION_SEC;

  for (const clickSec of clickTimestampsSec) {
    if (clickSec < earliestRelevant) continue;
    if (clickSec >= bufferEndSec) break; // sorted: nothing later overlaps
    const offsetSamples = Math.round((clickSec - bufferStartSec) * sampleRate);
    // Mix click samples that fall within the buffer.
    const startIn = Math.max(0, -offsetSamples);
    const startOut = Math.max(0, offsetSamples);
    const remainingClick = clickPcm.length - startIn;
    const remainingOut = channel.length - startOut;
    const copyLen = Math.min(remainingClick, remainingOut);
    if (copyLen <= 0) continue;
    for (let i = 0; i < copyLen; i++) {
      const dst = startOut + i;
      const src = startIn + i;
      const sum = (channel[dst] ?? 0) + (clickPcm[src] ?? 0);
      // Soft clip to [-1, 1] using tanh-ish saturation.
      channel[dst] = sum > 1 ? 1 - 1 / (sum + 1) : sum < -1 ? -1 + 1 / (1 - sum) : sum;
    }
  }
}
