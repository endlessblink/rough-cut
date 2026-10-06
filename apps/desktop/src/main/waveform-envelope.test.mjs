import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnvelopeAccumulator,renderEnvelopeSvg} from './waveform-envelope.mjs';
const pcm=values=>{const buffer=Buffer.alloc(values.length*4);values.forEach((value,index)=>buffer.writeFloatLE(value,index*4));return buffer;};
test('signed stereo envelope preserves opposite phases, quiet amplitude, transients and silence across partial chunks',()=>{
 const accumulator=createEnvelopeAccumulator({channels:2,sampleRate:4,durationSec:2,bins:8});
 const data=pcm([0,0, .01,-.01, -.01,.01, 0,0, .8,-.8, -.8,.8, 0,0, 0,0]);
 for(let start=0;start<data.length;start+=7)accumulator.push(data.subarray(start,start+7));
 const result=accumulator.finish();
 assert.equal(result.framesDecoded,8);
 assert.equal(result.maximum[0][0],0);assert.equal(result.minimum[1][7],0);
 assert.ok(Math.abs(result.maximum[0][1]-.01)<1e-8);assert.ok(Math.abs(result.minimum[1][1]+.01)<1e-8);
 assert.ok(result.maximum[0][4]>.79);assert.ok(result.minimum[1][4]<-.79);
 const svg=renderEnvelopeSvg(result,8);assert.match(svg,/height="200"/);assert.match(svg,/data-channel="0"/);assert.match(svg,/data-channel="1"/);assert.doesNotMatch(svg,/stroke=|filter=|rect/);
 assert.match(svg,/M1,49\.5/,'quiet signal is 0.5 units above its zero line, without gain');
 assert.match(svg,/M4,10/,'loud signal is 40 units above its zero line');
});
test('rebin retains one-sample peaks and never fills exact silent runs',()=>{
 const accumulator=createEnvelopeAccumulator({channels:1,sampleRate:8,durationSec:1,bins:8});accumulator.push(pcm([0,0,0,1,0,0,0,0]));
 const svg=renderEnvelopeSvg(accumulator.finish(),4);assert.match(svg,/M1,0/);assert.equal((svg.match(/<path/g)||[]).length,1);assert.doesNotMatch(svg,/M0,/);
});
test('missing source tail remains silent, and malformed PCM cannot become a fake waveform',()=>{
 const a=createEnvelopeAccumulator({channels:1,sampleRate:4,durationSec:2,bins:8});a.push(pcm([.5]));assert.equal(a.finish().maximum[0][7],0);
 const b=createEnvelopeAccumulator({channels:2,sampleRate:4,durationSec:1,bins:4});b.push(Buffer.alloc(3));assert.throws(()=>b.finish(),/Incomplete/);
 const c=createEnvelopeAccumulator({channels:1,sampleRate:4,durationSec:1,bins:4});assert.throws(()=>c.push(pcm([NaN])),/Non-finite/);
});

test('display columns use native extrema without diagonal interpolation or filling silent pixels',()=>{
 const a=createEnvelopeAccumulator({channels:1,sampleRate:12,durationSec:1,bins:6});
 a.push(pcm([0,0,.02,-.03,0,0,.8,-.9,0,0,0,0]));
 const svg=renderEnvelopeSvg(a.finish(),6);
 const paths=[...svg.matchAll(/d="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(paths.length,2);
 for(const path of paths){
  const points=[...path.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
  for(let i=1;i<points.length;i++)assert.ok(points[i][0]===points[i-1][0]||points[i][1]===points[i-1][1],'each edge is horizontal or vertical');
 }
 assert.match(svg,/M1,49/);assert.match(svg,/L2,51\.5/);
 assert.doesNotMatch(svg,/M0,|M2,|M4,/);
});

test('real PCM window decoding keeps stereo polarity, low amplitude, silence and a single-sample transient',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {ensureWaveformEnvelope}=await import('./waveform-envelope.mjs');
 const dir=await mkdtemp(join(tmpdir(),'rc-native-waveform-'));
 try{
  const rate=8000,frames=rate*2,body=Buffer.alloc(frames*4);
  // A known native signal in second 1: quiet opposite phases, exact silence,
  // then one sample, then silence. No ffmpeg-generated envelope as oracle.
  for(let frame=rate;frame<rate+rate/4;frame++){
   const value=frame%2===0?655:-655;body.writeInt16LE(value,frame*4);body.writeInt16LE(-value,frame*4+2);
  }
  body.writeInt16LE(30000,(rate+4000)*4);body.writeInt16LE(-15000,(rate+4000)*4+2);
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(body.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(body.length,40);
  const sourcePath=join(dir,'known.wav');await writeFile(sourcePath,Buffer.concat([header,body]));
  const request={sourcePath,mtimeMs:1,durationSec:2,width:8,directory:dir,startSec:1,spanSec:1};
  const visual=await ensureWaveformEnvelope(request);const svg=await readFile(visual.path,'utf8');
  assert.equal(visual.channels,2);assert.equal(visual.widthPx,8);
  assert.match(svg,/M0,49\.0005/);assert.match(svg,/M4,4\.2236/);
  assert.match(svg,/M4,150/);assert.match(svg,/L5,172\.8882/);
  assert.equal((svg.match(/<path/g)||[]).length,4);
  const silence=await ensureWaveformEnvelope({...request,startSec:0});assert.doesNotMatch(await readFile(silence.path,'utf8'),/<path/);
  assert.equal((await ensureWaveformEnvelope(request)).path,visual.path);
 }finally{await rm(dir,{recursive:true,force:true});}
});
