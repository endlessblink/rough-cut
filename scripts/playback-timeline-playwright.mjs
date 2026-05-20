import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveProjectFile, saveProjectForRecording } from '../apps/desktop/src/main/project-files.mjs';

const root = await mkdtemp(join(tmpdir(), 'rough-cut-playback-timeline-'));
const mediaPath = join(root, 'playback-source.mp4');
const reportPath = join(root, 'playback-report.json');

await mkdir(root, { recursive: true });
run('ffmpeg', [
  '-y',
  '-f',
  'lavfi',
  '-i',
  buildPlaybackFilter(),
  '-t',
  '6',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  mediaPath,
]);

const startedAt = new Date('2026-01-01T00:00:00.000Z');
const stoppedAt = new Date(startedAt.getTime() + 6000);
let project = await saveProjectForRecording({
  startedAt: startedAt.toISOString(),
  stoppedAt: stoppedAt.toISOString(),
  rawPath: mediaPath,
  outputPath: mediaPath,
  width: 960,
  height: 540,
  fps: 30,
});
project = await saveProjectFile(project.path, offsetScreenClip(project.document));

const recordingResult = await runPlaybackProbe({ view: 'recording', projectPath: project.path });
const nleResult = await runPlaybackProbe({ view: 'nle', projectPath: project.path });
const report = {
  ok: recordingResult.ok && nleResult.ok,
  root,
  projectPath: project.path,
  recording: recordingResult,
  nle: nleResult,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({
  ok: report.ok,
  reportPath,
  root,
  projectPath: project.path,
  recording: summarizeResult(recordingResult),
  nle: summarizeResult(nleResult),
}, null, 2));

if (!report.ok) {
  throw new Error(`Timeline playback regression failed: ${JSON.stringify({ reportPath, root, recording: summarizeResult(recordingResult), nle: summarizeResult(nleResult) })}`);
}

async function runPlaybackProbe({ view, projectPath }) {
  const { _electron: electron } = loadPlaywright();
  const electronPath = join(process.cwd(), 'apps/desktop/node_modules/.bin/electron');
  const app = await electron.launch({
    executablePath: electronPath,
    args: ['--no-sandbox', '--force-color-profile=srgb', '.'],
    cwd: join(process.cwd(), 'apps/desktop'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
      ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    },
  });
  const electronProcess = app.process();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    if (view === 'nle') {
      await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
      await page.locator('[data-ui-region="app-view-tabstrip"] button[title="Editor"]').click({ force: true });
      await page.waitForSelector('[data-ui-region="nle-workspace"]', { timeout: 15000 });
    } else {
      await dismissPreRecordOverlay(page);
      await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 15000 });
    }
    await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 15000 });
    await page.addScriptTag({ content: `
      window.__roughCutReadCanvasStats = (${readCanvasStats.toString()});
      window.__roughCutReadPlaybackState = (${readPlaybackState.toString()});
    ` });
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video instanceof HTMLVideoElement && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0;
    }, null, { timeout: 15000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.styledPreviewCanvas');
      return canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0;
    }, null, { timeout: 15000 });

    const before = await page.evaluate(() => window.__roughCutReadPlaybackState());
    if (view === 'nle') await page.locator('[data-ui-region="nle-transport"] button[aria-label="Play"]').click();
    else await page.locator('.videoControls .transportButton').click();
    await page.waitForTimeout(1800);
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video instanceof HTMLVideoElement && video.currentTime > 2.25;
    }, null, { timeout: 7000 });
    await page.waitForFunction(() => window.__roughCutReadCanvasStats().ok, null, { timeout: 7000 });
    const after = await page.evaluate(() => window.__roughCutReadPlaybackState());
    return {
      ok: after.videoTime > before.videoTime + 0.2 && after.videoTime > 2.25 && after.canvas.ok && after.drawCount > before.drawCount,
      before,
      after,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await Promise.race([
      app.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (!electronProcess.killed) electronProcess.kill();
  }
}

function offsetScreenClip(document) {
  const recordingAsset = document.assets.find((asset) => asset.type === 'recording');
  if (!recordingAsset) throw new Error('Fixture did not create a recording asset.');
  const mediaId = `source:${recordingAsset.id}:screen`;
  const tracks = document.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => clip.mediaId === mediaId
      ? {
          ...clip,
          timelineIn: 30,
          timelineOut: 120,
          sourceIn: 60,
          sourceOut: 150,
        }
      : clip),
  }));
  return {
    ...document,
    name: 'playback-source-offset-gap',
    composition: {
      ...document.composition,
      duration: 150,
    },
    timeline: {
      ...document.timeline,
      tracks,
    },
  };
}

function readPlaybackState() {
  const video = document.querySelector('video');
  return {
    videoTime: video instanceof HTMLVideoElement ? video.currentTime : -1,
    videoPaused: video instanceof HTMLVideoElement ? video.paused : null,
    drawCount: window.__roughCutCanvasDrawCount ?? 0,
    timecode: document.querySelector('.nleTransportTimeCurrent')?.textContent
      ?? document.querySelector('.videoControls .timecode')?.textContent
      ?? null,
    canvas: window.__roughCutReadCanvasStats(),
  };
}

function readCanvasStats() {
  const canvas = document.querySelector('canvas.styledPreviewCanvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
    return { ok: false, reason: 'missing-canvas', saturation: 0, contrast: 0, darkRatio: 1 };
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { ok: false, reason: 'missing-context', saturation: 0, contrast: 0, darkRatio: 1 };
  const sampleWidth = Math.min(240, canvas.width);
  const sampleHeight = Math.min(140, canvas.height);
  const startX = Math.floor((canvas.width - sampleWidth) / 2);
  const startY = Math.floor((canvas.height - sampleHeight) / 2);
  const data = context.getImageData(startX, startY, sampleWidth, sampleHeight).data;
  let saturation = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let dark = 0;
  const pixels = data.length / 4;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    saturation += Math.max(red, green, blue) - Math.min(red, green, blue);
    if (luma < 16) dark += 1;
  }
  const stats = {
    saturation: saturation / pixels,
    contrast: maxLuma - minLuma,
    darkRatio: dark / pixels,
  };
  return {
    ...stats,
    ok: stats.saturation > 4 && stats.contrast > 10 && stats.darkRatio < 0.98,
  };
}

function summarizeResult(result) {
  return {
    ok: result.ok,
    error: result.error,
    beforeVideoTime: result.before?.videoTime,
    afterVideoTime: result.after?.videoTime,
    beforeDrawCount: result.before?.drawCount,
    afterDrawCount: result.after?.drawCount,
    afterCanvas: result.after?.canvas,
    timecode: result.after?.timecode,
  };
}

function buildPlaybackFilter() {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'testsrc2=size=960x540:rate=30',
    `drawtext=fontfile=${font}:text='TIMELINE CLOCK':fontcolor=white:fontsize=44:x=40:y=40:box=1:boxcolor=0x00000099`,
    'drawbox=x=40:y=410:w=140:h=90:color=0xff0000:t=fill',
    'drawbox=x=410:y=410:w=140:h=90:color=0x00ff00:t=fill',
    'drawbox=x=780:y=410:w=140:h=90:color=0x0000ff:t=fill',
  ].join(',');
}

function loadPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

async function dismissPreRecordOverlay(page) {
  const overlay = page.locator('[data-ui-region="pre-record-panel"]');
  if (await overlay.count() === 0) return;
  const openEditor = page.locator('[data-open-editor="pre-record"]');
  if (await openEditor.count() > 0) await openEditor.click();
  else await page.locator('button:has-text("Cancel")').click();
  await overlay.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
}
