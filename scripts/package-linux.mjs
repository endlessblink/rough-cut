import { access, cp, lstat, mkdir, readdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const root = process.cwd();
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appRoot = join(artifactRoot, 'resources', 'app');
const scopedPackageRoot = join(appRoot, 'node_modules', '@rough-cut');
const workspacePackages = ['project-model', 'timeline-engine', 'effect-registry', 'frame-resolver'];
const freecutDist = await ensureFreecutDist();

await rm(artifactRoot, { recursive: true, force: true });
await mkdir(appRoot, { recursive: true });

await cp(join(root, 'apps/desktop/node_modules/electron/dist'), artifactRoot, { recursive: true, force: true });
await configureSandboxHelper();
await cp(join(root, 'apps/desktop/src/main'), join(appRoot, 'apps/desktop/src/main'), { recursive: true });
await cp(join(root, 'apps/desktop/src/preload'), join(appRoot, 'apps/desktop/src/preload'), { recursive: true });
await cp(join(root, 'apps/desktop/src/shared'), join(appRoot, 'apps/desktop/src/shared'), { recursive: true });
await cp(join(root, 'apps/desktop/dist/renderer'), join(appRoot, 'apps/desktop/dist/renderer'), { recursive: true });
await cp(freecutDist, join(appRoot, 'freecut'), { recursive: true });
await mkdir(scopedPackageRoot, { recursive: true });
for (const packageName of workspacePackages) {
  await cpWorkspacePackage(packageName);
  await cp(join(root, 'packages', packageName, 'dist'), join(appRoot, 'packages', packageName, 'dist'), { recursive: true });
}
await cp(join(root, 'packages/project-model/node_modules/zod'), join(appRoot, 'node_modules/zod'), {
  recursive: true,
  dereference: true,
});

await writeFile(
  join(appRoot, 'package.json'),
  `${JSON.stringify(
    {
      name: 'rough-cut-mvp-packaged',
      version: '0.1.0',
      type: 'module',
      main: 'apps/desktop/src/main/index.mjs',
      dependencies: { zod: '^3.24.0' },
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(artifactRoot, 'run.sh'),
  '#!/usr/bin/env bash\nset -euo pipefail\nDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"\nROOT_DIR="$(cd "$DIR/../.." && pwd)"\nSESSION_RUNTIME="/run/user/$(id -u)"\nif [[ -z "${XDG_RUNTIME_DIR:-}" && -d "$SESSION_RUNTIME" ]]; then export XDG_RUNTIME_DIR="$SESSION_RUNTIME"; fi\nif [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" && -S "$SESSION_RUNTIME/bus" ]]; then export DBUS_SESSION_BUS_ADDRESS="unix:path=$SESSION_RUNTIME/bus"; fi\nexport ROUGH_CUT_LOAD_BUILT_RENDERER=1\nexport ROUGH_CUT_STARTUP_MODE=editor\nexport ROUGH_CUT_TRANSCRIPTION_LANGUAGE=he\nexport ROUGH_CUT_PLAYBACK_DEBUG_REPORT_PATH="${ROUGH_CUT_PLAYBACK_DEBUG_REPORT_PATH:-/tmp/rough-cut-runtime-report.json}"\nif [[ -x "$ROOT_DIR/.venv-transcription/bin/python" && -e "$ROOT_DIR/.transcription-model" ]]; then\n  TRANSCRIPTION_SITE="$ROOT_DIR/.venv-transcription/lib/python3.12/site-packages"\n  export ROUGH_CUT_FASTER_WHISPER_PYTHON="$ROOT_DIR/.venv-transcription/bin/python"\n  export ROUGH_CUT_FASTER_WHISPER_MODEL_PATH="$ROOT_DIR/.transcription-model"\n  export ROUGH_CUT_FASTER_WHISPER_DEVICE=cuda\n  export ROUGH_CUT_FASTER_WHISPER_COMPUTE_TYPE=int8_float16\n  export ROUGH_CUT_FASTER_WHISPER_LIBRARY_PATH="$TRANSCRIPTION_SITE/nvidia/cublas/lib:$TRANSCRIPTION_SITE/nvidia/cudnn/lib"\nfi\nexec "$DIR/electron" "$DIR/resources/app" "$@"\n',
  { mode: 0o755 },
);

await writeFile(
  join(artifactRoot, 'dock-launch.sh'),
  '#!/usr/bin/env bash\nset -euo pipefail\nexec "$(dirname "$0")/run.sh" "$@"\n',
  { mode: 0o755 },
);

console.info(JSON.stringify({ ok: true, artifactRoot, executable: join(artifactRoot, 'electron') }, null, 2));

async function cpWorkspacePackage(packageName) {
  const sourceRoot = join(root, 'packages', packageName);
  const targetRoot = join(scopedPackageRoot, packageName);
  await mkdir(targetRoot, { recursive: true });
  await cp(join(sourceRoot, 'package.json'), join(targetRoot, 'package.json'));
  await cp(join(sourceRoot, 'dist'), join(targetRoot, 'dist'), { recursive: true });
}

async function configureSandboxHelper() {
  const packagedHelper = join(artifactRoot, 'chrome-sandbox');
  const candidates = [
    '/opt/google/chrome/chrome-sandbox',
    '/opt/brave.com/brave/chrome-sandbox',
    '/usr/lib/chromium/chrome-sandbox',
  ];

  for (const candidate of candidates) {
    try {
      const metadata = await stat(candidate);
      if (metadata.uid !== 0 || (metadata.mode & 0o4777) !== 0o4755) continue;
      await rename(packagedHelper, join(artifactRoot, 'chrome-sandbox.unprivileged'));
      await symlink(candidate, packagedHelper);
      return;
    } catch {
      // Continue to the next trusted system helper.
    }
  }

  await lstat(packagedHelper);
}

/**
 * Newest mtime under a directory, or 0 if it cannot be read.
 *
 * Used to answer "is the built editor older than its source?". Without this the
 * packager happily shipped a dist built before the edit being tested, so the app
 * ran code that no longer existed in the tree — every conclusion drawn from that
 * run was about the wrong build.
 */
async function newestMtime(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let newest = 0;
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await newestMtime(full));
      continue;
    }
    const info = await stat(full).catch(() => null);
    if (info) newest = Math.max(newest, info.mtimeMs);
  }
  return newest;
}

async function ensureFreecutDist() {
  if (process.env.ROUGH_CUT_FREECUT_DIST) return process.env.ROUGH_CUT_FREECUT_DIST;
  const sourceRoot = join(root, 'vendor', 'freecut');
  const distRoot = join(sourceRoot, 'dist');
  try {
    // A dist older than the source it was built from is stale, however valid it
    // looks. Check this first: the marker checks below only prove the build is
    // *a* correct build, not a current one.
    const [sourceMtime, distMtime] = await Promise.all([
      newestMtime(join(sourceRoot, 'src')),
      newestMtime(distRoot),
    ]);
    if (sourceMtime > distMtime) {
      console.log('[package] vendored editor source is newer than its build; rebuilding');
      throw new Error('FreeCut dist is older than its source');
    }
    const indexHtml = await readFile(join(distRoot, 'index.html'), 'utf8');
    const entryMatch = indexHtml.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
    if (!entryMatch) throw new Error('FreeCut entry script is missing');
    const entryPath = join(distRoot, entryMatch[1].replace(/^\//, ''));
    const entrySource = await readFile(entryPath, 'utf8');
    const mainMatch = entrySource.match(/import\([`"']\.\/(main-[A-Za-z0-9_-]+\.js)[`"']\)/);
    const mainSource = mainMatch
      ? await readFile(join(distRoot, 'assets', mainMatch[1]), 'utf8')
      : entrySource;
    if (!mainSource.includes('freecut-boot') || !mainSource.includes('vendored-freecut-1')) {
      throw new Error('FreeCut entry script is stale');
    }
    return distRoot;
  } catch {
    // Remove stale hashed chunks before rebuilding so index.html and its entry
    // module cannot come from different builds.
    await rm(distRoot, { recursive: true, force: true });
    await execFileAsync('npm', ['ci', '--ignore-scripts'], { cwd: sourceRoot, stdio: 'inherit' });
    await execFileAsync('npm', ['run', 'build'], { cwd: sourceRoot, stdio: 'inherit' });
    await access(join(distRoot, 'index.html'));
    return distRoot;
  }
}
