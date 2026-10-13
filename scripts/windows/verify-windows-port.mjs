// Completion gate for the Windows port. See docs/WINDOWS-PORT-GOAL.md.
//
//   node scripts/windows/verify-windows-port.mjs              run everything
//   node scripts/windows/verify-windows-port.mjs --quick      skip build/typecheck/test suite (prints PARTIAL, never PASSED)
//   node scripts/windows/verify-windows-port.mjs confirm <key> "<note>"   record user evidence (interactive terminal only)
//
// Exit 0 and the line "GATE PASSED" appear only when every automated check passes AND every
// hardware/visual check has evidence recorded by the user. Anything else exits non-zero.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..', '..');
const evidencePath = join(root, '.git', 'windows-port-evidence.json');

// Checks that need real hardware or a person looking. The user records each one; Claude cannot.
export const EVIDENCE_KEYS = {
  'record-all-sources': 'Recorded 60 s with display + mic + system audio + camera; all play back, camera in sync, system audio audible.',
  'scaled-display': 'Recorded on a display scaled to 125% or more; the recorded area matches what was on screen.',
  'cursor-click-sync': 'Cursor and click flashes land within 1 frame of the video in the editor; auto-zoom suggestions came from real clicks.',
  'region-and-second-monitor': 'Region capture and a second monitor record the correct area.',
  'editor-pass': 'Trim, zoom, camera layout, censor and (if the CLI is installed) Claude graphics work on a Windows recording.',
  'export-playable': 'Exported MP4 plays with picture and audio in a stock Windows player.',
  'no-orphan-ffmpeg': 'After Stop, Cancel and quitting mid-recording there is no leftover ffmpeg.exe in Task Manager.',
  'crash-recovery': 'After force-killing the app mid-recording the take is recoverable.',
  'installer-clean-machine': 'Installer or portable build ran on a machine with no Node, pnpm or ffmpeg and passed the steps above.',
};

export function validateEvidence(data, keys = Object.keys(EVIDENCE_KEYS)) {
  const missing = [];
  for (const key of keys) {
    const entry = data?.[key];
    const ok = entry && entry.status === 'passed' && entry.confirmedBy === 'user' && typeof entry.confirmedAt === 'string' && typeof entry.note === 'string' && entry.note.trim().length >= 5;
    if (!ok) missing.push(key);
  }
  return { ok: missing.length === 0, missing };
}

export function parseTestSummary(text) {
  const num = (name) => {
    const match = new RegExp(`^ℹ ${name} (\\d+)`, 'm').exec(text);
    return match ? Number(match[1]) : null;
  };
  return { tests: num('tests'), pass: num('pass'), fail: num('fail'), skipped: num('skipped') };
}

export function parseFfmpegCapabilities(encodersText, devicesText, bannerText) {
  return {
    libx264: /\blibx264\b/.test(encodersText),
    gdigrab: /\bgdigrab\b/.test(devicesText),
    dshow: /\bdshow\b/.test(devicesText),
    ddagrab: /ddagrab/.test(bannerText),
  };
}

// ---------------------------------------------------------------------------------------------

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
}

function pnpmCommand() {
  return run('pnpm', ['--version'], { shell: true }).status === 0 ? ['pnpm'] : ['npx', '-y', 'pnpm@9.15.0'];
}

function runStreaming(command, args, cwd, extraEnv = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd, shell: true, windowsHide: true, env: { ...process.env, ...extraEnv } });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => resolveRun({ code, out }));
  });
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -  ${detail}` : ''}\n`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'confirm') return confirm(args[1], args.slice(2).join(' '));

  const quick = args.includes('--quick');

  record('runs on Windows', process.platform === 'win32', process.platform);

  record('LF line endings pinned (.gitattributes)', /eol=lf/.test(existsSync(join(root, '.gitattributes')) ? readFileSync(join(root, '.gitattributes'), 'utf8') : ''));

  // --- FFmpeg capabilities the port depends on
  const ffmpeg = run('ffmpeg', ['-hide_banner', '-version']);
  record('ffmpeg on PATH', ffmpeg.status === 0, (ffmpeg.stdout ?? '').split('\n')[0]);
  const ffprobe = run('ffprobe', ['-hide_banner', '-version']);
  record('ffprobe on PATH', ffprobe.status === 0);
  if (ffmpeg.status === 0) {
    const caps = parseFfmpegCapabilities(
      run('ffmpeg', ['-hide_banner', '-encoders']).stdout ?? '',
      run('ffmpeg', ['-hide_banner', '-devices']).stdout ?? '',
      run('ffmpeg', ['-hide_banner', '-filters']).stdout ?? '',
    );
    record('ffmpeg has libx264, gdigrab and dshow', caps.libx264 && caps.gdigrab && caps.dshow, JSON.stringify(caps));
  }

  // --- A real capture through the app's own argument builder, stopped the way the app stops it.
  await liveCaptureCheck();

  // --- The whole recording pipeline through the real session: capture, stop, remux, project, raw + styled export.
  const smoke = await runStreaming('node', [join('scripts', 'windows', 'smoke-windows-recording.mjs')], root);
  record('recording pipeline smoke (capture, remux, project, raw + styled export)', smoke.code === 0 && /"ok":true/.test(smoke.out), smoke.code === 0 ? '' : smoke.out.trim().split('\n').slice(-2).join(' | ').slice(0, 200));

  // --- Real devices: mic + system audio (a tone is played) + camera, through the real session and a styled export.
  const hardware = await runStreaming('node', [join('scripts', 'windows', 'smoke-windows-recording.mjs')], root, { ROUGH_CUT_WIN_SMOKE_SOURCES: 'all', ROUGH_CUT_WIN_SMOKE_MS: '5000' });
  record('all-sources recording smoke (mic + system audio + camera, tone audible, camera linked)', hardware.code === 0 && /"allSources":true/.test(hardware.out) && /"ok":true/.test(hardware.out), hardware.code === 0 ? '' : hardware.out.trim().split('
').filter((l) => /FAILED|needs a mic/.test(l)).slice(-1)[0]?.slice(0, 220) ?? 'see output');

  // --- Structure
  const ci = existsSync(join(root, '.github/workflows/ci.yml')) ? readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8') : '';
  record('CI runs on windows-latest', /windows-latest/.test(ci));
  record('Windows packaging script exists', existsSync(join(root, 'scripts', 'package-windows.mjs')));
  const packaged = findPackagedApp();
  record('packaged app contains Rough Cut.exe + ffmpeg.exe + ffprobe.exe', packaged.ok, packaged.detail);
  record('Windows click/key telemetry is the real hook (uiohook), not a stub', clickListenerIsReal());

  // --- The expensive, authoritative checks
  if (quick) {
    process.stdout.write('SKIP  build, typecheck and desktop test suite (--quick)\n');
  } else {
    const pnpm = pnpmCommand();
    const build = await runStreaming(pnpm[0], [...pnpm.slice(1), 'build'], root);
    record('pnpm build', build.code === 0);
    const typecheck = await runStreaming(pnpm[0], [...pnpm.slice(1), 'typecheck'], root);
    record('pnpm typecheck', typecheck.code === 0);
    const suite = await runStreaming(pnpm[0], [...pnpm.slice(1), '--filter', '@rough-cut/desktop', 'test'], root);
    const summary = parseTestSummary(suite.out);
    record('desktop test suite has zero failures', suite.code === 0 && summary.fail === 0 && summary.tests > 0, JSON.stringify(summary));
  }

  // --- Evidence from the user
  let evidence = {};
  try { evidence = JSON.parse(readFileSync(evidencePath, 'utf8')); } catch { /* none yet */ }
  const verdict = validateEvidence(evidence);
  for (const [key, description] of Object.entries(EVIDENCE_KEYS)) {
    record(`user evidence: ${key}`, !verdict.missing.includes(key), verdict.missing.includes(key) ? description : '');
  }

  const failed = results.filter((r) => !r.ok);
  process.stdout.write('\n');
  if (failed.length === 0 && !quick) {
    process.stdout.write('GATE PASSED\n');
    process.exit(0);
  }
  process.stdout.write(quick && failed.length === 0 ? 'GATE PARTIAL (quick run cannot pass)\n' : `GATE NOT PASSED: ${failed.length} of ${results.length} checks outstanding\n`);
  for (const r of failed) process.stdout.write(`  - ${r.name}${r.detail ? ` (${r.detail})` : ''}\n`);
  process.exit(1);
}

async function liveCaptureCheck() {
  if (process.platform !== 'win32' || run('ffmpeg', ['-version']).status !== 0) {
    record('live gdigrab capture stops cleanly and ffprobe validates it', false, 'needs Windows + ffmpeg');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'rough-cut-gate-'));
  const out = join(dir, 'capture.mkv');
  try {
    const { screenInputArgs } = await import(pathToFileURL(join(root, 'apps/desktop/src/main/recording/platform-capture.mjs')).href);
    const ffArgs = ['-y', ...screenInputArgs({ fps: 30, width: 320, height: 240, display: 'desktop+0,0', platform: 'win32' }), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out];
    const child = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    await new Promise((r) => setTimeout(r, 3000));
    child.stdin.write('q\n');
    child.stdin.end();
    const exit = await Promise.race([
      new Promise((r) => child.on('close', (code) => r({ code }))),
      new Promise((r) => setTimeout(() => r({ timeout: true }), 15000)),
    ]);
    if (exit.timeout) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      record('live gdigrab capture stops cleanly and ffprobe validates it', false, 'ffmpeg did not exit after q');
      return;
    }
    const probe = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', out]);
    let info = null;
    try { info = JSON.parse(probe.stdout); } catch { /* invalid */ }
    const duration = Number(info?.format?.duration);
    const ok = exit.code === 0 && info?.streams?.[0]?.codec_name === 'h264' && duration > 1.5;
    record('live gdigrab capture stops cleanly and ffprobe validates it', ok, ok ? `${duration.toFixed(1)} s h264` : `exit ${exit.code}; ${stderr.trim().split('\n').slice(-2).join(' | ')}`);
  } catch (err) {
    record('live gdigrab capture stops cleanly and ffprobe validates it', false, err instanceof Error ? err.message : String(err));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function findPackagedApp() {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) return { ok: false, detail: 'no dist/ directory; run the Windows packaging script' };
  const candidates = readdirSync(dist).filter((name) => /win/i.test(name)).map((name) => join(dist, name)).filter((p) => statSync(p).isDirectory());
  for (const dir of candidates) {
    const has = (...parts) => existsSync(join(dir, ...parts));
    if (has('Rough Cut.exe') && has('resources', 'bin', 'ffmpeg.exe') && has('resources', 'bin', 'ffprobe.exe')) return { ok: true, detail: dir };
  }
  return { ok: false, detail: candidates.length ? 'incomplete package' : 'no dist/*win* package found' };
}

// The Windows click/key listener must be the real hook, wired as the default, with the stub deleted.
function clickListenerIsReal() {
  const dir = join(root, 'apps/desktop/src/main/recording');
  const session = existsSync(join(dir, 'recording-session.mjs')) ? readFileSync(join(dir, 'recording-session.mjs'), 'utf8') : '';
  return existsSync(join(dir, 'uiohook-button-listener.mjs')) && !existsSync(join(dir, 'noop-button-listener.mjs')) && /win32'\s*\?\s*createUiohookButtonListener/.test(session);
}

function confirm(key, note) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('Refusing: evidence must be recorded by the user from an interactive terminal.\n');
    process.exit(2);
  }
  if (!Object.hasOwn(EVIDENCE_KEYS, key)) {
    process.stderr.write(`Unknown key. Valid keys:\n${Object.entries(EVIDENCE_KEYS).map(([k, d]) => `  ${k}: ${d}`).join('\n')}\n`);
    process.exit(2);
  }
  if (!note || note.trim().length < 5) {
    process.stderr.write('Add a short note saying what you checked and on what machine.\n');
    process.exit(2);
  }
  let data = {};
  try { data = JSON.parse(readFileSync(evidencePath, 'utf8')); } catch { /* new file */ }
  data[key] = { status: 'passed', confirmedBy: 'user', confirmedAt: new Date().toISOString(), note: note.trim() };
  mkdirSync(join(root, '.git'), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(data, null, 2) + '\n');
  process.stdout.write(`Recorded: ${key}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
