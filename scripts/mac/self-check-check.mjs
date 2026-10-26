// Checks the real packaged support screen without claiming runner hardware exists.
// No Claude messages, credential values, media permission prompts, or issue submission.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ids = ['opens', 'screen', 'mic', 'camera', 'claude', 'transcription'];
const files = ['README.txt', 'app-runtime.log', 'self-check.json', 'summary.json'];

function unzip(path, args) {
  const result = spawnSync('unzip', [...args, path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, `Diagnostic zip could not be read: ${String(result.stderr).slice(-300)}`);
  return result.stdout;
}

async function screenshot(app, page, path) {
  await page.screenshot({ path, timeout: 120000 }).catch(async () => {
    const png = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    writeFileSync(path, Buffer.from(png, 'base64'));
  });
  assert.ok(readFileSync(path).length > 1000, 'Support screenshot is empty.');
}

export async function runMacSelfCheck({ app, page, outDir }) {
  mkdirSync(outDir, { recursive: true });
  const runtime = await app.evaluate(({ app: electronApp }) => ({
    version: electronApp.getVersion(), desktop: electronApp.getPath('desktop'), home: electronApp.getPath('home'),
  }));
  const status = await page.evaluate(() => window.roughCut.supportStatus());
  assert.equal(status.appVersion, runtime.version, 'Support status does not describe the running package.');
  assert.ok(status.claude && typeof status.claude.ok === 'boolean', 'Claude observation is missing.');
  assert.ok(status.transcription && typeof status.transcription.available === 'boolean', 'Transcription observation is missing.');
  for (const name of ['screen', 'microphone', 'camera', 'accessibility']) {
    assert.equal(typeof status.permissions?.[name], 'string', `Permission observation missing: ${name}`);
  }

  // A runner with screen permission can prove capture; a denied/unavailable desktop is explicitly not a pass.
  let screenCapture = 'not checked: runner has no screen permission';
  if (status.permissions.screen === 'granted') {
    const thumbnail = await page.evaluate(() => window.roughCut.supportScreenThumbnail());
    assert.match(thumbnail.dataUrl, /^data:image\/png;base64,/, 'Screen capture did not return a PNG.');
    const image = await app.evaluate(({ nativeImage }, dataUrl) => {
      const image = nativeImage.createFromDataURL(dataUrl);
      return { empty: image.isEmpty(), ...image.getSize() };
    }, thumbnail.dataUrl);
    assert.ok(!image.empty && image.width > 0 && image.height > 0, 'Granted screen capture produced an empty image.');
    screenCapture = 'real thumbnail captured; image is not included in the report';
  }

  await app.evaluate(({ Menu }) => {
    const visit = menu => {
      for (const item of menu?.items ?? []) {
        if (/^Mac self.check(?:…|\.\.\.)?$/.test(item.label.replaceAll('&', ''))) return item;
        const found = visit(item.submenu);
        if (found) return found;
      }
      return null;
    };
    const item = visit(Menu.getApplicationMenu());
    if (!item) throw new Error('Help menu has no Mac self-check action.');
    item.click(item);
  });
  const dialog = page.getByRole('dialog', { name: 'Mac self-check', exact: true });
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
  await dialog.getByRole('button', { name: 'Check app setup only', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Check finished.' }).waitFor({ timeout: 30000 });
  assert.equal(await dialog.getByRole('alert').count(), 0, 'Setup check reported a backend or persistence failure.');
  const rows = await dialog.locator('li[data-check]').evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute('data-check'), status: element.getAttribute('data-status'), detail: element.textContent,
  })));
  assert.deepEqual(rows.map(row => row.id), ids, 'Self-check must show all six checks.');
  const expected = {
    opens: 'pass', screen: 'skipped', mic: 'skipped', camera: 'skipped',
    claude: status.claude.ok ? 'pass' : 'fail',
    transcription: status.transcription.available ? 'pass' : 'fail',
  };
  for (const row of rows) {
    assert.equal(row.status, expected[row.id], `Self-check misreported ${row.id}.`);
    assert.ok(row.detail.trim().length > 8, `Self-check has no plain-language result for ${row.id}.`);
  }
  const saved = await page.evaluate(() => window.roughCut.supportStatus());
  const savedChecks = Array.isArray(saved.selfCheck) ? saved.selfCheck : saved.selfCheck?.checks;
  assert.deepEqual(savedChecks?.map(({ id, status }) => ({ id, status })), rows.map(({ id, status }) => ({ id, status })),
    'Displayed self-check results were not persisted.');
  await screenshot(app, page, join(outDir, 'mac-self-check.png'));

  await dialog.getByRole('button', { name: 'Save report zip', exact: true }).click();
  const contents = dialog.getByRole('region', { name: 'Problem report contents', exact: true });
  await contents.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await dialog.getByRole('alert').count(), 0, 'Problem report could not be created.');
  const names = await contents.locator('li').allTextContents();
  assert.deepEqual([...names].sort(), files, 'Report contents list is incomplete or contains unexpected private files.');
  const zipName = (await contents.locator('span').first().textContent()).trim();
  assert.match(zipName, /^[^/\\]+\.zip$/, 'Report does not identify its Desktop zip.');
  const zip = join(runtime.desktop, zipName);
  assert.deepEqual(unzip(zip, ['-Z1']).trim().split('\n').sort(), files, 'Displayed report contents differ from the zip.');
  unzip(zip, ['-t']);
  const texts = Object.fromEntries(files.map(name => {
    const result = spawnSync('unzip', ['-p', zip, name], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, `Could not read ${name} from the report.`);
    return [name, result.stdout];
  }));
  const text = Object.values(texts).join('\n');
  assert.ok(!text.includes(runtime.home), 'Report leaked the home-folder path.');
  assert.ok(!/(?:sk-ant-|sk-proj-|ghp_)[A-Za-z0-9_-]{12,}|Bearer\s+(?!\[)[A-Za-z0-9_.-]{12,}/i.test(text), 'Report contains a recognizable credential.');
  const summary = JSON.parse(texts['summary.json']);
  const checks = JSON.parse(texts['self-check.json']);
  assert.deepEqual(checks.checks.map(({ id, status }) => ({ id, status })), rows.map(({ id, status }) => ({ id, status })),
    'Report zip does not contain the displayed self-check results.');
  assert.deepEqual(summary.selfCheck, checks, 'Report summary and self-check results disagree.');
  await screenshot(app, page, join(outDir, 'mac-report-contents.png'));
  await dialog.getByRole('button', { name: 'Close Mac self-check', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  console.info(`MAC SELF-CHECK PASSED: app, status observations, truthful setup-only results, persistence, private zip and contents UI; screen: ${screenCapture}; physical microphone/camera and live Claude requests were not tested.`);
}
