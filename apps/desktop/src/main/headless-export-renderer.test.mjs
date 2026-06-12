import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  attemptExperimentalHeadlessRender,
  HEADLESS_EXPORT_BACKEND,
  resolveExperimentalHeadlessAvailability,
} from './headless-export-renderer.mjs';

test('experimental headless renderer stays disabled unless explicitly opted in', async () => {
  const availability = await resolveExperimentalHeadlessAvailability({
    env: {},
    electronRuntime: { available: true },
  });

  assert.deepEqual(availability, {
    enabled: false,
    available: false,
    reason: 'experimental-headless-export-disabled',
  });
});

test('experimental headless UI flag does not enable the export renderer', async () => {
  const availability = await resolveExperimentalHeadlessAvailability({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT_UI: '1' },
    electronRuntime: { available: true },
  });

  assert.deepEqual(availability, {
    enabled: false,
    available: false,
    reason: 'experimental-headless-export-disabled',
  });
});

test('experimental headless renderer reports missing Electron runtime as fallback reason', async () => {
  const availability = await resolveExperimentalHeadlessAvailability({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: false, reason: 'electron-runtime-unavailable' },
  });

  assert.deepEqual(availability, {
    enabled: true,
    available: false,
    reason: 'electron-runtime-unavailable',
  });
});

test('experimental headless renderer attempt reports unavailable render surface metadata', async () => {
  const attempt = await attemptExperimentalHeadlessRender({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: true },
    outputPath: '/tmp/headless.mp4',
    compositionPlan: {
      output: { width: 1920, height: 1080 },
      frames: [{ frameIndex: 0 }, { frameIndex: 15 }],
    },
  });

  assert.equal(attempt.backend, HEADLESS_EXPORT_BACKEND);
  assert.equal(attempt.attempted, true);
  assert.equal(attempt.available, true);
  assert.equal(attempt.ok, false);
  assert.equal(attempt.reason, 'electron-browser-window-unavailable');
  assert.equal(attempt.outputPath, '/tmp/headless.mp4');
  assert.equal(attempt.frameCount, 2);
  assert.deepEqual(attempt.output, { width: 1920, height: 1080 });
  assert.deepEqual(attempt.renderSurface, {
    attempted: false,
    reason: 'electron-browser-window-unavailable',
    output: { width: 1920, height: 1080 },
  });
});

test('experimental headless renderer captures frame artifacts from a hidden render window', async () => {
  const windows = [];
  const png = Buffer.from('fake-png-frame');
  const attempt = await attemptExperimentalHeadlessRender({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: true },
    outputPath: '/tmp/rough-cut-headless-render-test/headless.mp4',
    compositionPlan: {
      output: { width: 1280, height: 720 },
      frames: [{ frameIndex: 0 }, { frameIndex: 15 }],
    },
    createRenderWindow(options) {
      const created = {
        options,
        loadedUrl: null,
        renderedScripts: [],
        closed: false,
        webContents: {
          async executeJavaScript(script) {
            created.renderedScripts.push(script);
            if (script === 'window.__roughCutHeadlessExportProbe') return { ok: true };
            return { ok: true, drewScreen: true, drewCamera: null };
          },
          async capturePage() {
            return { toPNG: () => png };
          },
        },
        async loadURL(url) {
          created.loadedUrl = url;
        },
        close() {
          created.closed = true;
        },
      };
      windows.push(created);
      return created;
    },
  });

  assert.equal(attempt.ok, true);
  assert.equal(attempt.reason, null);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].closed, true);
  assert.equal(windows[0].options.show, false);
  assert.equal(windows[0].options.width, 1280);
  assert.equal(windows[0].options.height, 720);
  assert.equal(windows[0].options.webPreferences.offscreen, true);
  assert.match(windows[0].loadedUrl, /^data:text\/html/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /<canvas id="gpu-frame"/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /gpuCanvas\.getContext\('webgl'/);
  assert.equal(attempt.renderSurface.attempted, true);
  assert.equal(attempt.renderSurface.ok, true);
  assert.equal(attempt.renderSurface.reason, null);
  assert.equal(attempt.renderSurface.loaded, true);
  assert.equal(attempt.renderSurface.scriptExecuted, true);
  assert.equal(attempt.renderSurface.canCapturePage, true);
  assert.equal(attempt.renderSurface.frameCount, 2);
  assert.deepEqual(attempt.renderSurface.renderResults, [
    { ok: true, drewScreen: true, drewCamera: null },
    { ok: true, drewScreen: true, drewCamera: null },
  ]);
  assert.match(attempt.renderSurface.framePattern, /frame-%06d\.png$/);
  assert.equal(attempt.frameArtifacts.length, 2);
  assert.match(windows[0].renderedScripts.join('\n'), /__roughCutRenderHeadlessFrame/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawBackground\(frame\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function createGpuRenderer\(gl\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function useGpuFrame\(frame\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /return !!gpu&&frame&&frame\.screen/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawGpuVideo\(video,rect,source\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawGpuScreenLayer\(layer,screen\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawGpuCameraLayer\(layer,camera\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /uniform vec4 u_gradientEnd/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /uniform vec4 u_rect/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /uniform float u_radius/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /uniform float u_useGradient/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /uniform float u_useRoundedMask/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /gl\.enable\(gl\.BLEND\);gl\.blendFunc\(gl\.SRC_ALPHA,gl\.ONE_MINUS_SRC_ALPHA\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(distance\(pixel,closest\)>radius\)\{discard;\}/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawGpuBackground\(bg\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /async function drawGpuBackgroundImage\(bg\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const image=await waitForImageReady\(imageFor\(bg&&bg\.imageUrl\)\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /textureWidth:image\.naturalWidth\|\|gpuCanvas\.width/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /gradient:start!==end\|\|!!\(bg&&bg\.gradient\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const roundedRadius=Number\.isFinite\(options\.roundedRadius\)\?options\.roundedRadius:Number\.isFinite\(rect\.radius\)\?rect\.radius:0/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /gl\.uniform1f\(gpu\.useRoundedMask,roundedRadius>0\?1:0\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawGpuSolidPolygon\(points,colorValue\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /gl\.drawArrays\(gl\.TRIANGLE_FAN,0,points\.length\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /let usedGpu=false/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(drewScreen\)usedGpu=true;else\{clearGpu\('#000000'\);drewBackgroundImage=await drawBackground\(frame\);fallbackScreen\(screen\)\}/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /rendererKind:usedGpu\?'webgl':'canvas2d'/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const images=new Map\(\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function imageFor\(url\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function waitForImageReady\(image\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /ctx\.createLinearGradient\(0,0,canvas\.width,canvas\.height\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /gradient\.addColorStop\(0,start\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /let drewBackgroundImage=false/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(useGpu\)\{clearGpu\(\(frame\.background&&frame\.background\.startColor\)\|\|'#111827'\);drawGpuBackground\(frame\.background\);drewBackgroundImage=await drawGpuBackgroundImage\(frame\.background\)\}/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /else drewBackgroundImage=await drawBackground\(frame\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /ctx\.drawImage\(image,0,0,canvas\.width,canvas\.height\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const rawWidth=Number\.isFinite\(frame\.width\)\?frame\.width:frame\.w/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function screenStyle\(layer,screen\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /style\.shadowEnabled!==false/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /ctx\.shadowOffsetX=style\.shadowOffsetX/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function cameraStyle\(layer,camera\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function cameraShapePath\(camera,style\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /style&&style\.shape==='circle'/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /ctx\.arc\(camera\.x\+camera\.width\/2,camera\.y\+camera\.height\/2,Math\.min\(camera\.width,camera\.height\)\/2,0,Math\.PI\*2\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /shape==='circle'\?Math\.min\(camera\.width,camera\.height\)\/2/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /Number\.isFinite\(layer&&layer\.radius\)\?layer\.radius:fallbackRadius/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /cameraShapePath\(camera,style\);ctx\.clip\(\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function screenSourceRect\(video,layer,screen\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /ctx\.drawImage\(video,source\.x,source\.y,source\.width,source\.height,screen\.x,screen\.y,screen\.width,screen\.height\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function coverSourceRect\(video,layer,dest\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const source=coverSourceRect\(video,layer,\{x,y,width:w,height:h\}\);ctx\.drawImage\(video,source\.x,source\.y,source\.width,source\.height,x,y,w,h\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const style=screenStyle\(layer,screen\);return drawGpuVideo\(video,\{\.\.\.screen,radius:style\.radius\},screenSourceRect\(video,layer,screen\)\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const style=cameraStyle\(layer,camera\);return drawGpuVideo\(video,\{\.\.\.camera,radius:style\.radius\},coverSourceRect\(video,layer,camera\)\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const useGpu=useGpuFrame\(frame\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(screen&&useGpu\)\{drewScreen=await drawGpuScreenLayer\(frame\.screen,screen\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(camera&&useGpu&&usedGpu\)\{drewCamera=await drawGpuCameraLayer\(frame\.camera,camera\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(!drewCamera\)\{usedGpu=false;clearGpu\('#000000'\);drewBackgroundImage=await drawBackground\(frame\);fallbackScreen\(screen\);fallbackCamera\(camera\)\}/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function flushCanvasFrame\(\)\{return new Promise/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /await flushCanvasFrame\(\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function sourceViewportRect\(layer,vw,vh\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /layer&&\(layer\.sourceViewport\|\|layer\.crop\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const base=sourceViewportRect\(layer,vw,vh\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function sourcePoint\(frame,screen,source\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function clickPoint\(frame, screen\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /\(frame\.click&&frame\.click\.sourcePosition\)\|\|\(frame\.cursor&&frame\.cursor\.sourcePosition\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function cursorStyle\(frame\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /cursor\.style==='subtle'\|\|cursor\.style==='spotlight'/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /Math\.max\(0\.5,Math\.min\(1\.5,rawSize\/100\)\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawCursor\(point,styleInfo\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /style==='spotlight'/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawClick\(point,frame\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawGpuCursor\(point,styleInfo\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /drawGpuSolidPolygon\(outer,style==='spotlight'\?\[122\/255,167\/255,255\/255,1\]:\[17\/255,24\/255,39\/255,1\]\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /function drawGpuClick\(point,frame\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /drawGpuQuad\(\{x:point\.x-radius,y:point\.y-radius,width:radius\*2,height:radius\*2,radius\},\{color:\[122\/255,167\/255,255\/255,alpha\]\}\)/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /effect==='ripple'/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(point\)\{if\(usedGpu\)drawGpuCursor\(point,cursorStyle\(frame\)\);else drawCursor\(point,cursorStyle\(frame\)\)\}/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /const clicked=screen&&frame&&frame\.click&&frame\.click\.visible\?clickPoint\(frame,screen\):null/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /if\(clicked\)\{if\(usedGpu\)drawGpuClick\(clicked,frame\);else drawClick\(clicked,frame\)\}/);
  assert.deepEqual(await readFile(attempt.frameArtifacts[0].path), png);
});

test('experimental headless renderer uses the resolved Electron BrowserWindow runtime', async () => {
  const windows = [];
  const png = Buffer.from('runtime-png-frame');
  function BrowserWindow(options) {
    const created = {
      options,
      loadedUrl: null,
      closed: false,
      webContents: {
        async executeJavaScript(script) {
          if (script === 'window.__roughCutHeadlessExportProbe') return { ok: true };
          return { ok: true, drewScreen: true, drewCamera: null };
        },
        async capturePage() {
          return { toPNG: () => png };
        },
      },
      async loadURL(url) {
        created.loadedUrl = url;
      },
      close() {
        created.closed = true;
      },
    };
    windows.push(created);
    return created;
  }

  const attempt = await attemptExperimentalHeadlessRender({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: true, app: {}, BrowserWindow },
    outputPath: '/tmp/rough-cut-headless-render-test/runtime-headless.mp4',
    compositionPlan: {
      output: { width: 640, height: 360 },
      frames: [{ frameIndex: 0 }],
    },
  });

  assert.equal(attempt.ok, true);
  assert.equal(attempt.reason, null);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].options.webPreferences.offscreen, true);
  assert.equal(windows[0].closed, true);
  assert.equal(attempt.renderSurface.frameCount, 1);
  assert.deepEqual(attempt.renderSurface.renderResults, [{ ok: true, drewScreen: true, drewCamera: null }]);
  assert.deepEqual(await readFile(attempt.frameArtifacts[0].path), png);
});

test('experimental headless renderer script maps normalized cursor positions directly', async () => {
  const windows = [];
  const png = Buffer.from('cursor-png-frame');
  const attempt = await attemptExperimentalHeadlessRender({
    env: { ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT: '1' },
    electronRuntime: { available: true },
    outputPath: '/tmp/rough-cut-headless-render-test/cursor-headless.mp4',
    compositionPlan: {
      output: { width: 1920, height: 1080 },
      frames: [{
        frameIndex: 25,
        screen: {
          sourceUrl: 'file:///tmp/source.mp4',
          sourceFrame: 25,
          sourceSize: { width: 640, height: 360 },
          fps: 30,
          frame: null,
        },
        cursor: {
          visible: true,
          sourcePosition: { x: 0.5625, y: 0.5277777778 },
        },
      }],
    },
    createRenderWindow(options) {
      const created = {
        options,
        loadedUrl: null,
        webContents: {
          async executeJavaScript(script) {
            if (script === 'window.__roughCutHeadlessExportProbe') return { ok: true };
            return { ok: true, drewScreen: true, drewCamera: null, cursorPoint: { x: 1051.2, y: 526.33 } };
          },
          async capturePage() {
            return { toPNG: () => png };
          },
        },
        async loadURL(url) {
          created.loadedUrl = url;
        },
        close() {},
      };
      windows.push(created);
      return created;
    },
  });

  assert.equal(attempt.ok, true);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /Math\.abs\(source\.x\)>1\?source\.x\/size\.width:source\.x/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /cursorPoint:point\?\{x:Math\.round\(point\.x\*100\)\/100,y:Math\.round\(point\.y\*100\)\/100\}:null/);
  assert.match(decodeURIComponent(windows[0].loadedUrl), /clickPoint:clicked\?\{x:Math\.round\(clicked\.x\*100\)\/100,y:Math\.round\(clicked\.y\*100\)\/100\}:null/);
  assert.deepEqual(attempt.renderSurface.renderResults[0].cursorPoint, { x: 1051.2, y: 526.33 });
});
