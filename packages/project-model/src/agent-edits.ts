import { deleteClip, rippleDeleteRange, splitClip } from './timeline-commands.js';
import {
  insertMediaClip,
  removeInsertedClip,
  listInsertedClips,
  moveInsertedClip,
  placeVoiceTake,
  setVoiceOverMode,
  trimInsertedClip,
  type VoiceOverMode,
} from './inserted-media.js';
import type { Asset, Frame, ProjectDocument } from './types.js';

/**
 * Edits an agent makes on its own copy of a project (the rough-cut MCP), kept as a
 * list so Noam can take them into his own project one by one, like DaVinci Resolve's
 * "Compare with current timeline" + Accept change. Each edit names what it changes by
 * something that is the same in both projects (timeline frames, recording clip ids,
 * the added file's asset id), never by ids that only exist in the copy.
 */
export type AgentEdit =
  | { readonly op: 'cut_range'; readonly startFrame: Frame; readonly endFrame: Frame }
  | { readonly op: 'split'; readonly frame: Frame; readonly trackId?: string }
  | { readonly op: 'delete_clip'; readonly clipId: string; readonly ripple?: boolean }
  | { readonly op: 'delete_added'; readonly assetId: string; readonly ripple?: boolean }
  | { readonly op: 'insert_clip'; readonly asset: Asset; readonly frame: Frame; readonly mode: 'insert' | 'overwrite'; readonly sourceIn: Frame; readonly sourceOut: Frame }
  | { readonly op: 'add_voice_over'; readonly asset: Asset; readonly frame: Frame; readonly sourceIn: Frame; readonly sourceOut: Frame }
  | { readonly op: 'set_voice_over_mode'; readonly assetId: string; readonly mode: VoiceOverMode }
  | { readonly op: 'move_added'; readonly assetId: string; readonly frame: Frame }
  | { readonly op: 'trim_added'; readonly assetId: string; readonly edge: 'head' | 'tail'; readonly frame: Frame }
  | { readonly op: 'set_layout'; readonly captions?: boolean; readonly camera?: boolean };

export interface AgentEditEntry {
  readonly id: string;
  readonly at: string;
  readonly edit: AgentEdit;
  /** Set once Noam took it into his project (or chose to skip it). */
  readonly resolved?: 'accepted' | 'skipped';
}

/** An edit that no longer fits the project it is applied to (the clip it names is gone). */
export class AgentEditConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentEditConflict';
  }
}

export function applyAgentEdit(document: ProjectDocument, edit: AgentEdit): ProjectDocument {
  switch (edit.op) {
    case 'cut_range': {
      if (!(edit.endFrame > edit.startFrame)) throw new AgentEditConflict('The cut has no length');
      let doc = document;
      // Splitting a clip also splits its linked partners; repeat until nothing spans a boundary.
      for (const frame of [edit.startFrame, edit.endFrame]) {
        for (let i = 0; i < 20; i += 1) {
          const spanning = doc.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.timelineIn < frame && frame < clip.timelineOut);
          if (!spanning) break;
          doc = splitClip(doc, { clipId: spanning.id, frame }).document;
        }
      }
      return rippleDeleteRange(doc, { startFrame: edit.startFrame, endFrame: edit.endFrame }).document;
    }
    case 'split': {
      const track = edit.trackId ? document.timeline.tracks.find((item) => item.id === edit.trackId) : null;
      const clip = (track ? track.clips : document.timeline.tracks.flatMap((item) => item.clips))
        .find((item) => item.timelineIn < edit.frame && edit.frame < item.timelineOut);
      if (!clip) throw new AgentEditConflict('Nothing to split there any more');
      return splitClip(document, { clipId: clip.id, frame: edit.frame }).document;
    }
    case 'delete_clip': {
      if (!document.timeline.tracks.some((track) => track.clips.some((clip) => clip.id === edit.clipId))) {
        throw new AgentEditConflict('That clip is not in the project any more');
      }
      return deleteClip(document, { clipId: edit.clipId, mode: edit.ripple ? 'ripple' : 'leave-gap' }).document;
    }
    case 'delete_added':
      return removeAddedByAsset(document, edit.assetId, edit.ripple);
    case 'insert_clip':
      return insertMediaClip(document, { asset: edit.asset, frame: edit.frame, mode: edit.mode, placement: 'screen', sourceIn: edit.sourceIn, sourceOut: edit.sourceOut });
    case 'add_voice_over':
      return placeVoiceTake(document, { asset: edit.asset, frame: edit.frame, sourceIn: edit.sourceIn, sourceOut: edit.sourceOut });
    case 'set_voice_over_mode':
      return setVoiceOverMode(document, { clipId: addedClipId(document, edit.assetId), mode: edit.mode });
    case 'move_added':
      return moveInsertedClip(document, { clipId: addedClipId(document, edit.assetId), timelineIn: edit.frame });
    case 'trim_added':
      return trimInsertedClip(document, { clipId: addedClipId(document, edit.assetId), edge: edit.edge, frame: edit.frame });
    case 'set_layout': {
      let doc = document;
      if (typeof edit.captions === 'boolean') {
        const stored = (doc as unknown as { captions?: Record<string, unknown> }).captions ?? {};
        doc = { ...doc, captions: { ...stored, enabled: edit.captions } } as unknown as ProjectDocument;
      }
      if (typeof edit.camera === 'boolean') {
        const visible = edit.camera;
        doc = {
          ...doc,
          assets: doc.assets.map((asset) => {
            if (asset.type !== 'recording') return asset;
            const presentation = (asset as unknown as { presentation?: Record<string, unknown> & { camera?: Record<string, unknown> } }).presentation ?? {};
            return { ...asset, presentation: { ...presentation, camera: { ...(presentation.camera ?? {}), visible } } } as Asset;
          }),
        };
      }
      return doc;
    }
    default:
      throw new AgentEditConflict('Unknown edit');
  }
}

/** One plain line per edit, for the list Noam picks from. */
export function describeAgentEdit(edit: AgentEdit, fps = 30): string {
  const at = (frame: Frame) => formatSeconds(frame / (fps > 0 ? fps : 30));
  const name = (asset: Asset) => String((asset.metadata?.['insertedMedia'] as { name?: string } | undefined)?.name ?? asset.filePath.split(/[\\/]/).pop());
  switch (edit.op) {
    case 'cut_range': return `Cut out ${at(edit.startFrame)}–${at(edit.endFrame)}`;
    case 'split': return `Split at ${at(edit.frame)}`;
    case 'delete_clip': return `Delete a section${edit.ripple ? ' and close the gap' : ''}`;
    case 'delete_added': return 'Remove an added clip or voice-over';
    case 'insert_clip': return `${edit.mode === 'overwrite' ? 'Overwrite with' : 'Insert'} ${name(edit.asset)} at ${at(edit.frame)}`;
    case 'add_voice_over': return `Voice-over ${name(edit.asset)} at ${at(edit.frame)}`;
    case 'set_voice_over_mode': return edit.mode === 'over' ? 'Voice-over plays over the recording' : "Voice-over replaces the recording's voice";
    case 'move_added': return `Move an added clip to ${at(edit.frame)}`;
    case 'trim_added': return `Trim an added clip's ${edit.edge === 'head' ? 'start' : 'end'} to ${at(edit.frame)}`;
    case 'set_layout': return [
      typeof edit.captions === 'boolean' ? `captions ${edit.captions ? 'on' : 'off'}` : null,
      typeof edit.camera === 'boolean' ? `camera ${edit.camera ? 'shown' : 'hidden'}` : null,
    ].filter(Boolean).join(', ').replace(/^./, (letter) => letter.toUpperCase()) || 'Layout';
    default: return 'Edit';
  }
}

/** Timeline frame an edit is about, so the list can jump there. */
export function agentEditFrame(edit: AgentEdit): Frame | null {
  switch (edit.op) {
    case 'cut_range': return edit.startFrame;
    case 'split':
    case 'insert_clip':
    case 'add_voice_over':
    case 'move_added':
    case 'trim_added': return edit.frame;
    default: return null;
  }
}

function addedClipId(document: ProjectDocument, assetId: string): string {
  const clip = listInsertedClips(document).find((item) => item.assetId === assetId);
  if (!clip) throw new AgentEditConflict('That added clip is not in the project');
  return clip.clipId;
}

function removeAddedByAsset(document: ProjectDocument, assetId: string, ripple?: boolean): ProjectDocument {
  let doc = document;
  let first = listInsertedClips(doc).find((item) => item.assetId === assetId);
  if (!first) throw new AgentEditConflict('That added clip is not in the project');
  // A clip and its sound, or a split clip, are several timeline clips of the same file.
  while (first) {
    doc = removeInsertedClip(doc, { clipId: first.clipId, ripple: ripple !== false });
    first = listInsertedClips(doc).find((item) => item.assetId === assetId);
  }
  return doc;
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}
