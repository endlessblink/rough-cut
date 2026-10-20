// Real-app gate for live reload of a project changed outside Rough Cut.
//
// Runs the built app on a temporary copy of a real project (never the original),
// then rewrites that copy on disk the way an agent does (temp file + rename):
//  1. nothing pending: the app shows the new version at once, by itself
//  2. the app's next save does not put the old version back
//  3. an edit (split at playhead) landing right after an outside change is not
//     saved over it: the "changed outside" dialog opens; "Load their version"
//     shows theirs, and in a second clash "Keep mine" saves the app's version
// Screenshots go to the output folder for a visual review.
// Usage: xvfb-run -a node scripts/e2e-project-disk-reload.mjs <project.roughcut>
// Needs a built renderer (pnpm --filter @rough-cut/desktop build).
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/e2e-project-disk-reload.mjs <project.roughcut>');
const sourcePath = resolve(process.argv[2]);
const outputRoot = process.env.ROUGH_CUT_E2E_OUTPUT || mkdtempSync(join(tmpdir(), 'rough-cut-disk-reload-'));
const fixturePath = join(outputRoot, 'disk-reload-fixture.roughcut');

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { return loadSharedPlaywright(); }
}

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
for (const asset of raw.assets) {
  if (typeof asset.filePath === 'string' && !isAbsolute(asset.filePath)) asset.filePath = join(dirname(sourcePath), asset.filePath);
}
raw.name = 'Before agent edit';
writeFileSync(fixturePath, JSON.stringify(raw));

const readDisk = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
const clipCount = (doc) => doc.timeline?.tracks?.reduce((sum, track) => sum + track.clips.length, 0) ?? 0;
function agentWrites(name) {
  const doc = readDisk();
  doc.name = name;
  writeFileSync(`${fixturePath}.agent-tmp`, JSON.stringify(doc));
  renameSync(`${fixturePath}.agent-tmp`, fixturePath);
}

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

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
  const shownName = () => page.evaluate(() => document.querySelector('.topBar h1[title], h1[title]')?.getAttribute('title') ?? null);
  check('app shows the project', (await shownName()) === 'Before agent edit', { shown: await shownName() });

  // 1. Outside change, nothing pending.
  agentWrites('Agent edit one');
  await page.waitForTimeout(1500);
  check('outside change shows at once', (await shownName()) === 'Agent edit one', { shown: await shownName() });
  await page.screenshot({ path: join(outputRoot, '1-after-agent-edit.png') });

  // 2. The app's next save keeps the agent's change.
  await page.mouse.click(960, 300);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('s');
  await page.waitForTimeout(1200);
  const afterSplit = readDisk();
  check('app save after reload keeps the agent change', afterSplit.name === 'Agent edit one', { name: afterSplit.name });
  check('the split was saved', clipCount(afterSplit) > clipCount(raw), { before: clipCount(raw), after: clipCount(afterSplit) });
  const dialog = page.locator('[data-disk-change-dialog]');
  check('no dialog without a clash', (await dialog.count()) === 0, {});

  // 3a. Clash: an edit lands right after an outside change -> dialog; load theirs.
  agentWrites('Agent edit two');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('s');
  await page.waitForTimeout(800);
  check('a clashing edit opens the dialog', (await dialog.count()) === 1, {});
  check('the clashing edit did not overwrite the outside change', readDisk().name === 'Agent edit two', { name: readDisk().name });
  await page.screenshot({ path: join(outputRoot, '2-changed-outside-dialog.png') });
  if (await dialog.count()) {
    await page.locator('[data-disk-change="reload"]').click();
    await page.waitForTimeout(1000);
    check('Load their version shows theirs', (await shownName()) === 'Agent edit two' && (await dialog.count()) === 0, { shown: await shownName() });
  }

  // 3b. Clash again; keep mine.
  agentWrites('Agent edit three');
  const clipsBefore = clipCount(readDisk());
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('s');
  await page.waitForTimeout(800);
  if (await dialog.count()) {
    await page.locator('[data-disk-change="keep"]').click();
    await page.waitForTimeout(1000);
    const kept = readDisk();
    check('Keep mine saves the app version over theirs', kept.name === 'Agent edit two' && clipCount(kept) > clipsBefore, { name: kept.name, clips: clipCount(kept), clipsBefore });
    check('dialog closes after Keep mine', (await dialog.count()) === 0, {});
  } else {
    check('second clash opens the dialog', false, {});
  }

  // 4. Autosave never puts an old version back.
  agentWrites('Agent edit four');
  await page.waitForTimeout(1500);
  check('app follows the next outside change too', (await shownName()) === 'Agent edit four', { shown: await shownName() });
  await page.screenshot({ path: join(outputRoot, '3-final.png') });
} finally {
  await app.close().catch(() => undefined);
}
console.log(`output: ${outputRoot}`);
if (failures.length) { console.error(`FAILED: ${failures.join(', ')}`); process.exit(1); }
