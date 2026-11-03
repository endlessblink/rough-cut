import { describe, expect, it } from 'vitest';
import { createAsset, createProject } from './factories.js';
import { AgentEditConflict, agentEditFrame, applyAgentEdit, describeAgentEdit, type AgentEdit } from './agent-edits.js';
import { createInsertedMediaAsset, listInsertedClips, voiceOverReplaceRanges } from './inserted-media.js';
import { canonicalizeProjectDocument, type TimelineClip } from './shared-timeline.js';
import type { AssetId, ProjectDocument } from './types.js';

const REC = 'rec' as AssetId;

function project(): ProjectDocument {
  const recording = createAsset('recording', '/rec/screen.mp4', { id: REC, duration: 900, metadata: { width: 1920, height: 1080, fps: 30 } });
  const base = createProject({ assets: [recording] });
  const group = `linked:${REC}`;
  const section = (lane: string, mediaId: string, trackId: string): TimelineClip[] => [
    { id: `${lane}-a`, mediaId, trackId, linkGroupId: group, timelineIn: 0, timelineOut: 900, sourceIn: 0, sourceOut: 900 },
  ];
  return canonicalizeProjectDocument({
    ...base,
    timeline: {
      ...base.timeline,
      sources: [],
      linkedGroups: [],
      tracks: [
        { id: 'v-screen', kind: 'video' as const, index: 0, label: 'Screen', enabled: true, locked: false, muted: false, clips: section('screen', `source:${REC}:screen`, 'v-screen') },
        { id: 'a-audio', kind: 'audio' as const, index: 1, label: 'Audio', enabled: true, locked: false, muted: false, clips: section('audio', `source:${REC}:system-audio`, 'a-audio') },
      ],
      effects: [],
    },
  });
}

const spans = (doc: ProjectDocument, trackId: string) => doc.timeline.tracks.find((track) => track.id === trackId)!.clips.map((clip) => [clip.timelineIn, clip.timelineOut]);

describe('agent edits taken into Noam\'s project', () => {
  it('replay the same way on his project as on the agent copy', () => {
    const voice = createInsertedMediaAsset({ id: 'vo1', filePath: '/takes/vo1.m4a', durationFrames: 60, kind: 'voice', voiceMode: 'over' });
    const edits: AgentEdit[] = [
      { op: 'cut_range', startFrame: 300, endFrame: 360 },
      { op: 'add_voice_over', asset: voice, frame: 90, sourceIn: 0, sourceOut: 60 },
      { op: 'set_voice_over_mode', assetId: 'vo1', mode: 'replace' },
      { op: 'move_added', assetId: 'vo1', frame: 120 },
      { op: 'set_layout', captions: false, camera: false },
    ];
    const result = edits.reduce(applyAgentEdit, project());
    expect(spans(result, 'v-screen')).toEqual([[0, 300], [300, 840]]);
    expect(voiceOverReplaceRanges(result)).toEqual([[120, 180]]);
    expect((result as unknown as { captions: { enabled: boolean } }).captions.enabled).toBe(false);
    expect((result.assets.find((asset) => asset.type === 'recording') as unknown as { presentation: { camera: { visible: boolean } } }).presentation.camera.visible).toBe(false);
  });

  it('an edit about something Noam already removed is reported, not guessed', () => {
    expect(() => applyAgentEdit(project(), { op: 'move_added', assetId: 'missing', frame: 10 })).toThrow(AgentEditConflict);
    expect(() => applyAgentEdit(project(), { op: 'delete_clip', clipId: 'gone' })).toThrow(AgentEditConflict);
  });

  it('removing an added clip takes its picture and sound off together', () => {
    const clip = createInsertedMediaAsset({ id: 'c1', filePath: '/x/c1.mp4', durationFrames: 30, kind: 'clip', hasAudio: true, width: 640, height: 360, fps: 30 });
    const added = applyAgentEdit(project(), { op: 'insert_clip', asset: clip, frame: 60, mode: 'overwrite', sourceIn: 0, sourceOut: 30 });
    expect(listInsertedClips(added).length).toBe(2);
    const removed = applyAgentEdit(added, { op: 'delete_added', assetId: 'c1' });
    expect(listInsertedClips(removed)).toEqual([]);
  });

  it('reads as plain lines and knows where on the timeline it is', () => {
    expect(describeAgentEdit({ op: 'cut_range', startFrame: 300, endFrame: 360 }, 30)).toBe('Cut out 0:10.0–0:12.0');
    expect(describeAgentEdit({ op: 'set_layout', captions: false }, 30)).toBe('Captions off');
    expect(agentEditFrame({ op: 'move_added', assetId: 'a', frame: 42 })).toBe(42);
    expect(agentEditFrame({ op: 'set_layout', camera: true })).toBeNull();
  });
});
