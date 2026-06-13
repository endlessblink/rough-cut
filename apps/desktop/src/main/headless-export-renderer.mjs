import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const HEADLESS_EXPORT_BACKEND = 'electron-headless-compositor';

export async function attemptExperimentalHeadlessRender({
  compositionPlan,
  outputPath,
  env = process.env,
  electronRuntime = null,
  createRenderWindow = null,
} = {}) {
  const availability = await resolveExperimentalHeadlessAvailability({ env, electronRuntime });
  const result = {
    backend: HEADLESS_EXPORT_BACKEND,
    attempted: availability.enabled,
    available: availability.available,
    ok: false,
    reason: availability.reason,
    outputPath: null,
    frameCount: Array.isArray(compositionPlan?.frames) ? compositionPlan.frames.length : 0,
    output: compositionPlan?.output ?? null,
  };
  if (!availability.available) return result;

  const renderSurface = await renderHeadlessFrames({
    compositionPlan,
    outputPath,
    electronRuntime: electronRuntime ?? availability,
    createRenderWindow,
  });

  if (renderSurface?.ok) {
    return {
      ...result,
      attempted: true,
      ok: true,
      reason: null,
      outputPath,
      renderSurface,
      frameArtifacts: renderSurface.frameArtifacts,
    };
  }

  return {
    ...result,
    attempted: true,
    reason: renderSurface?.reason ?? 'electron-headless-renderer-unavailable',
    outputPath,
    renderSurface,
  };
}

export async function resolveExperimentalHeadlessAvailability({ env = process.env, electronRuntime = null } = {}) {
  if (env.ROUGH_CUT_EXPERIMENTAL_HEADLESS_EXPORT !== '1') {
    return {
      enabled: false,
      available: false,
      reason: 'experimental-headless-export-disabled',
    };
  }

  const runtime = electronRuntime ?? await resolveElectronRuntime();
  if (!runtime.available) {
    return {
      enabled: true,
      available: false,
      reason: runtime.reason,
    };
  }

  return {
    enabled: true,
    available: true,
    reason: null,
    app: runtime.app,
    BrowserWindow: runtime.BrowserWindow,
  };
}

async function resolveElectronRuntime() {
  try {
    const electron = await import('electron');
    if (!electron?.app || !electron?.BrowserWindow) {
      return {
        available: false,
        reason: 'electron-runtime-unavailable',
      };
    }
    return {
      available: true,
      app: electron.app,
      BrowserWindow: electron.BrowserWindow,
    };
  } catch {
    return {
      available: false,
      reason: 'electron-runtime-unavailable',
    };
  }
}

async function renderHeadlessFrames({ compositionPlan, outputPath, electronRuntime = null, createRenderWindow = null } = {}) {
  const output = normalizeOutputSize(compositionPlan?.output);
  const frames = Array.isArray(compositionPlan?.frames) ? compositionPlan.frames : [];
  const BrowserWindow = electronRuntime?.BrowserWindow;
  const canCreateWindow = typeof createRenderWindow === 'function' || typeof BrowserWindow === 'function';
  if (!canCreateWindow) {
    return {
      attempted: false,
      reason: 'electron-browser-window-unavailable',
      output,
    };
  }
  if (frames.length === 0) {
    return {
      attempted: false,
      reason: 'headless-frame-plan-empty',
      output,
    };
  }

  let window = null;
  const options = {
    show: false,
    width: output.width,
    height: output.height,
    useContentSize: true,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      sandbox: true,
      webSecurity: false,
    },
  };

  try {
    window = typeof createRenderWindow === 'function'
      ? createRenderWindow(options)
      : new BrowserWindow(options);
    if (!window) {
      return {
        attempted: true,
        reason: 'electron-window-create-failed',
        output,
      };
    }

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(renderFrameRendererHtml(output))}`;
    if (typeof window.loadURL === 'function') {
      await window.loadURL(dataUrl);
    }

    let probe = null;
    if (typeof window.webContents?.executeJavaScript === 'function') {
      probe = await window.webContents.executeJavaScript('window.__roughCutHeadlessExportProbe', true);
    }
    if (probe?.ok !== true) {
      return {
        attempted: true,
        reason: 'electron-hidden-window-script-unavailable',
        output,
        loaded: typeof window.loadURL === 'function',
        scriptExecuted: false,
        canCapturePage: typeof window.capturePage === 'function' || typeof window.webContents?.capturePage === 'function',
      };
    }

    const capturePage = typeof window.capturePage === 'function'
      ? () => window.capturePage()
      : typeof window.webContents?.capturePage === 'function'
        ? () => window.webContents.capturePage()
        : null;
    if (!capturePage) {
      return {
        attempted: true,
        reason: 'electron-hidden-window-capture-unavailable',
        output,
        loaded: typeof window.loadURL === 'function',
        scriptExecuted: true,
        canCapturePage: false,
      };
    }

    const frameDir = resolveFrameArtifactDir(outputPath);
    await mkdir(frameDir, { recursive: true });
    const frameArtifacts = [];
    const renderResults = [];
    for (const [index, frame] of frames.entries()) {
      const renderResult = await window.webContents.executeJavaScript(
        `window.__roughCutRenderHeadlessFrame(${JSON.stringify(frame)}, ${index})`,
        true,
      );
      renderResults.push(renderResult);
      const png = await captureExactCanvasPng(window, capturePage);
      const framePath = join(frameDir, `frame-${String(frame.frameIndex ?? index).padStart(6, '0')}.png`);
      await writeFile(framePath, png);
      frameArtifacts.push({
        frameIndex: frame.frameIndex ?? index,
        path: framePath,
        bytes: png.length,
      });
    }

    return {
      attempted: true,
      ok: true,
      reason: null,
      output,
      loaded: typeof window.loadURL === 'function',
      scriptExecuted: probe?.ok === true,
      canCapturePage: true,
      frameCount: frameArtifacts.length,
      frameDir,
      framePattern: join(frameDir, 'frame-%06d.png'),
      frameArtifacts,
      renderResults,
    };
  } catch (err) {
    return {
      attempted: true,
      reason: 'electron-hidden-window-render-failed',
      output,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (window && typeof window.close === 'function') {
      window.close();
    } else if (window && typeof window.destroy === 'function') {
      window.destroy();
    }
  }
}

function normalizeOutputSize(output = {}) {
  const width = Number.isFinite(output?.width) && output.width > 0 ? Math.round(output.width) : 1920;
  const height = Number.isFinite(output?.height) && output.height > 0 ? Math.round(output.height) : 1080;
  return { width, height };
}

function resolveFrameArtifactDir(outputPath) {
  const parent = outputPath ? dirname(outputPath) : process.cwd();
  const stem = outputPath ? basename(outputPath).replace(/\.[^.]+$/, '') : 'headless-export';
  return join(parent, `${stem}-frames`);
}

function nativeImageToPng(image) {
  if (image && typeof image.toPNG === 'function') {
    const png = image.toPNG();
    if (Buffer.isBuffer(png) && png.length > 0) return png;
  }
  if (Buffer.isBuffer(image) && image.length > 0) return image;
  throw new Error('electron-hidden-window-capture-empty');
}

async function captureExactCanvasPng(window, capturePage) {
  if (typeof window?.webContents?.executeJavaScript === 'function') {
    const dataUrl = await window.webContents.executeJavaScript('window.__roughCutCaptureHeadlessPng && window.__roughCutCaptureHeadlessPng()', true);
    const png = pngDataUrlToBuffer(dataUrl);
    if (png) return png;
  }
  const image = await capturePage();
  return nativeImageToPng(image);
}

function pngDataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) return null;
  const png = Buffer.from(dataUrl.slice(prefix.length), 'base64');
  return png.length > 0 ? png : null;
}

function renderFrameRendererHtml(output) {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}canvas{position:absolute;inset:0;display:block}</style><canvas id="gpu-frame" width="${output.width}" height="${output.height}"></canvas><canvas id="frame" width="${output.width}" height="${output.height}"></canvas><script>
const gpuCanvas=document.getElementById('gpu-frame');
const canvas=document.getElementById('frame');
const ctx=canvas.getContext('2d');
const gl=gpuCanvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});
const captureCanvas=document.createElement('canvas');
captureCanvas.width=${output.width};
captureCanvas.height=${output.height};
const captureCtx=captureCanvas.getContext('2d');
const videos=new Map();
const images=new Map();
const videoTextureCanvas=document.createElement('canvas');
const videoTextureCtx=videoTextureCanvas.getContext('2d');
window.__roughCutHeadlessExportProbe={ok:!!ctx,width:${output.width},height:${output.height},canvas:!!canvas,gpuCanvas:!!gpuCanvas,webgl:!!gl};
window.__roughCutCaptureHeadlessPng=()=>{if(!captureCtx)return null;captureCtx.clearRect(0,0,captureCanvas.width,captureCanvas.height);captureCtx.drawImage(gpuCanvas,0,0,captureCanvas.width,captureCanvas.height);captureCtx.drawImage(canvas,0,0,captureCanvas.width,captureCanvas.height);return captureCanvas.toDataURL('image/png')};
function color(value,fallback){return typeof value==='string'&&value?value:fallback}
const gpu=gl?createGpuRenderer(gl):null;
function createGpuRenderer(gl){const vertex='attribute vec2 a_position;attribute vec2 a_texCoord;uniform vec2 u_resolution;varying vec2 v_texCoord;void main(){vec2 zeroToOne=a_position/u_resolution;vec2 clip=zeroToOne*2.0-1.0;gl_Position=vec4(clip*vec2(1,-1),0,1);v_texCoord=a_texCoord;}';const fragment='precision mediump float;uniform sampler2D u_texture;uniform vec2 u_resolution;uniform vec4 u_color;uniform vec4 u_gradientEnd;uniform vec4 u_rect;uniform float u_radius;uniform float u_useTexture;uniform float u_useGradient;uniform float u_useRoundedMask;varying vec2 v_texCoord;void main(){if(u_useRoundedMask>0.5){vec2 pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);vec2 rectMin=u_rect.xy;vec2 rectMax=u_rect.xy+u_rect.zw;float radius=min(u_radius,min(u_rect.z,u_rect.w)*0.5);vec2 closest=clamp(pixel,rectMin+vec2(radius),rectMax-vec2(radius));if(distance(pixel,closest)>radius){discard;}}vec4 tex=texture2D(u_texture,v_texCoord);float gradientMix=clamp((gl_FragCoord.x/u_resolution.x+(1.0-gl_FragCoord.y/u_resolution.y))*0.5,0.0,1.0);vec4 gradientColor=mix(u_color,u_gradientEnd,gradientMix);vec4 solidOrGradient=mix(u_color,gradientColor,u_useGradient);gl_FragColor=mix(solidOrGradient,tex,u_useTexture);}';const program=createGpuProgram(gl,vertex,fragment);if(!program)return null;const position=gl.getAttribLocation(program,'a_position');const texCoord=gl.getAttribLocation(program,'a_texCoord');const resolution=gl.getUniformLocation(program,'u_resolution');const color=gl.getUniformLocation(program,'u_color');const gradientEnd=gl.getUniformLocation(program,'u_gradientEnd');const rect=gl.getUniformLocation(program,'u_rect');const radius=gl.getUniformLocation(program,'u_radius');const useTexture=gl.getUniformLocation(program,'u_useTexture');const useGradient=gl.getUniformLocation(program,'u_useGradient');const useRoundedMask=gl.getUniformLocation(program,'u_useRoundedMask');const positionBuffer=gl.createBuffer();const texCoordBuffer=gl.createBuffer();const texture=gl.createTexture();gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);return {program,position,texCoord,resolution,color,gradientEnd,rect,radius,useTexture,useGradient,useRoundedMask,positionBuffer,texCoordBuffer,texture}}
function createGpuProgram(gl,vertexSource,fragmentSource){const vertex=compileGpuShader(gl,gl.VERTEX_SHADER,vertexSource);const fragment=compileGpuShader(gl,gl.FRAGMENT_SHADER,fragmentSource);if(!vertex||!fragment)return null;const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);return gl.getProgramParameter(program,gl.LINK_STATUS)?program:null}
function compileGpuShader(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);return gl.getShaderParameter(shader,gl.COMPILE_STATUS)?shader:null}
function parseColor(value,fallback){const text=color(value,fallback);const hex=text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);if(hex){const raw=hex[1].length===3?hex[1].split('').map((part)=>part+part).join(''):hex[1];return [parseInt(raw.slice(0,2),16)/255,parseInt(raw.slice(2,4),16)/255,parseInt(raw.slice(4,6),16)/255,1]}return [0,0,0,1]}
function useGpuFrame(frame){return !!gpu&&frame&&frame.screen}
function clearGpu(colorValue){if(!gpu)return;const rgba=parseColor(colorValue,'#000000');gl.viewport(0,0,gpuCanvas.width,gpuCanvas.height);gl.clearColor(rgba[0],rgba[1],rgba[2],rgba[3]);gl.clear(gl.COLOR_BUFFER_BIT)}
function drawGpuBackground(bg){if(!gpu)return;const start=color((bg&&bg.startColor)||(bg&&bg.color),'#111827');const end=color((bg&&bg.endColor)||(bg&&bg.color),start);drawGpuQuad({x:0,y:0,width:gpuCanvas.width,height:gpuCanvas.height},{color:parseColor(start,'#111827'),gradientEnd:parseColor(end,start),gradient:start!==end||!!(bg&&bg.gradient)})}
async function drawGpuBackgroundImage(bg){const image=await waitForImageReady(imageFor(bg&&bg.imageUrl));if(!gpu||!image)return false;try{gl.bindTexture(gl.TEXTURE_2D,gpu.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);drawGpuQuad({x:0,y:0,width:gpuCanvas.width,height:gpuCanvas.height},{texture:true,textureWidth:image.naturalWidth||gpuCanvas.width,textureHeight:image.naturalHeight||gpuCanvas.height});return true}catch{return false}}
function drawGpuRect(rect,colorValue){if(!gpu)return;drawGpuQuad(rect,{color:parseColor(colorValue,'#000000')})}
function drawGpuVideo(video,rect,source){if(!gpu)return false;try{const textureSource=videoTextureSource(video,rect);gl.bindTexture(gl.TEXTURE_2D,gpu.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,textureSource);drawGpuQuad(rect,{texture:true,source,textureWidth:textureSource.width||video.videoWidth||rect.width,textureHeight:textureSource.height||video.videoHeight||rect.height});return true}catch{return false}}
function videoTextureSource(video,rect){const width=Math.max(1,video.videoWidth||Math.round(rect.width)||1);const height=Math.max(1,video.videoHeight||Math.round(rect.height)||1);if(!videoTextureCtx)return video;videoTextureCanvas.width=width;videoTextureCanvas.height=height;videoTextureCtx.clearRect(0,0,width,height);videoTextureCtx.drawImage(video,0,0,width,height);return videoTextureCanvas}
function drawGpuShadow(rect,style){if(!gpu||!style||style.shadowEnabled===false||!(style.shadowOpacity>0)||!(style.shadowBlur>0))return false;const steps=6;for(let index=steps;index>=1;index-=1){const t=index/steps;const spread=style.shadowBlur*t*0.55;const alpha=style.shadowOpacity*(1-t*0.86)/steps;drawGpuQuad({x:rect.x+style.shadowOffsetX-spread,y:rect.y+style.shadowOffsetY-spread,width:rect.width+spread*2,height:rect.height+spread*2,radius:(style.radius||0)+spread},{color:[0,0,0,Math.max(0,alpha)]})}return true}
function drawGpuQuad(rect,options={}){if(!gpu)return;const x=rect.x||0;const y=rect.y||0;const w=rect.width||rect.w||0;const h=rect.height||rect.h||0;const positions=new Float32Array([x,y,x+w,y,x,y+h,x,y+h,x+w,y,x+w,y+h]);const sx=options.source?options.source.x||0:0;const sy=options.source?options.source.y||0:0;const sw=options.source?options.source.width||options.textureWidth:options.textureWidth||1;const sh=options.source?options.source.height||options.textureHeight:options.textureHeight||1;const tw=options.textureWidth||1;const th=options.textureHeight||1;const tex=new Float32Array([sx/tw,sy/th,(sx+sw)/tw,sy/th,sx/tw,(sy+sh)/th,sx/tw,(sy+sh)/th,(sx+sw)/tw,sy/th,(sx+sw)/tw,(sy+sh)/th]);const roundedRadius=Number.isFinite(options.roundedRadius)?options.roundedRadius:Number.isFinite(rect.radius)?rect.radius:0;gl.useProgram(gpu.program);gl.uniform2f(gpu.resolution,gpuCanvas.width,gpuCanvas.height);gl.uniform4fv(gpu.color,options.color||[0,0,0,1]);gl.uniform4fv(gpu.gradientEnd,options.gradientEnd||options.color||[0,0,0,1]);gl.uniform4f(gpu.rect,x,y,w,h);gl.uniform1f(gpu.radius,roundedRadius);gl.uniform1f(gpu.useTexture,options.texture?1:0);gl.uniform1f(gpu.useGradient,options.gradient?1:0);gl.uniform1f(gpu.useRoundedMask,roundedRadius>0?1:0);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.positionBuffer);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STREAM_DRAW);gl.enableVertexAttribArray(gpu.position);gl.vertexAttribPointer(gpu.position,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.texCoordBuffer);gl.bufferData(gl.ARRAY_BUFFER,tex,gl.STREAM_DRAW);gl.enableVertexAttribArray(gpu.texCoord);gl.vertexAttribPointer(gpu.texCoord,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6)}
function drawGpuSolidPolygon(points,colorValue){if(!gpu||points.length<3)return;const positions=new Float32Array(points.flatMap((point)=>[point.x,point.y]));const tex=new Float32Array(points.length*2);gl.useProgram(gpu.program);gl.uniform2f(gpu.resolution,gpuCanvas.width,gpuCanvas.height);gl.uniform4fv(gpu.color,colorValue);gl.uniform4fv(gpu.gradientEnd,colorValue);gl.uniform4f(gpu.rect,0,0,0,0);gl.uniform1f(gpu.radius,0);gl.uniform1f(gpu.useTexture,0);gl.uniform1f(gpu.useGradient,0);gl.uniform1f(gpu.useRoundedMask,0);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.positionBuffer);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.STREAM_DRAW);gl.enableVertexAttribArray(gpu.position);gl.vertexAttribPointer(gpu.position,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,gpu.texCoordBuffer);gl.bufferData(gl.ARRAY_BUFFER,tex,gl.STREAM_DRAW);gl.enableVertexAttribArray(gpu.texCoord);gl.vertexAttribPointer(gpu.texCoord,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLE_FAN,0,points.length)}
function roundedRect(x,y,w,h,r){const radius=Math.max(0,Math.min(r||0,w/2,h/2));ctx.beginPath();ctx.moveTo(x+radius,y);ctx.lineTo(x+w-radius,y);ctx.quadraticCurveTo(x+w,y,x+w,y+radius);ctx.lineTo(x+w,y+h-radius);ctx.quadraticCurveTo(x+w,y+h,x+w-radius,y+h);ctx.lineTo(x+radius,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-radius);ctx.lineTo(x,y+radius);ctx.quadraticCurveTo(x,y,x+radius,y);ctx.closePath()}
function cameraShapePath(camera,style){if(style&&style.shape==='circle'){ctx.beginPath();ctx.arc(camera.x+camera.width/2,camera.y+camera.height/2,Math.min(camera.width,camera.height)/2,0,Math.PI*2);return}roundedRect(camera.x,camera.y,camera.width,camera.height,style&&Number.isFinite(style.radius)?style.radius:0)}
function imageFor(url){if(!url)return null;if(images.has(url))return images.get(url);const image=new Image();image.src=url;images.set(url,image);return image}
function waitForImageReady(image){if(!image)return Promise.resolve(null);if(image.complete&&image.naturalWidth>0&&image.naturalHeight>0)return Promise.resolve(image);return new Promise((resolve)=>{const cleanup=()=>{image.removeEventListener('load',done);image.removeEventListener('error',fail)};const done=()=>{cleanup();resolve(image)};const fail=()=>{cleanup();resolve(null)};image.addEventListener('load',done,{once:true});image.addEventListener('error',fail,{once:true})})}
async function drawBackground(frame){const bg=frame&&frame.background?frame.background:{};const start=color(bg.startColor||bg.color,'#111827');const end=color(bg.endColor||bg.color,start);if(start!==end||bg.gradient){const gradient=ctx.createLinearGradient(0,0,canvas.width,canvas.height);gradient.addColorStop(0,start);gradient.addColorStop(1,end);ctx.fillStyle=gradient}else{ctx.fillStyle=start}ctx.fillRect(0,0,canvas.width,canvas.height);const image=await waitForImageReady(imageFor(bg.imageUrl));if(image){ctx.drawImage(image,0,0,canvas.width,canvas.height);return true}return false}
function layerFrame(layer, fallback){const frame=layer&&layer.frame;if(!frame)return fallback;const rawWidth=Number.isFinite(frame.width)?frame.width:frame.w;const rawHeight=Number.isFinite(frame.height)?frame.height:frame.h;if(!Number.isFinite(rawWidth)||!Number.isFinite(rawHeight))return fallback;const normalized=rawWidth<=1&&rawHeight<=1;return normalized?{x:(Number(frame.x)||0)*canvas.width,y:(Number(frame.y)||0)*canvas.height,width:rawWidth*canvas.width,height:rawHeight*canvas.height}:{x:Number(frame.x)||0,y:Number(frame.y)||0,width:rawWidth,height:rawHeight}}
function screenStyle(layer,screen){const style=layer&&layer.style?layer.style:{};const radius=Math.max(0,Math.min(Number.isFinite(style.cornerRadius)?style.cornerRadius:32,screen.width/2,screen.height/2));const shadowEnabled=style.shadowEnabled!==false;const shadowBlur=Math.max(0,Number.isFinite(style.shadowBlur)?style.shadowBlur:58);const shadowOpacity=Math.max(0,Math.min(0.8,Number.isFinite(style.shadowOpacity)?style.shadowOpacity:0.2));const shadowOffsetX=Number.isFinite(style.shadowOffsetX)?style.shadowOffsetX:0;const shadowOffsetY=Number.isFinite(style.shadowOffsetY)?style.shadowOffsetY:34;return {radius,shadowEnabled,shadowBlur,shadowOpacity,shadowOffsetX,shadowOffsetY}}
function cameraStyle(layer,camera){const style=layer&&layer.style?layer.style:{};const presentation=layer&&layer.presentation?layer.presentation:{};const shape=style.shape||presentation.shape||'rounded';const roundness=Number.isFinite(style.roundness)?style.roundness:Number.isFinite(presentation.roundness)?presentation.roundness:50;const fallbackRadius=shape==='square'?0:shape==='circle'?Math.min(camera.width,camera.height)/2:(Math.min(camera.width,camera.height)/2)*Math.max(0,Math.min(1,roundness/100));const radius=Math.max(0,Math.min(Number.isFinite(layer&&layer.radius)?layer.radius:fallbackRadius,camera.width/2,camera.height/2));const shadowEnabled=style.shadowEnabled!==false&&presentation.shadowEnabled!==false;const shadowBlur=Math.max(0,Number.isFinite(style.shadowBlur)?style.shadowBlur:Number.isFinite(presentation.shadowBlur)?presentation.shadowBlur:24);const shadowOpacity=Math.max(0,Math.min(0.8,Number.isFinite(style.shadowOpacity)?style.shadowOpacity:Number.isFinite(presentation.shadowOpacity)?presentation.shadowOpacity:0.45));return {shape,radius,shadowEnabled,shadowBlur,shadowOpacity}}
function sourcePoint(frame,screen,source){const size=frame.screen&&frame.screen.sourceSize;if(!source||!size||!Number.isFinite(size.width)||!Number.isFinite(size.height))return null;const sourceRect=screenSourceRect({videoWidth:size.width,videoHeight:size.height},frame.screen,screen);const sourceX=(Math.abs(source.x)>1?source.x:source.x*size.width)-sourceRect.x;const sourceY=(Math.abs(source.y)>1?source.y:source.y*size.height)-sourceRect.y;return {x:screen.x+(sourceX/sourceRect.width)*screen.width,y:screen.y+(sourceY/sourceRect.height)*screen.height}}
function cursorPoint(frame, screen){return sourcePoint(frame,screen,frame.cursor&&frame.cursor.sourcePosition)}
function clickPoint(frame, screen){return sourcePoint(frame,screen,(frame.click&&frame.click.sourcePosition)||(frame.cursor&&frame.cursor.sourcePosition))}
function cursorStyle(frame){const cursor=frame&&frame.cursor?frame.cursor:{};const style=cursor.style==='subtle'||cursor.style==='spotlight'?cursor.style:'default';const rawSize=Number.isFinite(cursor.sizePercent)?cursor.sizePercent:100;const scale=Math.max(0.5,Math.min(1.5,rawSize/100));return {style,scale}}
function drawCursor(point,styleInfo){const style=styleInfo.style;const scale=styleInfo.scale;if(style==='spotlight'){ctx.save();ctx.beginPath();ctx.arc(point.x+12*scale,point.y+16*scale,36*scale,0,Math.PI*2);ctx.fillStyle='rgba(122,167,255,0.22)';ctx.fill();ctx.restore()}ctx.save();if(style==='subtle')ctx.globalAlpha=0.6;ctx.fillStyle='#ffffff';ctx.strokeStyle=style==='spotlight'?'#7AA7FF':'#111827';ctx.lineWidth=(style==='spotlight'?6.4:4)*scale;ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(point.x,point.y+34*scale);ctx.lineTo(point.x+10*scale,point.y+25*scale);ctx.lineTo(point.x+17*scale,point.y+42*scale);ctx.lineTo(point.x+25*scale,point.y+38*scale);ctx.lineTo(point.x+18*scale,point.y+22*scale);ctx.lineTo(point.x+31*scale,point.y+22*scale);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore()}
function drawClick(point,frame){const effect=frame&&frame.click&&frame.click.effect?frame.click.effect:'ring';if(effect==='none')return;ctx.save();if(effect==='ripple'){ctx.fillStyle='rgba(122,167,255,0.32)';ctx.beginPath();ctx.arc(point.x,point.y,38,0,Math.PI*2);ctx.fill()}else{ctx.strokeStyle='#7AA7FF';ctx.lineWidth=4;ctx.beginPath();ctx.arc(point.x,point.y,38,0,Math.PI*2);ctx.stroke()}ctx.restore()}
function drawGpuCursor(point,styleInfo){const style=styleInfo.style;const scale=styleInfo.scale;if(style==='spotlight')drawGpuQuad({x:point.x-24*scale,y:point.y-20*scale,width:72*scale,height:72*scale,radius:36*scale},{color:[122/255,167/255,255/255,0.22]});const outer=[{x:point.x-3*scale,y:point.y-3*scale},{x:point.x-3*scale,y:point.y+42*scale},{x:point.x+34*scale,y:point.y+24*scale}];const inner=[{x:point.x,y:point.y},{x:point.x,y:point.y+34*scale},{x:point.x+27*scale,y:point.y+21*scale}];drawGpuSolidPolygon(outer,style==='spotlight'?[122/255,167/255,255/255,1]:[17/255,24/255,39/255,1]);drawGpuSolidPolygon(inner,[1,1,1,style==='subtle'?0.6:1])}
function drawGpuClick(point,frame){const effect=frame&&frame.click&&frame.click.effect?frame.click.effect:'ring';if(effect==='none')return;const radius=effect==='ripple'?38:30;const alpha=effect==='ripple'?0.32:0.55;drawGpuQuad({x:point.x-radius,y:point.y-radius,width:radius*2,height:radius*2,radius},{color:[122/255,167/255,255/255,alpha]})}
function fallbackScreen(screen){ctx.fillStyle='#334155';ctx.fillRect(screen.x+6,screen.y+6,Math.max(1,screen.width-12),Math.max(1,screen.height-12));ctx.fillStyle='#60a5fa';ctx.fillRect(screen.x+screen.width*0.08,screen.y+screen.height*0.18,screen.width*0.34,screen.height*0.14);ctx.fillStyle='#f97316';ctx.fillRect(screen.x+screen.width*0.52,screen.y+screen.height*0.52,screen.width*0.28,screen.height*0.18)}
function fallbackCamera(camera){ctx.fillStyle='#0f172a';ctx.fill();ctx.fillStyle='#e2e8f0';ctx.fillRect(camera.x+camera.width*0.25,camera.y+camera.height*0.18,camera.width*0.5,camera.height*0.2);ctx.fillStyle='#38bdf8';ctx.beginPath();ctx.arc(camera.x+camera.width*0.5,camera.y+camera.height*0.58,Math.min(camera.width,camera.height)*0.18,0,Math.PI*2);ctx.fill()}
function videoFor(layer){const url=layer&&layer.sourceUrl;if(!url)return null;if(videos.has(url))return videos.get(url);const video=document.createElement('video');video.src=url;video.muted=true;video.preload='auto';video.playsInline=true;videos.set(url,video);return video}
function waitForVideoReady(video){if(video.readyState>=1)return Promise.resolve();return new Promise((resolve,reject)=>{const cleanup=()=>{video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail)};const done=()=>{cleanup();resolve()};const fail=()=>{cleanup();reject(new Error('video-load-failed'))};video.addEventListener('loadedmetadata',done,{once:true});video.addEventListener('error',fail);video.load()})}
function waitForVideoFrame(video){if(video.readyState>=2)return Promise.resolve();return new Promise((resolve,reject)=>{const cleanup=()=>{video.removeEventListener('loadeddata',done);video.removeEventListener('canplay',done);video.removeEventListener('timeupdate',done);video.removeEventListener('error',fail)};const done=()=>{cleanup();resolve()};const fail=()=>{cleanup();reject(new Error('video-frame-unavailable'))};video.addEventListener('loadeddata',done,{once:true});video.addEventListener('canplay',done,{once:true});video.addEventListener('timeupdate',done,{once:true});video.addEventListener('error',fail,{once:true})})}
async function seekVideo(video,time){await waitForVideoReady(video);const target=Math.max(0,Number(time)||0);if(Math.abs(video.currentTime-target)<0.001&&video.readyState>=2)return;await new Promise((resolve,reject)=>{const cleanup=()=>{video.removeEventListener('seeked',done);video.removeEventListener('error',fail)};const done=()=>{cleanup();resolve()};const fail=()=>{cleanup();reject(new Error('video-seek-failed'))};video.addEventListener('seeked',done,{once:true});video.addEventListener('error',fail,{once:true});video.currentTime=target});await waitForVideoFrame(video)}
function flushCanvasFrame(){return new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}
function sourceViewportRect(layer,vw,vh){const viewport=layer&&(layer.sourceViewport||layer.crop);if(!viewport||viewport.enabled!==true)return {x:0,y:0,width:vw,height:vh};const x=Math.max(0,Math.min(vw-1,Math.round(Number(viewport.x)||0)));const y=Math.max(0,Math.min(vh-1,Math.round(Number(viewport.y)||0)));const width=Math.max(1,Math.min(vw-x,Math.round(Number(viewport.width)||vw)));const height=Math.max(1,Math.min(vh-y,Math.round(Number(viewport.height)||vh)));return {x,y,width,height}}
function coverSourceRect(video,layer,dest){const vw=video.videoWidth||dest.width;const vh=video.videoHeight||dest.height;const base=sourceViewportRect(layer,vw,vh);const scale=Math.max(dest.width/base.width,dest.height/base.height);const sw=Math.max(1,Math.min(base.width,dest.width/scale));const sh=Math.max(1,Math.min(base.height,dest.height/scale));const sx=base.x+Math.max(0,(base.width-sw)/2);const sy=base.y+Math.max(0,(base.height-sh)/2);return {x:sx,y:sy,width:sw,height:sh}}
function drawCover(video,x,y,w,h,layer){const source=coverSourceRect(video,layer,{x,y,width:w,height:h});ctx.drawImage(video,source.x,source.y,source.width,source.height,x,y,w,h)}
function screenSourceRect(video,layer,screen){const source=layer.sourceSize||{};const vw=video.videoWidth||source.width||screen.width;const vh=video.videoHeight||source.height||screen.height;const base=sourceViewportRect(layer,vw,vh);const transform=layer.zoomTransform||{};const scale=Number.isFinite(transform.scale)&&transform.scale>0?transform.scale:1;const offsetX=Number.isFinite(transform.offsetX)?transform.offsetX:0;const offsetY=Number.isFinite(transform.offsetY)?transform.offsetY:0;const sw=Math.max(1,Math.min(base.width,base.width/scale));const sh=Math.max(1,Math.min(base.height,base.height/scale));const sx=base.x+Math.max(0,Math.min(base.width-sw,base.width/2-sw/2-offsetX/scale));const sy=base.y+Math.max(0,Math.min(base.height-sh,base.height/2-sh/2-offsetY/scale));return {x:sx,y:sy,width:sw,height:sh}}
function drawZoomedScreen(video,layer,screen){const source=screenSourceRect(video,layer,screen);ctx.drawImage(video,source.x,source.y,source.width,source.height,screen.x,screen.y,screen.width,screen.height)}
async function drawGpuScreenLayer(layer,screen){const video=videoFor(layer);if(!video)return false;const fps=Number.isFinite(layer.fps)&&layer.fps>0?layer.fps:30;const sourceFrame=Number.isFinite(layer.sourceFrame)?layer.sourceFrame:0;try{await seekVideo(video,sourceFrame/fps);const style=screenStyle(layer,screen);return drawGpuVideo(video,{...screen,radius:style.radius},screenSourceRect(video,layer,screen))}catch{return false}}
async function drawGpuCameraLayer(layer,camera){const video=videoFor(layer);if(!video)return false;const fps=Number.isFinite(layer.fps)&&layer.fps>0?layer.fps:30;const sourceFrame=Number.isFinite(layer.sourceFrame)?layer.sourceFrame:0;try{await seekVideo(video,sourceFrame/fps);const style=cameraStyle(layer,camera);return drawGpuVideo(video,{...camera,radius:style.radius},coverSourceRect(video,layer,camera))}catch{return false}}
async function drawVideoLayer(layer,dest,kind){const video=videoFor(layer);if(!video)return false;const fps=Number.isFinite(layer.fps)&&layer.fps>0?layer.fps:30;const sourceFrame=Number.isFinite(layer.sourceFrame)?layer.sourceFrame:0;try{await seekVideo(video,sourceFrame/fps);if(kind==='screen')drawZoomedScreen(video,layer,dest);else drawCover(video,dest.x,dest.y,dest.width,dest.height,layer);return true}catch{return false}}
window.__roughCutRenderHeadlessFrame=async(frame,index)=>{
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const timelineGap=frame&&frame.timelineGap===true;
  const screen=frame&&frame.screen&&!timelineGap?layerFrame(frame.screen,{x:canvas.width*0.12,y:canvas.height*0.16,width:canvas.width*0.76,height:canvas.height*0.62}):null;
  const useGpu=useGpuFrame(frame);
  if(gpu&&!useGpu)clearGpu('#000000');
  let drewBackgroundImage=false;
  if(useGpu){clearGpu((frame.background&&frame.background.startColor)||'#111827');drawGpuBackground(frame.background);drewBackgroundImage=await drawGpuBackgroundImage(frame.background)}
  else drewBackgroundImage=await drawBackground(frame);
  let drewScreen=null;
  let usedGpu=false;
  let drewScreenShadow=false;
  if(screen&&useGpu){const style=screenStyle(frame.screen,screen);drewScreenShadow=drawGpuShadow(screen,style);drewScreen=await drawGpuScreenLayer(frame.screen,screen);if(drewScreen)usedGpu=true;else{clearGpu('#000000');drewBackgroundImage=await drawBackground(frame);fallbackScreen(screen);drewScreenShadow=false}}
  else if(screen){const style=screenStyle(frame.screen,screen);if(style.shadowEnabled&&style.shadowOpacity>0&&style.shadowBlur>0){ctx.save();ctx.shadowColor='rgba(0,0,0,'+style.shadowOpacity+')';ctx.shadowBlur=style.shadowBlur;ctx.shadowOffsetX=style.shadowOffsetX;ctx.shadowOffsetY=style.shadowOffsetY;roundedRect(screen.x,screen.y,screen.width,screen.height,style.radius);ctx.fillStyle='rgba(0,0,0,'+style.shadowOpacity+')';ctx.fill();ctx.restore()}
  ctx.save();roundedRect(screen.x,screen.y,screen.width,screen.height,style.radius);ctx.clip();drewScreen=await drawVideoLayer(frame.screen,screen,'screen');if(!drewScreen)fallbackScreen(screen);ctx.restore();}
  const camera=frame&&frame.camera&&frame.camera.visible!==false?layerFrame(frame.camera,null):null;
  let drewCamera=null;
  let drewCameraShadow=false;
  if(camera&&useGpu&&usedGpu){const style=cameraStyle(frame.camera,camera);drewCameraShadow=drawGpuShadow(camera,{...style,shadowOffsetX:0,shadowOffsetY:0});drewCamera=await drawGpuCameraLayer(frame.camera,camera);if(!drewCamera){usedGpu=false;clearGpu('#000000');drewBackgroundImage=await drawBackground(frame);fallbackScreen(screen);fallbackCamera(camera);drewScreenShadow=false;drewCameraShadow=false}}
  else if(camera){const style=cameraStyle(frame.camera,camera);if(style.shadowEnabled&&style.shadowOpacity>0&&style.shadowBlur>0){ctx.save();ctx.shadowColor='rgba(0,0,0,'+style.shadowOpacity+')';ctx.shadowBlur=style.shadowBlur;cameraShapePath(camera,style);ctx.fillStyle='rgba(0,0,0,'+style.shadowOpacity+')';ctx.fill();ctx.restore()}ctx.save();cameraShapePath(camera,style);ctx.clip();drewCamera=await drawVideoLayer(frame.camera,camera,'camera');if(!drewCamera)fallbackCamera(camera);ctx.restore()}
  const point=screen&&frame&&frame.cursor&&frame.cursor.visible!==false?cursorPoint(frame,screen):null;
  if(point){if(usedGpu)drawGpuCursor(point,cursorStyle(frame));else drawCursor(point,cursorStyle(frame))}
  const clicked=screen&&frame&&frame.click&&frame.click.visible?clickPoint(frame,screen):null;
  if(clicked){if(usedGpu)drawGpuClick(clicked,frame);else drawClick(clicked,frame)}
  await flushCanvasFrame();
  return {ok:true,index,frameIndex:frame&&frame.frameIndex,timelineGap,rendererKind:usedGpu?'webgl':'canvas2d',drewScreen,drewCamera,drewScreenShadow,drewCameraShadow,drewBackgroundImage,cursorPoint:point?{x:Math.round(point.x*100)/100,y:Math.round(point.y*100)/100}:null,clickPoint:clicked?{x:Math.round(clicked.x*100)/100,y:Math.round(clicked.y*100)/100}:null};
};
</script>`;
}
