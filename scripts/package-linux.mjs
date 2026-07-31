import { cp, lstat, mkdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appRoot = join(artifactRoot, 'resources', 'app');
const scopedPackageRoot = join(appRoot, 'node_modules', '@rough-cut');
const workspacePackages = ['project-model', 'timeline-engine', 'effect-registry', 'frame-resolver'];

await rm(artifactRoot, { recursive: true, force: true });
await mkdir(appRoot, { recursive: true });

await cp(join(root, 'apps/desktop/node_modules/electron/dist'), artifactRoot, { recursive: true, force: true });
await configureSandboxHelper();
await cp(join(root, 'apps/desktop/src/main'), join(appRoot, 'apps/desktop/src/main'), { recursive: true });
await cp(join(root, 'apps/desktop/src/preload'), join(appRoot, 'apps/desktop/src/preload'), { recursive: true });
await cp(join(root, 'apps/desktop/src/shared'), join(appRoot, 'apps/desktop/src/shared'), { recursive: true });
await cp(join(root, 'apps/desktop/dist/renderer'), join(appRoot, 'apps/desktop/dist/renderer'), { recursive: true });
if (process.env.ROUGH_CUT_FREECUT_DIST) {
  await cp(process.env.ROUGH_CUT_FREECUT_DIST, join(appRoot, 'freecut'), { recursive: true });
}
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
  '#!/usr/bin/env bash\nset -euo pipefail\nDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"\nROOT_DIR="$(cd "$DIR/../.." && pwd)"\nSESSION_RUNTIME="/run/user/$(id -u)"\nif [[ -z "${XDG_RUNTIME_DIR:-}" && -d "$SESSION_RUNTIME" ]]; then export XDG_RUNTIME_DIR="$SESSION_RUNTIME"; fi\nif [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" && -S "$SESSION_RUNTIME/bus" ]]; then export DBUS_SESSION_BUS_ADDRESS="unix:path=$SESSION_RUNTIME/bus"; fi\nexport ROUGH_CUT_LOAD_BUILT_RENDERER=1\nexport ROUGH_CUT_STARTUP_MODE=freecut\nexport ROUGH_CUT_TRANSCRIPTION_LANGUAGE=he\nif [[ -x "$ROOT_DIR/.venv-transcription/bin/python" && -e "$ROOT_DIR/.transcription-model" ]]; then\n  TRANSCRIPTION_SITE="$ROOT_DIR/.venv-transcription/lib/python3.12/site-packages"\n  export ROUGH_CUT_FASTER_WHISPER_PYTHON="$ROOT_DIR/.venv-transcription/bin/python"\n  export ROUGH_CUT_FASTER_WHISPER_MODEL_PATH="$ROOT_DIR/.transcription-model"\n  export ROUGH_CUT_FASTER_WHISPER_DEVICE=cuda\n  export ROUGH_CUT_FASTER_WHISPER_COMPUTE_TYPE=int8_float16\n  export ROUGH_CUT_FASTER_WHISPER_LIBRARY_PATH="$TRANSCRIPTION_SITE/nvidia/cublas/lib:$TRANSCRIPTION_SITE/nvidia/cudnn/lib"\nfi\nexec "$DIR/electron" "$DIR/resources/app" "$@"\n',
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
