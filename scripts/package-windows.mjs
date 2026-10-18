// Builds the portable Windows package: dist/rough-cut-mvp-win32-x64/ with "Rough Cut.exe" at its root.
//
//   pnpm build && node scripts/prepare-windows-tools.mjs && node scripts/package-windows.mjs
//
// Same layout idea as scripts/package-linux.mjs (Electron's own distribution plus resources/app, no asar), with the
// pinned FFmpeg under resources/bin and the two native input modules (uiohook-napi, loopback-capture) trimmed to their
// win32-x64 binaries.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { releaseSourceIdentity } from './lib/release-source-identity.mjs';
import { makeIcon } from './windows/make-icon.mjs';

if (process.platform !== 'win32') throw new Error('package-windows.mjs builds the Windows package on Windows.');

const root = resolve(import.meta.dirname, '..');
const desktopVersion = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8')).version ?? '0.0.0';
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-win32-x64');
const appRoot = join(artifactRoot, 'resources', 'app');
const scopedPackageRoot = join(appRoot, 'node_modules', '@rough-cut');
const workspacePackages = ['project-model', 'timeline-engine', 'effect-registry', 'frame-resolver'];
const nativeModules = ['uiohook-napi', 'loopback-capture'];
const productName = 'Rough Cut';

const sha256File = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

// 1. The pinned tools must be present and match the lock.
const toolsLock = JSON.parse(await readFile(join(root, 'scripts/bundled-tools-windows.lock.json'), 'utf8'));
const toolsRoot = join(root, 'build-resources', 'windows-tools');
if (!Object.keys(toolsLock.files ?? {}).length) throw new Error('scripts/bundled-tools-windows.lock.json has no file hashes. Run: node scripts/prepare-windows-tools.mjs --record');
for (const [file, expected] of Object.entries(toolsLock.files)) {
  let actual = null;
  try { actual = await sha256File(join(toolsRoot, file)); } catch { /* reported below */ }
  if (actual !== expected) throw new Error(`Bundled tool missing or failed its integrity check: ${file}. Run: node scripts/prepare-windows-tools.mjs`);
}

await rm(artifactRoot, { recursive: true, force: true });
await mkdir(appRoot, { recursive: true });

// 2. Electron's distribution, then the app.
await cp(join(root, 'apps/desktop/node_modules/electron/dist'), artifactRoot, { recursive: true, force: true, dereference: true });
await cp(join(root, 'apps/desktop/src/main'), join(appRoot, 'apps/desktop/src/main'), { recursive: true });
await cp(join(root, 'apps/desktop/src/preload'), join(appRoot, 'apps/desktop/src/preload'), { recursive: true });
await cp(join(root, 'apps/desktop/src/shared'), join(appRoot, 'apps/desktop/src/shared'), { recursive: true });
await cp(join(root, 'apps/desktop/dist/renderer'), join(appRoot, 'apps/desktop/dist/renderer'), { recursive: true });
// Test files are source, not product.
for (const dir of ['apps/desktop/src/main', 'apps/desktop/src/main/recording', 'apps/desktop/src/shared']) {
  for (const name of await readdir(join(appRoot, dir))) if (name.endsWith('.test.mjs')) await rm(join(appRoot, dir, name));
}
await mkdir(scopedPackageRoot, { recursive: true });
for (const packageName of workspacePackages) {
  const target = join(scopedPackageRoot, packageName);
  await mkdir(target, { recursive: true });
  await cp(join(root, 'packages', packageName, 'package.json'), join(target, 'package.json'));
  await cp(join(root, 'packages', packageName, 'dist'), join(target, 'dist'), { recursive: true });
  await cp(join(root, 'packages', packageName, 'dist'), join(appRoot, 'packages', packageName, 'dist'), { recursive: true });
}
await cp(join(root, 'packages/project-model/node_modules/zod'), join(appRoot, 'node_modules/zod'), { recursive: true, dereference: true });

// 3. Production dependencies, including the native input modules, kept to win32-x64 binaries.
const desktopPackageJson = join(root, 'apps/desktop/package.json');
await copyProductionDependencies('electron-updater', desktopPackageJson);
for (const name of nativeModules) await copyProductionDependencies(name, desktopPackageJson);
for (const name of nativeModules) {
  const prebuilds = join(appRoot, 'node_modules', name, 'prebuilds');
  for (const dir of await readdir(prebuilds)) if (dir !== 'win32-x64') await rm(join(prebuilds, dir), { recursive: true, force: true });
}

// 4. Tools and licences.
await mkdir(join(artifactRoot, 'resources/bin'), { recursive: true });
await cp(join(toolsRoot, 'bin'), join(artifactRoot, 'resources/bin'), { recursive: true });
await mkdir(join(artifactRoot, 'resources/licenses/media-tools'), { recursive: true });
await cp(join(toolsRoot, 'licenses'), join(artifactRoot, 'resources/licenses/media-tools'), { recursive: true });
await cp(join(root, 'LICENSE'), join(artifactRoot, 'resources/licenses/Rough-Cut-AGPL-3.0.txt'));
await cp(join(root, 'build-resources/font-licenses'), join(artifactRoot, 'resources/licenses/fonts'), { recursive: true });
await writeFile(join(artifactRoot, 'resources/bundled-tools.json'), `${JSON.stringify({ version: 1, platform: 'win32-x64', files: toolsLock.files, source: toolsLock.source }, null, 2)}\n`);
for (const name of ['README.md', 'INSTALL.md', 'RELEASE-NOTES.md', 'CLAUDE-SETUP.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md']) await cp(join(root, name), join(appRoot, name)).catch(() => undefined);
for (const docsRoot of [join(artifactRoot, 'docs'), join(appRoot, 'docs')]) {
  await mkdir(docsRoot, { recursive: true });
  for (const name of ['RELEASE-REQUIREMENTS.md', 'MEDIA-SOURCE-BUILD.md', 'UPDATE-SIGNING.json', 'publisher-public-key.pem']) await cp(join(root, 'docs', name), join(docsRoot, name)).catch(() => undefined);
}

// 5. App metadata (same files the Linux package writes; the updater stays disabled until a publisher key is pinned).
await writeFile(join(appRoot, 'app-update.yml'), 'updaterCacheDirName: rough-cut-updater\n');
await cp(join(root, 'release-policy.json'), join(appRoot, 'release-policy.json'));
const rendererAssetsRoot = join(appRoot, 'apps/desktop/dist/renderer/assets');
const rendererBundleNames = (await readdir(rendererAssetsRoot)).filter((name) => /^index-.*\.js$/.test(name)).sort();
if (rendererBundleNames.length !== 1) throw new Error(`Expected exactly one packaged renderer bundle, found ${rendererBundleNames.length}`);
const sourceIdentity = await releaseSourceIdentity(root, { extraFiles: ['scripts/package-windows.mjs', 'scripts/prepare-windows-tools.mjs', 'scripts/bundled-tools-windows.lock.json'] });
await writeFile(join(appRoot, 'package-identity.json'), `${JSON.stringify({
  version: 1,
  platform: 'win32-x64',
  sourceCommit: sourceIdentity.sourceCommit,
  sourceSha256: sourceIdentity.sourceSha256,
  electronVersion: JSON.parse(await readFile(join(root, 'apps/desktop/node_modules/electron/package.json'), 'utf8')).version,
  rendererBundleName: rendererBundleNames[0],
  rendererBundleSha256: await sha256File(join(rendererAssetsRoot, rendererBundleNames[0])),
  packagedAt: new Date().toISOString(),
}, null, 2)}\n`);
await writeFile(join(appRoot, 'package-source-manifest.json'), `${JSON.stringify(sourceIdentity, null, 2)}\n`);
await writeFile(join(appRoot, 'package.json'), `${JSON.stringify({
  name: 'rough-cut-mvp-packaged',
  productName,
  version: desktopVersion,
  type: 'module',
  main: 'apps/desktop/src/main/index.mjs',
  description: 'A focused screen recorder and video editor',
  author: 'Rough Cut contributors',
  license: 'AGPL-3.0-only',
  dependencies: {
    zod: '^3.24.0',
    'electron-updater': '6.8.9',
    ...Object.fromEntries(nativeModules.map((name) => [name, JSON.parse(readFileSyncSafe(join(root, 'apps/desktop/node_modules', name, 'package.json'))).version])),
    ...Object.fromEntries(workspacePackages.map((name) => [`@rough-cut/${name}`, '0.1.0'])),
  },
}, null, 2)}\n`);

// 6. The executable: renamed, with the product icon and version info. Electron then treats the app as packaged.
await rename(join(artifactRoot, 'electron.exe'), join(artifactRoot, `${productName}.exe`));
await rename(join(artifactRoot, 'LICENSE'), join(artifactRoot, 'LICENSE.electron')).catch(() => undefined);
await cp(join(root, 'LICENSE'), join(artifactRoot, 'LICENSE'));
for (const name of ['THIRD_PARTY_NOTICES.md', 'README.md', 'INSTALL.md', 'RELEASE-NOTES.md', 'SECURITY.md', 'CHANGELOG.md']) {
  await cp(join(root, name), join(artifactRoot, name)).catch(() => undefined);
}
const iconPath = join(root, 'build-resources', 'windows-tools', 'rough-cut.ico');
makeIcon(join(root, 'apps/desktop/assets/rough-cut-mvp-icon.png'), iconPath);
const { rcedit } = await import('rcedit');
await rcedit(join(artifactRoot, `${productName}.exe`), {
  icon: iconPath,
  'file-version': `${desktopVersion.split('-')[0]}.0`,
  'product-version': desktopVersion,
  'version-string': {
    ProductName: productName,
    FileDescription: `${productName} screen recorder and editor`,
    CompanyName: 'Rough Cut contributors',
    LegalCopyright: 'AGPL-3.0-only',
    OriginalFilename: `${productName}.exe`,
    InternalName: productName,
  },
});

console.info(JSON.stringify({ ok: true, artifactRoot, executable: join(artifactRoot, `${productName}.exe`) }, null, 2));

function readFileSyncSafe(path) {
  return createRequire(import.meta.url)('node:fs').readFileSync(path, 'utf8');
}

async function copyProductionDependencies(name, from, copied = new Map()) {
  const require = createRequire(from);
  let metadata;
  try { metadata = require.resolve(`${name}/package.json`); }
  catch {
    let directory = dirname(require.resolve(name));
    for (;;) {
      try { if (JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')).name === name) { metadata = join(directory, 'package.json'); break; } } catch { /* keep climbing */ }
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
  const source = dirname(metadata);
  await cp(source, join(appRoot, 'node_modules', name), {
    recursive: true,
    dereference: true,
    // Windows paths: compare with the platform separator, and never copy a package's own nested node_modules.
    filter: (path) => path !== join(source, 'node_modules') && !path.includes(`${join('node_modules', '.cache')}`),
  });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) await copyProductionDependencies(dependency, metadata, copied);
}
