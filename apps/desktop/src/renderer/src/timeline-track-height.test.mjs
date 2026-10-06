import test from 'node:test';
import assert from 'node:assert/strict';
import {clampTrackHeight,readTrackHeight,persistTrackHeight,keyboardTrackHeight,TRACK_HEIGHT_STORAGE_KEY} from './timeline-track-height.mjs';
test('track resizing clamps unsafe values and preserves minimum space for stacked graphics',()=>{
 assert.equal(clampTrackHeight(-500),40);assert.equal(clampTrackHeight(900),240);assert.equal(clampTrackHeight(NaN,68),68);assert.equal(clampTrackHeight(44,300),300);
});
test('keyboard track sizing is bounded and offers a predictable reset',()=>{
 assert.equal(keyboardTrackHeight('ArrowDown',96,40,96),104);assert.equal(keyboardTrackHeight('ArrowUp',44,40,44,true),40);
 assert.equal(keyboardTrackHeight('End',44,40,44),240);assert.equal(keyboardTrackHeight('Home',96,40,96),40);assert.equal(keyboardTrackHeight('Enter',180,40,96),96);assert.equal(keyboardTrackHeight('s',96,40,96),null);
});
test('track preference persistence keeps other rows and safely recovers malformed storage',()=>{
 let data='{}';const storage={getItem:()=>data,setItem:(key,value)=>{assert.equal(key,TRACK_HEIGHT_STORAGE_KEY);data=value;}};
 persistTrackHeight('Audio',160,storage);persistTrackHeight('Screen',88,storage);assert.equal(readTrackHeight('Audio',storage),160);assert.equal(readTrackHeight('Screen',storage),88);
 for(const invalid of ['null','[]','{bad','{"Audio":"240"}']){data=invalid;assert.equal(readTrackHeight('Audio',storage),96);}
 data='{"Audio":999}';assert.equal(readTrackHeight('Audio',storage),240);
 const unavailable={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};assert.equal(readTrackHeight('Audio',unavailable),96);assert.doesNotThrow(()=>persistTrackHeight('Audio',160,unavailable));
});
