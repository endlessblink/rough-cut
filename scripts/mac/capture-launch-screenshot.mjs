import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Intel runners can render normally while Page.captureScreenshot never resolves.
// Keep visual proof mandatory, using macOS's native capture when CDP fails.
export async function captureLaunchScreenshot({ path, capturePage, nativeCapture = output => {
  const result = spawnSync('screencapture', ['-x', output], { timeout: 20000, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Native Mac screenshot failed.');
} }) {
  let method = 'browser';
  try {
    const shot = await capturePage();
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
  } catch {
    method = 'native-macos';
    await nativeCapture(path);
  }
  const bytes = readFileSync(path);
  if (bytes.length < 1000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.length < 24 || bytes.readUInt32BE(16) < 100 || bytes.readUInt32BE(20) < 100) {
    throw new Error('Launch screenshot is missing, empty or invalid.');
  }
  return method;
}
