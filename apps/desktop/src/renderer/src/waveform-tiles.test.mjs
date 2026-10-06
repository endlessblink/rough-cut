import test from 'node:test';
import assert from 'node:assert/strict';
import {planWaveformTiles} from './waveform-tiles.mjs';
const base={pixelsPerFrame:4,fps:30,sourceFrames:40000,scrollLeft:0,viewWidth:1000,labelWidth:88};
test('visible source tiles remain bounded at the far end of a long recording',()=>{
 const tiles=planWaveformTiles({...base,scrollLeft:150000,clips:[{id:'long',timelineIn:0,timelineOut:40000,sourceIn:0}]});
 assert.ok(tiles.length>=3&&tiles.length<=6);
 assert.ok(tiles.every(t=>t.width===512&&t.startSec>1200&&t.spanSec===512/120));
});
test('moving and duplicating a trimmed clip preserve source content and change only placement',()=>{
 const clips=[{id:'a',timelineIn:0,timelineOut:200,sourceIn:300},{id:'b',timelineIn:200,timelineOut:400,sourceIn:300}];
 const tiles=planWaveformTiles({...base,viewWidth:1800,clips});
 const a=tiles.filter(t=>t.clipId==='a'),b=tiles.filter(t=>t.clipId==='b');
 assert.deepEqual(a.map(({clipId,...rest})=>rest),b.map(({clipId,...rest})=>rest));
 assert.equal(a[0].left,-176);
 assert.equal(a[0].startSec,1024/120);
});
test('half-open cut boundaries map each side to the same source columns',()=>{
 const tiles=planWaveformTiles({...base,clips:[{id:'left',timelineIn:0,timelineOut:150,sourceIn:0},{id:'right',timelineIn:150,timelineOut:400,sourceIn:150}]});
 const left=tiles.find(t=>t.clipId==='left'&&t.key==='4:1');
 const right=tiles.find(t=>t.clipId==='right'&&t.key==='4:1');
 assert.equal(left.startSec,right.startSec);
 assert.equal(left.left,right.left+600);
});
test('source end, empty viewport and offscreen clips cannot request beyond real source bounds',()=>{
 const tiles=planWaveformTiles({...base,sourceFrames:200,clips:[{id:'end',timelineIn:0,timelineOut:200,sourceIn:0}]});
 assert.equal(tiles.at(-1).width,288);
 assert.ok(Math.abs(tiles.at(-1).startSec+tiles.at(-1).spanSec-200/30)<1e-12);
 assert.deepEqual(planWaveformTiles({...base,viewWidth:0,clips:[]}),[]);
 assert.deepEqual(planWaveformTiles({...base,clips:[{id:'off',timelineIn:10000,timelineOut:11000,sourceIn:0}]}),[]);
});
