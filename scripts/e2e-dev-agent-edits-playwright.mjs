// Real-app gate for taking an agent's edits into Noam's project (Dev menu > Agent edits).
//
// On a temporary copy of a real project (never the original):
//  1. an "agent" edits its copy through the real rough-cut MCP: a cut, a voice-over,
//     captions off
//  2. the app (dev switch on) lists those three edits in plain words
//  3. two are ticked and taken in: the cut and the voice-over land in Noam's project,
//     captions stay as they were; the list keeps only the unticked one
//  4. one undo takes both back; Skip clears the last one from the list
// Screenshots go to the output folder for a visual review.
// Usage: xvfb-run -a node scripts/e2e-dev-agent-edits-playwright.mjs <project.roughcut>
// Needs a built renderer (pnpm --filter @rough-cut/desktop build).
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/e2e-dev-agent-edits-playwright.mjs <project.roughcut>');
const sourcePath = resolve(process.argv[2]);
const outputRoot = process.env.ROUGH_CUT_E2E_OUTPUT || mkdtempSync(join(tmpdir(), 'rough-cut-dev-agent-edits-'));
const fixturePath = join(outputRoot, 'agent-edits-fixture.roughcut');
const voicePath = join(outputRoot, 'agent-voice.m4a');

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { return loadSharedPlaywright(); }
}

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
for (const asset of raw.assets) {
  if (typeof asset.filePath === 'string' && !isAbsolute(asset.filePath)) asset.filePath = join(dirname(sourcePath), asset.filePath);
}
writeFileSync(fixturePath, JSON.stringify(raw));
const made = spawnSync(process.env.ROUGH_CUT_FIXTURE_FFMPEG ?? 'ffmpeg-safe', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=700:sample_rate=48000', '-t', '2', '-c:a', 'aac', voicePath], { encoding: 'utf8' });
if (made.status !== 0) throw new Error(made.stderr);
const disk = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
const journal = () => JSON.parse(readFileSync(fixturePath.replace(/\.roughcut$/, '.claude-edit.roughcut.edits.json'), 'utf8'));

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

// 1. The agent's side, through the real MCP server.
await new Promise((resolveAgent, rejectAgent) => {
  const server = spawn(process.execPath, [join(root, 'scripts/mcp/rough-cut-mcp.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const calls = [
    ['initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } }],
    ['tools/call', { name: 'make_edit_copy', arguments: { project_path: fixturePath } }],
    ['tools/call', { name: 'apply_edit', arguments: { project_path: fixturePath, op: 'cut_range', startSec: 10, endSec: 12 } }],
    ['tools/call', { name: 'apply_edit', arguments: { project_path: fixturePath, op: 'add_voice_over', file: voicePath, atSec: 20, mode: 'replace' } }],
    ['tools/call', { name: 'apply_edit', arguments: { project_path: fixturePath, op: 'set_layout', captions: false } }],
  ];
  let buffer = '';
  let index = 0;
  const next = () => {
    if (index >= calls.length) { server.stdin.end(); server.kill(); resolveAgent(); return; }
    const [method, params] = calls[index];
    index += 1;
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: index, method, params })}\n`);
  };
  server.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
      if (message.error || message.result?.isError) { rejectAgent(new Error(JSON.stringify(message))); server.kill(); return; }
      next();
    }
  });
  next();
});
check('the agent logged three edits', journal().entries.length === 3, journal().entries.map((entry) => entry.label));
const captionsBefore = disk().captions?.enabled;

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: join(root, 'apps/desktop/node_modules/.bin/electron'),
  chromiumSandbox: true,
  args: ['--enable-sandbox', '--mute-audio', `--user-data-dir=${join(outputRoot, 'user-data')}`, '.'],
  cwd: join(root, 'apps/desktop'),
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_DEV_FEATURES: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: fixturePath,
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1080',
  },
});
try {
  const page = await app.firstWindow();
  page.on('console', (message) => { if (message.type() === 'error') console.log('[renderer error]', message.text()); });
  await page.waitForTimeout(2500);
  const openEditorButton = page.locator('[data-open-editor="pre-record"]');
  if (await openEditorButton.count()) await openEditorButton.click();
  await page.waitForSelector('.clipBar', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const sectionsBefore = await page.locator('.clipBar').count();

  // 2. The list.
  await page.locator('.devMenuButton').click();
  await page.waitForTimeout(600);
  await page.locator('[data-agent-edits-open]').click();
  await page.waitForSelector('.devAgentPanel', { timeout: 10000 });
  await page.waitForTimeout(600);
  const labels = await page.locator('.devAgentItem label span').allInnerTexts();
  check('the app lists the agent edits in plain words', labels.length === 3 && labels[0].startsWith('Cut out 0:10.0') && labels[1].startsWith('Voice-over') && labels[2] === 'Captions off', labels);
  await page.screenshot({ path: join(outputRoot, '1-agent-edits-list.png') });

  // 3. Untick captions, take in the other two.
  await page.locator('.devAgentItem').nth(2).locator('input[type="checkbox"]').uncheck();
  await page.locator('[data-agent-edits-apply]').click();
  await page.waitForTimeout(1500);
  const after = disk();
  const voiceTrack = after.timeline.tracks.find((track) => track.id === 'track:voice-over');
  check('the voice-over is now in the project', voiceTrack?.clips.length === 1, voiceTrack?.clips);
  check('the cut is now in the project', (await page.locator('.clipBar').count()) === sectionsBefore + 1, { before: sectionsBefore, after: await page.locator('.clipBar').count() });
  check('captions stay as they were', after.captions?.enabled === captionsBefore, { before: captionsBefore, after: after.captions?.enabled });
  const remaining = await page.locator('.devAgentItem label span').allInnerTexts();
  check('only the unticked edit is still listed', remaining.length === 1 && remaining[0] === 'Captions off', remaining);
  check('the list file marks the two as taken in', journal().entries.filter((entry) => entry.resolved === 'accepted').length === 2, journal().entries.map((entry) => entry.resolved ?? null));
  await page.screenshot({ path: join(outputRoot, '2-after-take-in.png') });

  // 4. One undo takes both back; Skip clears the last.
  await page.locator('.devAgentPanel .devTextButton', { hasText: 'Close' }).click();
  await page.mouse.click(960, 300);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1500);
  const undone = disk();
  check('one undo takes both edits back', !(undone.timeline.tracks.find((track) => track.id === 'track:voice-over')?.clips.length) && (await page.locator('.clipBar').count()) === sectionsBefore, { sections: await page.locator('.clipBar').count() });
  await page.locator('.devMenuButton').click();
  await page.locator('[data-agent-edits-open]').click();
  await page.waitForSelector('.devAgentPanel');
  await page.locator('.devAgentPanel .devTextButton', { hasText: 'Skip' }).click();
  await page.waitForTimeout(800);
  check('Skip clears it from the list', (await page.locator('.devAgentItem').count()) === 0 && journal().entries.every((entry) => entry.resolved), journal().entries.map((entry) => entry.resolved ?? null));
  await page.screenshot({ path: join(outputRoot, '3-list-empty.png') });
} finally {
  await app.close().catch(() => undefined);
}
console.log(`output: ${outputRoot}`);
if (failures.length) { console.error(`FAILED: ${failures.join(', ')}`); process.exit(1); }
