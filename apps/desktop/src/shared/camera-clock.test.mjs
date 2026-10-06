import test from 'node:test';
import assert from 'node:assert/strict';
import { unifiedCameraClock, repairUnifiedCameraClock } from './camera-clock.mjs';
import { createProjectForRecording, getPrimaryRecording } from '../main/project-files.mjs';
import { computeSyncedRecordingTiming } from '../main/media-probe.mjs';
import {canonicalizeProjectDocument, splitClip, trimClipEdge, moveClip, deleteClip} from '../../../../packages/project-model/dist/index.js';
import {restoreRecordingOriginalState} from '../renderer/src/recording-timeline.mjs';

function recordingProject() {
 return canonicalizeProjectDocument(createProjectForRecording({recording:{outputPath:'/screen.mp4',rawPath:'/shared.mkv',width:1920,height:1080,fps:30,startedAt:'2026-10-04T00:00:00Z',stoppedAt:'2026-10-04T00:00:03Z',sync:{cameraFrames:88,syncedDurationFrames:90},camera:{outputPath:'/camera.mp4',rawPath:'/shared.mkv',streamTiming:{durationSeconds:88/30},...unifiedCameraClock(0,2/30,30)}}}));
}
function ranges(document) {return document.timeline.tracks.filter(t=>t.clips.length).map(t=>t.clips.map(({timelineIn,timelineOut,sourceIn,sourceOut})=>({timelineIn,timelineOut,sourceIn,sourceOut})));}
function assertLinked(document){const all=ranges(document);for(const range of all)assert.deepEqual(range,all[0]);}
function screenClip(document){return document.timeline.tracks.find(t=>t.clips.some(c=>c.mediaId.endsWith(':screen'))).clips[0];}

test('unified clock uses virtual screen frames with signed delay and fractional media timestamps',()=>{
 const late=unifiedCameraClock(0,.067,30);assert.equal(late.sourceInFrames,0);assert.equal(late.cameraDelayFrames,2);assert.ok(Math.abs(late.mediaTimeOffsetSec-(.067-2/30))<1e-10);
 const early=unifiedCameraClock(.1,0,30);assert.equal(early.sourceInFrames,0);assert.equal(early.cameraDelayFrames,-3);assert.equal(early.mediaTimeOffsetSec,.1);
 assert.equal(late.boundaryHoldSeconds,.5);
});
test('unified short camera never truncates the screen; actual duration remains separate',()=>{
 const sync=computeSyncedRecordingTiming({screen:{durationFrames:90,durationSeconds:3},camera:{durationFrames:60,durationSeconds:2},cameraDelayFrames:2,fps:30});assert.equal(sync.syncedDurationFrames,90);assert.match(sync.syncWarning,/hidden/);
 const legacy=computeSyncedRecordingTiming({screen:{durationFrames:90,durationSeconds:3},camera:{durationFrames:90,durationSeconds:3},cameraSourceInFrames:2,fps:30});assert.equal(legacy.syncedDurationFrames,88);
});
test('legacy repair preserves linked cut/gap boundaries, actual availability and idempotence',()=>{
 const document={settings:{frameRate:30},assets:[{id:'screen',type:'recording',duration:90,cameraAssetId:'camera',metadata:{fps:30,rawPath:'/shared.mkv',streamTiming:{screen:{startTimeSeconds:0}}}},{id:'camera',type:'video',duration:92,metadata:{rawPath:'/shared.mkv',sourceInFrames:2,streamTiming:{startTimeSeconds:2/30,durationFrames:88,durationSeconds:88/30}}}],composition:{tracks:[{clips:[{assetId:'camera',sourceIn:2,sourceOut:12,timelineIn:0,timelineOut:10},{assetId:'camera',sourceIn:32,sourceOut:42,timelineIn:20,timelineOut:30}]}]},timeline:{tracks:[{clips:[{mediaId:'source:screen:camera',sourceIn:2,sourceOut:92,timelineIn:0,timelineOut:90}]}]}};
 repairUnifiedCameraClock(document);assert.deepEqual(ranges(document)[0],[{sourceIn:0,sourceOut:90,timelineIn:0,timelineOut:90}]);assert.equal(document.composition.tracks[0].clips[1].sourceIn,30);assert.equal(document.assets[1].metadata.decodedDurationFrames,88);assert.equal(document.assets[1].duration,90);
 const after=JSON.stringify(document);repairUnifiedCameraClock(document);assert.equal(JSON.stringify(document),after);
 const separate=JSON.parse(after);delete separate.assets[1].metadata.cameraClockVersion;separate.assets[1].metadata.rawPath='/separate.mkv';const before=JSON.stringify(separate);repairUnifiedCameraClock(separate);assert.equal(JSON.stringify(separate),before);
});
test('new virtual-camera project preserves linked split, trim, move, delete, undo snapshot and restore',()=>{
 const original=recordingProject();assertLinked(original);assert.equal(original.assets[1].metadata.decodedDurationFrames,88);assert.equal(original.assets[1].duration,90);
 for(const frame of [1,2,3,30,88,89]){const result=splitClip(original,{clipId:screenClip(original).id,frame});assertLinked(result.document);assert.deepEqual(ranges({...result.document,timeline:result.undoSnapshot.before}),ranges(original));assert.equal(getPrimaryRecording(result.document).camera.mediaTimeOffsetSec,0);}
 const trimmed=trimClipEdge(original,{clipId:screenClip(original).id,edge:'head',frame:30}).document;assertLinked(trimmed);assert.equal(getPrimaryRecording(trimmed).camera.sourceInFrames,0);
 const moved=moveClip(trimmed,{clipId:screenClip(trimmed).id,timelineIn:40}).document;assertLinked(moved);
 const restored=restoreRecordingOriginalState(moved,{assetId:original.assets[0].id});assertLinked(restored);assert.equal(screenClip(restored).sourceIn,0);assert.equal(screenClip(restored).sourceOut,90);
 const removed=deleteClip(original,{clipId:screenClip(original).id}).document;assert.equal(removed.timeline.tracks.flatMap(t=>t.clips).length,0);
});

test('legacy unified repair takes availability and media clock from finalized camera rather than raw shared duration',()=>{
 const d={settings:{frameRate:30},assets:[{id:'screen',type:'recording',duration:120,cameraAssetId:'camera',metadata:{rawPath:'/shared',fps:30,streamTiming:{screen:{startTimeSeconds:0}}}},{id:'camera',type:'video',duration:120,metadata:{rawPath:'/shared',sourceInFrames:2,streamTiming:{startTimeSeconds:2/30,durationSeconds:4,durationFrames:120},mediaTiming:{startTimeSeconds:0,durationSeconds:3,durationFrames:90}}}],timeline:{tracks:[{clips:[{mediaId:'source:screen:camera',timelineIn:0,timelineOut:120,sourceIn:2,sourceOut:122}]}]}};
 repairUnifiedCameraClock(d);assert.equal(d.assets[1].metadata.decodedDurationSeconds,3);assert.equal(d.assets[1].metadata.decodedDurationFrames,90);assert.equal(d.assets[1].metadata.mediaTimeOffsetSec,-2/30);assert.equal(d.assets[1].duration,120);
});
