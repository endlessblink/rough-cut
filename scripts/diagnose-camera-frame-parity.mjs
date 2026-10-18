import { loadPlaywright } from './lib/load-playwright.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve('../evidence/sync-parity');
await mkdir(root,{recursive:true});
const video=await readFile(`${root}/camera-nonzero.mp4`);
const {_electron}=loadPlaywright();
const app=await _electron.launch({executablePath:resolve('dist/rough-cut-mvp-linux-x64/electron'),args:['--enable-sandbox',`--user-data-dir=${root}/profile`,resolve('dist/rough-cut-mvp-linux-x64/resources/app')],chromiumSandbox:true,env:{...process.env,ROUGH_CUT_STARTUP_MODE:'editor',ROUGH_CUT_UI_SMOKE_PROJECT_PATH:'/media/endlessblink/data/.dev-tmp/endlessblink/rough-cut-audio-timeline-fix-20261004/handoff/owner-22min/project.roughcut'},timeout:60000});
try {
 const page=await app.firstWindow();
 await page.waitForLoadState('domcontentloaded');
 const samples=await page.evaluate(async data=>{
  const v=document.createElement('video');v.muted=true;v.src=data;document.body.append(v);
  await new Promise((ok,bad)=>{v.onloadeddata=ok;v.onerror=()=>bad(new Error('decode fixture'));});
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const ctx=canvas.getContext('2d');const samples=[];
  for(const time of [0,2/30,4/30,0.5,0.5+2/30,1,1+2/30,2.5,2.5+2/30]){
   if(Math.abs(v.currentTime-time)>1e-6)await new Promise(ok=>{v.onseeked=ok;v.currentTime=time;});
   await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
   ctx.drawImage(v,0,0);const rgb=[...ctx.getImageData(48,32,1,1).data].slice(0,3);
   samples.push({requested:time,currentTime:v.currentTime,rgb,decodedFrame:Math.round(rgb[0]/3),duration:v.duration});
  }
  v.remove();return samples;
 },`data:video/mp4;base64,${video.toString('base64')}`);
 await writeFile(`${root}/chromium-frame-samples.json`,JSON.stringify(samples,null,2));console.log(JSON.stringify(samples,null,2));
}finally{await app.close();}
