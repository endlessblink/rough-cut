import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWaveformArgs,visualCacheKey} from './clip-visuals.mjs';
test('waveform preserves fullscale channel amplitudes and invalidates earlier processed images',()=>{
 const args=buildWaveformArgs('/fixture/stereo.wav','/fixture/wave.png',1024);const filter=args[args.indexOf('-filter_complex')+1];
 assert.match(filter,/scale=lin:filter=peak:split_channels=1/);assert.doesNotMatch(filter,/compand|normalize|aformat|scale=sqrt/);
 assert.notEqual(visualCacheKey('/fixture.wav',100,'waveform',1024),visualCacheKey('/fixture.wav',101,'waveform',1024));
});
