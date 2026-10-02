// Renders a graphic page to a transparent PNG sequence for export.
//
// Uses an offscreen, sandboxed, transparent BrowserWindow loading the exact page
// the preview shows (buildGraphicDocument), and seeks it frame by frame. Network
// requests are refused at the session level on top of the page's own CSP.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildGraphicDocument } from '../shared/motion-graphics.mjs';
import { captureFrameWithRetry } from './graphics-capture.mjs';

const SETTLE_SCRIPT = 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))';

export async function renderGraphicFrames({ item, width, height, framesDir, signal = null, onFrame = () => undefined }) {
  const { BrowserWindow, session } = await import('electron');
  const partition = `rough-cut-graphics-export-${process.pid}`;
  const graphicsSession = session.fromPartition(partition, { cache: false });
  graphicsSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith('data:') });
  });
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      partition,
      // A hidden window must keep painting at full speed, or captured frames can come back empty.
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  try {
    await mkdir(framesDir, { recursive: true });
    const page = buildGraphicDocument({ html: item.html, fields: item.fields, width, height, animate: item.animate !== false, holdSec: item.holdSec, durationSec: item.durationSec, layout: item.layout, timing: item.timing, designedSec: item.designedSec });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    for (let frame = 0; frame < item.frameCount; frame += 1) {
      if (signal?.aborted) return { ok: false, cancelled: true };
      const t = frame / item.fps;
      await win.webContents.executeJavaScript(`window.RC.seek(${t}); ${SETTLE_SCRIPT}`);
      const image = await captureFrameWithRetry(win.webContents, { width, height });
      const size = image.getSize();
      const png = size.width === width && size.height === height ? image.toPNG() : image.resize({ width, height }).toPNG();
      await writeFile(join(framesDir, `${String(frame).padStart(6, '0')}.png`), png);
      onFrame(frame + 1, item.frameCount);
    }
    return { ok: true };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
