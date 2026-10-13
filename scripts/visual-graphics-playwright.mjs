// Graphics feature, end to end on the packaged app with a real project.
//
// Copies the project (the original is never written), adds one saved lower
// third, then drives the app: open the Graphics tab, generate a title card
// through a stand-in Claude CLI (no network), edit a field, drag the block,
// delete it and undo. Screenshots every state and writes a report.
//
// Usage: node scripts/visual-graphics-playwright.mjs <real-project.roughcut>
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { canonicalizeProjectDocument } from '../packages/project-model/dist/index.js';
import { addGraphic } from '../apps/desktop/src/shared/motion-graphics.mjs';

const root = process.cwd();
const sourceProject = resolve(process.argv[2] || process.env.ROUGH_CUT_REAL_PROJECT_PATH || '');
if (!sourceProject || !existsSync(sourceProject)) throw new Error('Usage: node scripts/visual-graphics-playwright.mjs <real-project.roughcut>');
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
if (!existsSync(join(artifactRoot, 'dock-launch.sh'))) throw new Error('The packaged app is missing; run pnpm package:linux first.');

const out = process.env.ROUGH_CUT_GRAPHICS_E2E_OUTPUT || join('/tmp', `rough-cut-graphics-e2e-${Date.now()}`);
mkdirSync(out, { recursive: true });
const projectPath = join(out, 'project.roughcut');
const recordPath = join(out, 'fake-claude-call.json');

// Scratch copy with absolute media paths and one saved lower third.
const raw = JSON.parse(readFileSync(sourceProject, 'utf8'));
raw.assets = raw.assets.map((asset) => ({ ...asset, filePath: resolve(dirname(sourceProject), asset.filePath) }));
const document = addGraphic(canonicalizeProjectDocument(raw), {
  id: 'saved',
  title: 'Lower third',
  html: `<style>.lt{position:absolute;left:96px;bottom:150px;padding:22px 34px;border-radius:14px;background:var(--rc-bg,#1f6feb);color:#fff;font:700 54px Heebo,sans-serif;animation:in .6s both}@keyframes in{from{opacity:0;transform:translateX(-60px)}}</style><div class="lt" dir="rtl" data-rc-field="name">נועם נאומובסקי</div>`,
  fields: [{ key: 'name', label: 'Name', type: 'text', value: 'נועם נאומובסקי' }, { key: 'bg', label: 'Background', type: 'color', value: '#1f6feb' }],
  startFrame: 0,
  endFrame: 120,
  timelineFrames: 100000,
});
writeFileSync(projectPath, `${JSON.stringify(document, null, 2)}\n`);

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
    chromiumSandbox: true,
  executablePath: join(artifactRoot, 'dock-launch.sh'),
  args: ['--enable-sandbox', '--force-color-profile=srgb', `--user-data-dir=${join(out, 'user-data')}`, join(artifactRoot, 'resources', 'app')],
  env: {
    ...process.env,
    ROUGH_CUT_DOCK_LAUNCH: '1',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1100',
    ROUGH_CUT_CLAUDE_BIN: join(root, 'scripts', 'fixtures', 'fake-claude', 'claude.cjs'),
    ROUGH_CUT_FAKE_CLAUDE_RECORD: recordPath,
  },
});

const report = { projectPath, out, steps: {} };
const step = (name, ok, detail = {}) => { report.steps[name] = { ok, ...detail }; };
try {
  const page = await app.firstWindow();
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 30000 });
  await page.waitForSelector('canvas.styledPreviewCanvas', { timeout: 30000 });
  await page.locator('.toolRail button[aria-label="Graphics"]').click();
  await page.waitForSelector('[data-graphics-panel="true"]');
  const blocks = () => page.locator('.graphicsLane .graphicRegion');
  step('opens with the saved graphic', (await blocks().count()) === 1);

  // The saved lower third fades and slides in over its first 0.6 s, so the
  // preview must look different a moment in than once it has landed.
  const stage = await page.locator('canvas.styledPreviewCanvas').boundingBox();
  const clip = { x: stage.x, y: stage.y + stage.height * 0.55, width: stage.width * 0.5, height: stage.height * 0.4 };
  await page.locator('input.timelineScrubber').fill('0.1');
  await page.waitForTimeout(900);
  const early = join(out, 'anim-early.png');
  await page.screenshot({ path: early, clip, timeout: 10000 }).catch(() => undefined);
  await page.locator('input.timelineScrubber').fill('1.5');
  await page.waitForTimeout(900);
  const landed = join(out, 'anim-landed.png');
  await page.screenshot({ path: landed, clip, timeout: 10000 }).catch(() => undefined);
  const diff = spawnSync('compare', ['-metric', 'AE', '-fuzz', '8%', early, landed, 'null:'], { encoding: 'utf8' });
  const changedPixels = Number(String(diff.stderr).trim().split(/\s/)[0]);
  step('the graphic animates in the preview', Number.isFinite(changedPixels) && changedPixels > 2000, { changedPixels });
  await snap(page, join(out, '0-saved-lower-third.png'));

  await page.locator('[data-graphics-request="true"]').fill('Title card: Fixing the compressor, top right, at 0:06');
  await page.locator('[data-graphics-generate="true"]').click();
  await page.waitForSelector('.graphicsWorking', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('.graphicsLane .graphicRegion').length === 2, null, { timeout: 20000 });
  const newBlock = page.locator('.graphicsLane .graphicRegion', { hasText: 'Title card' });
  const newLabel = await newBlock.getAttribute('aria-label');
  step('generate adds a block at the requested time', /0:06 to 0:09/.test(newLabel ?? ''), { newLabel });
  const call = JSON.parse(readFileSync(recordPath, 'utf8'));
  step('claude is called one-shot with no tools', call.argv.includes('-p') && call.argv.includes('--restricted') && call.argv[call.argv.indexOf('--tools') + 1] === '');

  await page.locator('input.timelineScrubber').fill('7');
  await page.waitForTimeout(1200);
  step('the new graphic is selected and shows its fields', (await page.locator('input[data-graphic-field="headline"]').count()) === 1);
  await page.locator('input[data-graphic-field="headline"]').fill('Compressor fixed ✓');
  await page.locator('input[data-graphic-field="headline"]').press('Enter');
  await page.waitForTimeout(1200);
  await snap(page, join(out, '1-title-card-edited.png'));
  const saved = JSON.parse(readFileSync(projectPath, 'utf8'));
  const savedField = saved.timeline.effects.find((e) => e.kind === 'graphic' && e.params.title === 'Title card')?.params.fields.find((f) => f.key === 'headline')?.value;
  step('field edit is saved to the project', savedField === 'Compressor fixed ✓', { savedField });

  const box = await newBlock.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const movedLabel = await newBlock.getAttribute('aria-label');
  const span = (label) => {
    const [, a, b] = String(label).match(/(\d+:\d{2}) to (\d+:\d{2})/) ?? [];
    const sec = (value) => { const [m, s2] = value.split(':').map(Number); return m * 60 + s2; };
    return a && b ? sec(b) - sec(a) : null;
  };
  step('dragging the block moves it and keeps its length', movedLabel !== newLabel && span(movedLabel) === span(newLabel), { newLabel, movedLabel });
  step('dragging does not duplicate it', (await blocks().count()) === 2, { blocks: await blocks().count() });

  // Delete: the × when the block is wide enough to show it (a real pointer
  // click, as a person would), otherwise the Delete key on the focused block.
  const deleteBox = await newBlock.locator('.graphicRegionDelete').boundingBox();
  if (deleteBox) {
    await page.mouse.move(deleteBox.x + deleteBox.width / 2, deleteBox.y + deleteBox.height / 2);
    await page.waitForTimeout(200);
    await page.mouse.click(deleteBox.x + deleteBox.width / 2, deleteBox.y + deleteBox.height / 2);
  } else {
    await newBlock.focus();
    await page.keyboard.press('Delete');
  }
  await page.waitForTimeout(600);
  const afterDelete = await blocks().count();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1200);
  const afterUndo = await blocks().count();
  step('delete removes it and undo brings it back', afterDelete === 1 && afterUndo === 2, { afterDelete, afterUndo });

  const sandbox = await page.locator('iframe.graphicFrame').first().getAttribute('sandbox');
  step('graphic frames are sandboxed (scripts only)', sandbox === 'allow-scripts', { sandbox });
} catch (error) {
  report.error = String(error?.stack ?? error);
} finally {
  report.ok = !report.error && Object.values(report.steps).every((s) => s.ok);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await app.close().catch(() => undefined);
  if (!report.ok) process.exitCode = 1;
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return loadSharedPlaywright();
}

// Screenshots are evidence, not assertions: the packaged app's page.screenshot
// occasionally stalls, and that must not hide the interaction results.
async function snap(page, path) {
  await page.screenshot({ path, timeout: 10000 }).catch((error) => {
    report.screenshotWarnings = [...(report.screenshotWarnings ?? []), `${path}: ${error.message.split('\n')[0]}`];
  });
}
