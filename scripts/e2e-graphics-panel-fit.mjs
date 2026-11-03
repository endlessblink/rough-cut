// Real-app gate: the Graphics side panel fits its width (Noam 2026-10-20 "נחתך": with a
// graphic selected, the subscription text, buttons, the Create/Edit/Style tabs, the graphic
// rows and the fields ran past the panel's right edge).
// Opens a temporary copy of a real project that has graphics, in an isolated instance (own
// profile), selects a graphic, and checks every tab at three window sizes: nothing inside
// the panel may reach past its visible edge, and the panel must not scroll sideways.
// Screenshots go to the output folder.
// Usage: xvfb-run -a node scripts/e2e-graphics-panel-fit.mjs <project-with-graphics.roughcut>
import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
if (!process.argv[2]) throw new Error('Usage: node scripts/e2e-graphics-panel-fit.mjs <project.roughcut>');
const sourcePath = resolve(process.argv[2]);
const outputRoot = process.env.ROUGH_CUT_E2E_OUTPUT || mkdtempSync(join(tmpdir(), 'rough-cut-graphics-fit-'));
const fixturePath = join(outputRoot, 'graphics-fit-fixture.roughcut');
const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
for (const asset of raw.assets) {
  if (typeof asset.filePath === 'string' && !isAbsolute(asset.filePath)) asset.filePath = join(dirname(sourcePath), asset.filePath);
}
writeFileSync(fixturePath, JSON.stringify(raw));

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch { return loadSharedPlaywright(); }
}
const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

const overflow = (page) => page.evaluate(() => {
  const pane = document.querySelector('[data-graphics-tabs]')?.closest('aside');
  if (!pane) return { error: 'no graphics pane' };
  const box = pane.getBoundingClientRect();
  const out = [...pane.querySelectorAll('*')]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0 && (rect.right > box.right + 1 || rect.left < box.left - 1))
    .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} ${Math.round(rect.left)}-${Math.round(rect.right)}`);
  return { pane: [Math.round(box.left), Math.round(box.right)], scrollWidth: pane.scrollWidth, clientWidth: pane.clientWidth, count: out.length, first: out.slice(0, 6) };
});

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
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1280',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '900',
  },
});
try {
  const page = await app.firstWindow();
  await page.waitForTimeout(2500);
  const openEditorButton = page.locator('[data-open-editor="pre-record"]');
  if (await openEditorButton.count()) await openEditorButton.click();
  await page.waitForSelector('.clipBar', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.locator('button', { hasText: /^Graphics$/ }).last().click();
  await page.waitForSelector('[data-graphics-tabs]', { timeout: 10000 });
  // Select a graphic: the state the clipping showed up in.
  await page.locator('[data-graphics-tabs] [role="tab"]').nth(1).click();
  await page.waitForTimeout(400);
  await page.locator('[data-graphics-list] .graphicsListItem').nth(1).click();
  await page.waitForTimeout(600);
  check('a graphic is selected', (await page.locator('[data-graphics-order="front"]').count()) === 1, {});

  for (const [width, height] of [[1280, 900], [1000, 800], [1920, 1080]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]?.setContentSize(size[0], size[1]), [width, height]);
    await page.waitForTimeout(800);
    for (const [index, tab] of ['create', 'edit', 'style'].entries()) {
      await page.locator('[data-graphics-tabs] [role="tab"]').nth(index).click();
      await page.waitForTimeout(400);
      const result = await overflow(page);
      check(`${width}px window, ${tab} tab: everything inside the panel`, !result.error && result.count === 0 && result.scrollWidth <= result.clientWidth + 1, result);
      await page.screenshot({ path: join(outputRoot, `${width}-${tab}.png`) });
    }
  }
} finally {
  await app.close().catch(() => undefined);
}
console.log(`output: ${outputRoot}`);
if (failures.length) { console.error(`FAILED (${failures.length})`); process.exit(1); }
