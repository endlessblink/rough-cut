// Capture one animation frame from the hidden graphics window, and never let a bad capture pass silently.
// An empty or failed capture is retried a few times; if it still fails the export reports why instead of
// quietly leaving the animations out.

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function captureFrameWithRetry(webContents, { width, height, attempts = 3, delayMs = 120, sleep = defaultSleep } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      webContents.invalidate();
      // An explicit rectangle: with fewer arguments Electron may ignore the capture options.
      const image = await webContents.capturePage({ x: 0, y: 0, width, height });
      if (image && !image.isEmpty()) return image;
      lastError = new Error('the captured frame was empty');
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(delayMs * attempt);
  }
  throw new Error(`Could not capture an animation frame after ${attempts} tries: ${lastError?.message ?? lastError}`);
}
