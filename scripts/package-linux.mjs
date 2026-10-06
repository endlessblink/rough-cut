import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { releaseSourceIdentity } from './lib/release-source-identity.mjs';

const root = process.cwd();
const desktopVersion = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8')).version ?? '0.0.0';
const sourceIdentity = await releaseSourceIdentity(root);
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appRoot = join(artifactRoot, 'resources', 'app');
const scopedPackageRoot = join(appRoot, 'node_modules', '@rough-cut');
const workspacePackages = ['project-model', 'timeline-engine', 'effect-registry', 'frame-resolver'];

const toolsLock = JSON.parse(await readFile(join(root, 'scripts/bundled-tools.lock.json'), 'utf8'));
for (const [file, expected] of Object.entries(toolsLock.files)) {
  const actual = createHash('sha256').update(await readFile(join(root, 'build-resources/linux-tools', file))).digest('hex');
  if (actual !== expected) throw new Error(`Bundled tool integrity check failed: ${file}`);
}

await rm(artifactRoot, { recursive: true, force: true });
await mkdir(appRoot, { recursive: true });

await cp(join(root, 'apps/desktop/node_modules/electron/dist'), artifactRoot, { recursive: true, force: true });
await cp(join(root, 'apps/desktop/src/main'), join(appRoot, 'apps/desktop/src/main'), { recursive: true });
await cp(join(root, 'apps/desktop/src/preload'), join(appRoot, 'apps/desktop/src/preload'), { recursive: true });
await cp(join(root, 'apps/desktop/src/shared'), join(appRoot, 'apps/desktop/src/shared'), { recursive: true });
await cp(join(root, 'apps/desktop/dist/renderer'), join(appRoot, 'apps/desktop/dist/renderer'), { recursive: true });
await mkdir(scopedPackageRoot, { recursive: true });
for (const packageName of workspacePackages) {
  await cpWorkspacePackage(packageName);
  await cp(join(root, 'packages', packageName, 'dist'), join(appRoot, 'packages', packageName, 'dist'), { recursive: true });
}
await cp(join(root, 'packages/project-model/node_modules/zod'), join(appRoot, 'node_modules/zod'), {
  recursive: true,
  dereference: true,
});

await copyProductionDependencies('electron-updater', join(root, 'apps/desktop/package.json'));
const toolsRoot = join(root, 'build-resources/linux-tools');
await mkdir(join(artifactRoot, 'resources/bin'), { recursive: true });
await cp(toolsRoot, join(artifactRoot, 'resources/media-tools'), { recursive: true });
for (const tool of ['ffmpeg', 'ffprobe', 'xdotool', 'xinput', 'pactl']) {
  const wrapper = '#!/bin/sh\nset -eu\nTOOL_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../media-tools" && pwd)\nLD_LIBRARY_PATH="$TOOL_ROOT/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" exec "$TOOL_ROOT/bin/' + tool + '" "$@"\n';
  await writeFile(join(artifactRoot, 'resources/bin', tool), wrapper, { mode: 0o755 });
}
await mkdir(join(artifactRoot, 'resources/licenses'), { recursive: true });
await cp(join(root, 'LICENSE'), join(artifactRoot, 'resources/licenses/Rough-Cut-AGPL-3.0.txt'));
await cp(join(root, 'build-resources/font-licenses'), join(artifactRoot, 'resources/licenses/fonts'), { recursive: true });
for (const name of ['README.md', 'INSTALL.md', 'RELEASE-NOTES.md', 'CLAUDE-SETUP.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md']) await cp(join(root, name), join(appRoot, name));
await cp(join(toolsRoot, 'licenses'), join(artifactRoot, 'resources/licenses/media-tools'), { recursive: true });
await writeFile(join(artifactRoot, 'resources/bundled-tools.json'), JSON.stringify({ version: 2, files: toolsLock.files, source: toolsLock.provenance }, null, 2) + '\n');
for (const docsRoot of [join(artifactRoot, 'docs'), join(appRoot, 'docs')]) {
  await mkdir(docsRoot, { recursive: true });
  await cp(join(root, 'docs/RELEASE-REQUIREMENTS.md'), join(docsRoot, 'RELEASE-REQUIREMENTS.md'));
  await cp(join(root, 'docs/MEDIA-SOURCE-BUILD.md'), join(docsRoot, 'MEDIA-SOURCE-BUILD.md'));
  await cp(join(root, 'docs/UPDATE-SIGNING.json'), join(docsRoot, 'UPDATE-SIGNING.json'));
  await cp(join(root, 'docs/publisher-public-key.pem'), join(docsRoot, 'publisher-public-key.pem'));
  await mkdir(join(docsRoot, 'site/assets'), { recursive: true });
  await cp(join(root, 'docs/site/assets/proof-zoom.webp'), join(docsRoot, 'site/assets/proof-zoom.webp'));
}
await writeFile(join(appRoot, 'app-update.yml'), 'updaterCacheDirName: rough-cut-updater\n');
const configuredReleasePolicy = JSON.parse(await readFile(join(root, 'release-policy.json'), 'utf8'));
// Owner-approved destination is distinct from activation. Never infer activation.
await writeFile(join(appRoot, 'release-policy.json'), JSON.stringify(configuredReleasePolicy, null, 2) + '\n');

const rendererAssetsRoot = join(appRoot, 'apps/desktop/dist/renderer/assets');
const rendererBundleNames = (await readdir(rendererAssetsRoot)).filter((name) => /^index-.*\.js$/.test(name)).sort();
if (rendererBundleNames.length !== 1) throw new Error(`Expected exactly one packaged renderer bundle, found ${rendererBundleNames.length}`);
const rendererBundleName = rendererBundleNames[0];
const rendererBundleSha256 = createHash('sha256')
  .update(await readFile(join(rendererAssetsRoot, rendererBundleName)))
  .digest('hex');
await writeFile(join(appRoot, 'package-identity.json'), `${JSON.stringify({
  version: 1,
  sourceCommit: sourceIdentity.sourceCommit,
  sourceSha256: sourceIdentity.sourceSha256,
  electronVersion: JSON.parse(await readFile(join(root, 'apps/desktop/node_modules/electron/package.json'), 'utf8')).version,
  rendererBundleName,
  rendererBundleSha256,
  packagedAt: new Date().toISOString(),
}, null, 2)}\n`);
await writeFile(join(appRoot, 'package-source-manifest.json'), `${JSON.stringify(sourceIdentity, null, 2)}\n`);

await writeFile(
  join(appRoot, 'package.json'),
  `${JSON.stringify(
    {
      name: 'rough-cut-mvp-packaged',
      version: desktopVersion,
      type: 'module',
      main: 'apps/desktop/src/main/index.mjs',
      description: 'A focused screen recorder and video editor',
      author: 'Rough Cut contributors',
      license: 'AGPL-3.0-only',
      dependencies: { zod: '^3.24.0', 'electron-updater': '6.8.9', ...Object.fromEntries(workspacePackages.map((name) => [`@rough-cut/${name}`, '0.1.0'])) },
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(artifactRoot, 'run.sh'),
  "#!/usr/bin/env bash\nset -euo pipefail\nDIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\"\nROOT_DIR=\"$(cd \"$DIR/../..\" && pwd)\"\nSESSION_RUNTIME=\"/run/user/$(id -u)\"\nif [[ -z \"${XDG_RUNTIME_DIR:-}\" && -d \"$SESSION_RUNTIME\" ]]; then export XDG_RUNTIME_DIR=\"$SESSION_RUNTIME\"; fi\nif [[ -z \"${DBUS_SESSION_BUS_ADDRESS:-}\" && -S \"$SESSION_RUNTIME/bus\" ]]; then export DBUS_SESSION_BUS_ADDRESS=\"unix:path=$SESSION_RUNTIME/bus\"; fi\nexport ROUGH_CUT_LOAD_BUILT_RENDERER=1\nexport ROUGH_CUT_STARTUP_MODE=editor\nif [[ \"${ROUGH_CUT_USE_LOCAL_VENV:-}\" == \"1\" && -x \"$ROOT_DIR/.venv-transcription/bin/python\" && -e \"$ROOT_DIR/.transcription-model\" ]]; then\n  TRANSCRIPTION_SITE=\"$ROOT_DIR/.venv-transcription/lib/python3.12/site-packages\"\n  export ROUGH_CUT_FASTER_WHISPER_PYTHON=\"$ROOT_DIR/.venv-transcription/bin/python\"\n  export ROUGH_CUT_FASTER_WHISPER_MODEL_PATH=\"$ROOT_DIR/.transcription-model\"\n  export ROUGH_CUT_FASTER_WHISPER_DEVICE=cuda\n  export ROUGH_CUT_FASTER_WHISPER_COMPUTE_TYPE=int8_float16\n  export ROUGH_CUT_FASTER_WHISPER_LIBRARY_PATH=\"$TRANSCRIPTION_SITE/nvidia/cublas/lib:$TRANSCRIPTION_SITE/nvidia/cudnn/lib\"\nfi\nif [[ -n \"${ELECTRON_DISABLE_SANDBOX:-}\" && \"${ELECTRON_DISABLE_SANDBOX}\" != \"0\" ]]; then\n  echo \"Rough Cut requires the Chromium sandbox; ELECTRON_DISABLE_SANDBOX is not supported.\" >&2\n  exit 64\nfi\nfor arg in \"$@\"; do\n  case \"$arg\" in\n    --no-sandbox|--no-sandbox=*|--disable-setuid-sandbox|--disable-setuid-sandbox=*|--disable-gpu-sandbox|--disable-gpu-sandbox=*|--disable-seccomp-filter-sandbox|--disable-seccomp-filter-sandbox=*|--disable-namespace-sandbox|--disable-namespace-sandbox=*)\n      echo \"Rough Cut requires the Chromium sandbox; disabling it is not supported by this launcher.\" >&2\n      exit 64\n      ;;\n  esac\ndone\nexec \"$DIR/electron\" --enable-sandbox \"$DIR/resources/app\" \"$@\"\n",
  { mode: 0o755 },
);

await writeFile(
  join(artifactRoot, 'dock-launch.sh'),
  '#!/usr/bin/env bash\nset -euo pipefail\nDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"\nif [[ " $* " == *" --user-data-dir="* ]]; then\n  exec "$DIR/run.sh" "$@"\nfi\nBUNDLE_PATH=""\nfor candidate in "$DIR"/resources/app/apps/desktop/dist/renderer/assets/index-*.js; do\n  if [[ -f "$candidate" ]]; then BUNDLE_PATH="$candidate"; break; fi\ndone\nif [[ -z "$BUNDLE_PATH" ]]; then echo "Packaged renderer bundle is missing" >&2; exit 1; fi\nBUNDLE_ID="$(basename "$BUNDLE_PATH" .js)"\nCONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}"\nPROFILE_ROOT="$CONFIG_ROOT/rough-cut-mvp/dock/$BUNDLE_ID"\nmkdir -p "$PROFILE_ROOT"\nexec "$DIR/run.sh" "--user-data-dir=$PROFILE_ROOT" "$@"\n',
  { mode: 0o755 },
);

// Electron ships its own MIT LICENSE at the artifact root; ours (AGPL-3.0) must
// be the one people see, with Electron's kept beside it.
await rename(join(artifactRoot, 'LICENSE'), join(artifactRoot, 'LICENSE.electron')).catch(() => undefined);
await cp(join(root, 'LICENSE'), join(artifactRoot, 'LICENSE'));
for (const name of ['THIRD_PARTY_NOTICES.md', 'README.md', 'INSTALL.md', 'RELEASE-NOTES.md', 'SECURITY.md', 'CHANGELOG.md']) {
  await cp(join(root, name), join(artifactRoot, name)).catch(() => undefined);
}

console.info(JSON.stringify({ ok: true, artifactRoot, executable: join(artifactRoot, 'electron') }, null, 2));

async function cpWorkspacePackage(packageName) {
  const sourceRoot = join(root, 'packages', packageName);
  const targetRoot = join(scopedPackageRoot, packageName);
  await mkdir(targetRoot, { recursive: true });
  await cp(join(sourceRoot, 'package.json'), join(targetRoot, 'package.json'));
  await cp(join(sourceRoot, 'dist'), join(targetRoot, 'dist'), { recursive: true });
}


async function copyProductionDependencies(name, from, copied = new Map()) {
  const require = createRequire(from);
  let metadata;
  try { metadata = require.resolve(`${name}/package.json`); }
  catch {
    let directory = dirname(require.resolve(name));
    for (;;) {
      try { if (JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).name === name) { metadata = join(directory, 'package.json'); break; } } catch {}
      const parent = dirname(directory);
      if (parent === directory) throw new Error(`Cannot resolve production dependency ${name}`);
      directory = parent;
    }
  }
  const pkg = JSON.parse(await readFile(metadata, 'utf8'));
  if (copied.has(name)) {
    if (copied.get(name) !== pkg.version) throw new Error(`Conflicting production dependency ${name}`);
    return;
  }
  copied.set(name, pkg.version);
  await cp(dirname(metadata), join(appRoot, 'node_modules', name), { recursive: true, dereference: true, filter: (path) => !path.includes('/node_modules/.cache/') && path !== join(dirname(metadata), 'node_modules') });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) await copyProductionDependencies(dependency, metadata, copied);
}
