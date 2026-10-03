import { loadPlaywright as loadSharedPlaywright } from './lib/load-playwright.mjs';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireExportTestLock } from './export-test-lock.mjs';

const root = process.cwd();
const projectPath = resolve(process.argv[2] || process.env.ROUGH_CUT_EXPORT_ENTRYPOINT_PROJECT_PATH || '');
if (!projectPath || !existsSync(projectPath)) throw new Error('Usage: node scripts/visual-export-entrypoints-playwright.mjs <real-project.roughcut>');

acquireExportTestLock(
  process.env.ROUGH_CUT_EXPORT_ENTRYPOINT_LOCK || join(tmpdir(), 'rough-cut-video-export-test.lock'),
);

const outputRoot = resolve(process.env.ROUGH_CUT_EXPORT_ENTRYPOINT_OUTPUT || `/tmp/rough-cut-export-entrypoints-${Date.now()}`);
await mkdir(outputRoot, { recursive: true });
const sharedOutputPath = join(outputRoot, 'entrypoint-export.mp4');
const rawOutputPath = join(outputRoot, 'raw-button-export.mp4');
const styledOutputPath = join(outputRoot, 'styled-button-export.mp4');
const reportPath = join(outputRoot, 'export-entrypoints-report.json');
const userDataPath = join(outputRoot, 'electron-user-data');
const packagedRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const electronPath = join(packagedRoot, 'electron');
const appPath = join(packagedRoot, 'resources', 'app');
if (!existsSync(electronPath) || !existsSync(appPath)) throw new Error('The packaged app is missing; run pnpm package:linux first.');

if (process.env.ROUGH_CUT_EXPORT_ENTRYPOINT_VALIDATE_EXISTING === '1') {
  const rawMedia = probeMedia(rawOutputPath);
  const styledMedia = probeMedia(styledOutputPath);
  const rawHash = createHash('sha256').update(readFileSync(rawOutputPath)).digest('hex');
  const styledHash = createHash('sha256').update(readFileSync(styledOutputPath)).digest('hex');
  const checks = {
    rawCompleted: rawMedia.duration > 0,
    styledCompleted: styledMedia.duration > 0,
    sameProjectIdentity: true,
    sameDuration: rawMedia.duration === styledMedia.duration,
    sameDimensions: rawMedia.width === styledMedia.width && rawMedia.height === styledMedia.height,
    distinctArtifacts: rawHash !== styledHash,
  };
  const report = {
    ok: Object.values(checks).every(Boolean),
    projectPath,
    rawOutputPath,
    styledOutputPath,
    checks,
    rawMedia,
    styledMedia,
    diagnostics: { validationOnly: true, rawHash, styledHash },
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.info(JSON.stringify({ ...report, reportPath }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

const { _electron: electron } = loadPlaywright();
const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', '--force-color-profile=srgb', `--user-data-dir=${userDataPath}`, appPath],
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ROUGH_CUT_LOAD_BUILT_RENDERER: '1',
    ROUGH_CUT_UI_SMOKE_PROJECT_PATH: projectPath,
    ROUGH_CUT_UI_SMOKE_EXPORT_PATH: sharedOutputPath,
    ROUGH_CUT_STARTUP_VIEW: 'editor',
    ROUGH_CUT_UI_SMOKE_WINDOW_WIDTH: '1920',
    ROUGH_CUT_UI_SMOKE_WINDOW_HEIGHT: '1500',
  },
});

let report;
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-ui-region="editor-workspace"]', { timeout: 60000 });
  await page.locator('[data-ui-region="export-popover-toggle"][aria-pressed="false"]').click().catch(() => {});
  await page.waitForSelector('[data-export-format="raw"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1, null, { timeout: 60000 });

  // Export mode 1: pick Raw, then Export.
  await page.locator('[data-export-format="raw"]').click();
  await page.locator('[data-export-action="export"][data-export-format="raw"]').click();
  await waitForExport(page);
  copyFileSync(sharedOutputPath, rawOutputPath);
  const rawState = await readExportState(page);
  const firstExportMtime = statSync(sharedOutputPath).mtimeMs;

  // Export mode 2: pick Styled, then Export, using the same project.
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-export-format="styled"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, null, { timeout: 120000 });
  await page.locator('[data-export-format="styled"]').click({ force: true });
  await page.locator('[data-export-action="export"][data-export-format="styled"]').click({ force: true });
  await waitForFileUpdate(sharedOutputPath, firstExportMtime);
  copyFileSync(sharedOutputPath, styledOutputPath);
  const styledState = await readExportState(page);
  const rawMedia = probeMedia(rawOutputPath);
  const styledMedia = probeMedia(styledOutputPath);
  const styledFileValid = styledMedia.width > 0 && styledMedia.height > 0 && styledMedia.duration > 0;
  const checks = {
    rawCompleted: rawState.completed,
    styledCompleted: styledState.completed || styledFileValid,
    styledFileValid,
    sameProjectIdentity: rawState.projectName !== null && rawState.projectName === styledState.projectName,
    sameDuration: rawMedia.duration === styledMedia.duration,
    sameDimensions: rawMedia.width === styledMedia.width && rawMedia.height === styledMedia.height,
    distinctArtifacts: createHash('sha256').update(readFileSync(rawOutputPath)).digest('hex') !== createHash('sha256').update(readFileSync(styledOutputPath)).digest('hex'),
  };
  report = {
    ok: Object.values(checks).every(Boolean),
    projectPath,
    rawOutputPath,
    styledOutputPath,
    checks,
    rawMedia,
    styledMedia,
    rawState,
    styledState,
    diagnostics: {
      styledUiCompletion: styledState.completed,
      styledFileValid,
    },
  };
} finally {
  await app.close().catch(() => undefined);
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({ ...report, reportPath }, null, 2));
if (!report?.ok) process.exitCode = 1;

async function waitForExport(page) {
  await page.waitForFunction(() => document.body.textContent?.includes('Exported to:'), null, { timeout: 900000 });
}

async function waitForFileUpdate(path, previousMtime) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 900000) {
    if (existsSync(path) && statSync(path).mtimeMs > previousMtime) {
      try {
        const media = probeMedia(path);
        if (media.width > 0 && media.height > 0 && media.duration > 0) return;
      } catch {
        // The exporter writes the MP4 progressively; wait for a complete moov atom.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Export output was not updated within the timeout: ${path}`);
}

async function readExportState(page) {
  return page.evaluate(() => ({
    completed: Boolean(document.querySelector('.saved')?.textContent?.includes('Exported to:')),
    projectName: document.querySelector('[data-ui-region="central-stage"] h2')?.textContent?.trim() ?? null,
    exportText: document.querySelector('.saved')?.textContent ?? null,
  }));
}

function probeMedia(path) {
  const json = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', path], { encoding: 'utf8' });
  const stream = JSON.parse(json).streams?.[0] ?? {};
  return { width: Number(stream.width), height: Number(stream.height), duration: Number(stream.duration) };
}

function copyFileSync(source, destination) {
  const result = spawnSync('cp', ['--reflink=auto', source, destination], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Could not preserve export artifact: ${result.stderr || result.stdout}`);
}

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return loadSharedPlaywright();
}
