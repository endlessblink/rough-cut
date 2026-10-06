import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadPlaywright} from './lib/load-playwright.mjs';
const {_electron}=loadPlaywright();const out=resolve('../evidence/track-resize-runtime');await mkdir(out,{recursive:true});
const project=resolve('../fixtures/resize/project.roughcut');const before=await readFile(project);const executable=process.env.ROUGH_CUT_RESIZE_EXECUTABLE??resolve('dist/rough-cut-mvp-linux-x64/dock-launch.sh');
const app=await _electron.launch({executablePath:executable,args:['--enable-sandbox',`--user-data-dir=${out}/profile-${Date.now()}`],chromiumSandbox:true,env:{...process.env,APPIMAGE_EXTRACT_AND_RUN:'1',ROUGH_CUT_DOCK_LAUNCH:'1',ROUGH_CUT_DOCK_PROVENANCE_PATH:join(out,'dock-provenance.json'),ROUGH_CUT_LOG_PATH:join(out,'runtime.log'),ROUGH_CUT_STARTUP_MODE:'editor',ROUGH_CUT_UI_SMOKE_PROJECT_PATH:project,ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH:'1920',ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT:'1500'}});
try{
 const page=await app.firstWindow();await page.waitForSelector('.audioWaveform');
 const handle=page.getByRole('separator',{name:'Resize Audio track height'});await handle.scrollIntoViewIfNeeded();
 const value=async()=>Number(await handle.getAttribute('aria-valuenow'));assert.equal(await value(),96);
 const playhead=await page.locator('input.timelineScrubber').inputValue();
 let box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+48,{steps:8});await page.mouse.up();assert.equal(await value(),144);
 assert.equal(await page.locator('input.timelineScrubber').inputValue(),playhead,'resize must not seek');
 await handle.focus();await page.keyboard.press('Home');assert.equal(await value(),40);await page.keyboard.press('End');assert.equal(await value(),240);await page.keyboard.press('Enter');assert.equal(await value(),96);
 await page.keyboard.press('ArrowDown');assert.equal(await value(),104);await page.keyboard.press('Shift+ArrowDown');assert.equal(await value(),128);
 box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+40,{steps:5});assert.equal(await value(),168);await page.keyboard.press('Escape');assert.equal(await value(),128);await page.mouse.up();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('roughCut.timelineTrackHeights.v1')).Audio),128,'cancel must not persist');
 await page.reload();await page.waitForSelector('.audioWaveform');assert.equal(await value(),128,'height must survive reopen');
 const screen=page.getByRole('separator',{name:'Resize Screen track height'});await screen.focus();await page.keyboard.press('End');assert.equal(Number(await screen.getAttribute('aria-valuenow')),240);assert.equal(await value(),128,'rows resize independently');
 const geometry=await page.locator('.timelineLane').evaluateAll(nodes=>nodes.map(n=>({lane:n.getAttribute('data-timeline-lane'),y:n.getBoundingClientRect().y,height:n.getBoundingClientRect().height,bottom:n.getBoundingClientRect().bottom})));for(let i=1;i<geometry.length;i++)assert.ok(geometry[i].y>=geometry[i-1].bottom-0.1,'rows must never overlap');
 const timeline=await page.locator('.visualTimeline').getAttribute('data-recording-linked-lane-boundaries');assert.equal(timeline,'pass');
 assert.deepEqual(await readFile(project),before,'track-height preferences must not alter the project');
 const runtime=await app.evaluate(({app,BrowserWindow})=>({version:app.getVersion(),electron:process.versions.electron,sandbox:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox,identity:JSON.parse(process.getBuiltinModule('node:fs').readFileSync(process.getBuiltinModule('node:path').join(app.getAppPath(),'package-identity.json')))}));
 await page.screenshot({path:join(out,'resized-real-editor.png')});await writeFile(join(out,'result.json'),JSON.stringify({ok:true,runtime,geometry,playheadUnchanged:true,projectUnchanged:true,persistence:true,cancellation:true,keyboard:true,min:40,max:240,screenshotSha256:createHash('sha256').update(await readFile(join(out,'resized-real-editor.png'))).digest('hex')},null,2));console.log('Track resize runtime PASS');
}finally{await app.close();}
