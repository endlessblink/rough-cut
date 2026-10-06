import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildStyledExportArgs} from '../apps/desktop/src/main/export-service.mjs';
const vfr=process.env.ROUGH_CUT_CAMERA_PARITY_VFR==='1';
const root=resolve('../evidence/sync-parity',vfr?'vfr':'.');mkdirSync(root,{recursive:true});
const ffmpeg=resolve('dist/rough-cut-mvp-linux-x64/resources/bin/ffmpeg');
const ffprobe=resolve('dist/rough-cut-mvp-linux-x64/resources/bin/ffprobe');
function run(args){const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error',...args],{maxBuffer:20*1024*1024,timeout:60000});if(result.status!==0)throw new Error(result.stderr.toString());return result.stdout;}
run(['-f','lavfi','-i', `nullsrc=s=96x64:r=30:d=3,geq=lum='16+219*mod(floor(N/pow(2,floor(X/12))),2)':cb=128:cr=128${vfr ? ",select='not(eq(mod(n,10),1))'" : ''}`,'-fps_mode','vfr','-c:v','libx264','-crf','0','-pix_fmt','yuv444p','-y',`${root}/camera-coded-pts.mp4`]);
run(['-i',`${root}/camera-coded-pts.mp4`,'-c','copy','-output_ts_offset','0.067','-y',`${root}/camera-coded-nonzero.mp4`]);
run(['-f','lavfi','-i','color=c=0x00cc00:s=96x64:r=30:d=5','-c:v','libx264','-crf','0','-pix_fmt','yuv444p','-y',`${root}/screen-green.mp4`]);
const probe=JSON.parse(spawnSync(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=start_time,duration','-of','json',`${root}/camera-coded-nonzero.mp4`],{encoding:'utf8'}).stdout).streams[0];
const cameraStart=Number(probe.start_time);const delay=Math.round(cameraStart*30);
const results=[];
const full=[{timelineIn:0,timelineOut:150,sourceIn:0,sourceOut:150}];
const cuts=[{timelineIn:0,timelineOut:1,sourceIn:0,sourceOut:1},{timelineIn:1,timelineOut:8,sourceIn:1,sourceOut:8},{timelineIn:8,timelineOut:38,sourceIn:30,sourceOut:60},{timelineIn:38,timelineOut:55,sourceIn:88,sourceOut:105},{timelineIn:55,timelineOut:65,sourceIn:110,sourceOut:120}];
const edges=[0,1,14,15,29,30,31,86,88,89,90,91,92,101,102,106,107,110,120,134,135].map((sourceIn,index)=>({timelineIn:index*2,timelineOut:index*2+2,sourceIn,sourceOut:sourceIn+2}));
const cases=[{name:'full',segments:full,delay},{name:'cuts',segments:cuts,delay},{name:'edges',segments:edges,delay},...[-3,30].flatMap(delay=>[{name:`delay-${delay}-full`,segments:full,delay},{name:`delay-${delay}-edges`,segments:edges,delay}]),{name:'single-clip',segments:full,delay,single:true}];
for(const {name,segments,delay,single=false} of cases){ const duration=segments.at(-1).timelineOut;const outputPath=`${root}/export-${name}.mp4`;
 const args=buildStyledExportArgs({inputPath:`${root}/screen-green.mp4`,cameraInputPath:`${root}/camera-coded-nonzero.mp4`,outputPath,width:192,height:128,sourceWidth:96,sourceHeight:64,cameraSourceWidth:96,cameraSourceHeight:64,sourceFps:30,cameraSourceStartSeconds:cameraStart,cameraDelayFrames:delay,cameraDecodedDurationSeconds:3,timelineSegments:single?[]:segments,cameraTimelineSegments:single?[]:segments,timelineDurationFrames:duration,outputDurationSeconds:duration/30,screenPadding:0,screenCornerRadius:0,screenShadowEnabled:false,screenFrame:{x:0,y:0,w:1,h:1},cameraFrame:{x:0,y:0,w:1,h:1},cameraPresentation:{visible:true,shape:'rounded',roundness:0,size:100,shadowEnabled:false}});
 args.splice(args.length - 1, 0, '-t', String(duration / 30));
 writeFileSync(`${root}/args-${name}.json`,JSON.stringify(args,null,2));run(args);const raw=run(['-i',outputPath,'-f','rawvideo','-pix_fmt','rgb24','pipe:1']);assert.equal(raw.length,192*128*3*duration,`${name}: complete frame count`);
 const samples=[];
 for(let frame=0;frame<duration;frame++){
  const segment=segments.find(s=>frame>=s.timelineIn&&frame<s.timelineOut);const source=segment.sourceIn+frame-segment.timelineIn;const offset=(frame*192*128+64*192+96)*3;const rgb=[...raw.subarray(offset,offset+3)];
  let expected=source>=Math.max(0,delay-15)&&source<delay+90+15?Math.max(0,Math.min(89,source-delay)):null;
  if(vfr && expected!==null && expected%10===1)expected-=1;
  if(expected===null)assert.ok(rgb[1]>100&&rgb[0]<20,`${name}: absent camera at ${frame}, source ${source}, rgb ${rgb}`);
  else {
   let decodedFrame=0;const bits=[];
   for(let bit=0;bit<8;bit++){
    const at=(frame*192*128+64*192+12+bit*24)*3;const luminance=raw[at];
    assert.ok(Math.abs(raw[at+1]-luminance)<10&&Math.abs(raw[at+2]-luminance)<10,`${name}: expected neutral camera code, got background at frame ${frame}, source ${source}`);
    assert.ok(luminance<30||luminance>220,`${name}: ambiguous frame code at frame ${frame}, bit ${bit}: ${luminance}`);
    if(luminance>128)decodedFrame+=2**bit;bits.push(luminance);
   }
   assert.equal(decodedFrame,expected,`${name}: frame ${frame}, source ${source}, exact decoded camera frame ${decodedFrame}, expected ${expected}, code ${bits}`);
  }
  samples.push({timelineFrame:frame,sourceFrame:source,expectedCameraFrame:expected,rgb});
 }
 results.push({name,delay,frames:duration,outputPath,samples});
}
writeFileSync(`${root}/styled-export-frame-parity.json`,JSON.stringify({cameraStart,delay,results},null,2));console.log(JSON.stringify({passed:true,cameraStart,delay,cases:results.map(({name,frames})=>({name,frames}))}));
