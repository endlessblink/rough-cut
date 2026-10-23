// Builds the Mac (beta) app: dist/rough-cut-mvp-darwin-<arch>/Rough Cut.app, signed ad hoc (no Apple account).
//
//   pnpm build && node scripts/prepare-mac-tools.mjs && node scripts/package-mac.mjs
//
// Same layout idea as scripts/package-windows.mjs (Electron's own distribution plus Resources/app, no asar), with the
// pinned FFmpeg under Contents/Resources/bin and the native input hook (uiohook-napi) trimmed to this Mac's binary.
// Ad-hoc signing makes the app runnable on Apple Silicon; because it is not notarized, macOS still asks the user to
// confirm the first launch (see docs/MAC-BETA-OPEN-UNSIGNED.md).

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { releaseSourceIdentity } from './lib/release-source-identity.mjs';

if (process.platform !== 'darwin') throw new Error('package-mac.mjs builds the Mac app on a Mac.');

const root = resolve(import.meta.dirname, '..');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const desktopVersion = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8')).version ?? '0.0.0';
const productName = 'Rough Cut';
const artifactRoot = join(root, 'dist', `rough-cut-mvp-darwin-${arch}`);
const appBundle = join(artifactRoot, `${productName}.app`);
const resourcesRoot = join(appBundle, 'Contents', 'Resources');
const appRoot = join(resourcesRoot, 'app');
const scopedPackageRoot = join(appRoot, 'node_modules', '@rough-cut');
const workspacePackages = ['project-model', 'timeline-engine', 'effect-registry', 'frame-resolver'];
const nativeModules = ['uiohook-napi'];

const sha256File = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim().slice(-600)}`);
  return result.stdout;
};

// 1. The pinned tools must be present and match the lock for this arch.
const toolsLock = JSON.parse(await readFile(join(root, 'scripts/bundled-tools-mac.lock.json'), 'utf8'));
const toolsRoot = join(root, 'build-resources', 'mac-tools');
for (const [file, expected] of Object.entries(toolsLock.files[arch] ?? {})) {
  let actual = null;
  try { actual = await sha256File(join(toolsRoot, file)); } catch { /* reported below */ }
  if (actual !== expected) throw new Error(`Bundled tool missing or failed its integrity check: ${file}. Run: node scripts/prepare-mac-tools.mjs`);
}

await rm(artifactRoot, { recursive: true, force: true });
await mkdir(artifactRoot, { recursive: true });

// 2. Electron's app bundle (ditto keeps its symlinked frameworks intact), then the app.
run('ditto', [join(root, 'apps/desktop/node_modules/electron/dist/Electron.app'), appBundle]);
await mkdir(appRoot, { recursive: true });
await cp(join(root, 'apps/desktop/src/main'), join(appRoot, 'apps/desktop/src/main'), { recursive: true });
await cp(join(root, 'apps/desktop/src/preload'), join(appRoot, 'apps/desktop/src/preload'), { recursive: true });
await cp(join(root, 'apps/desktop/src/shared'), join(appRoot, 'apps/desktop/src/shared'), { recursive: true });
await cp(join(root, 'apps/desktop/dist/renderer'), join(appRoot, 'apps/desktop/dist/renderer'), { recursive: true });
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

// 3. Production dependencies, the native hook kept to this Mac's binary.
const desktopPackageJson = join(root, 'apps/desktop/package.json');
await copyProductionDependencies('electron-updater', desktopPackageJson);
for (const name of nativeModules) await copyProductionDependencies(name, desktopPackageJson);
for (const name of nativeModules) {
  const prebuilds = join(appRoot, 'node_modules', name, 'prebuilds');
  for (const dir of await readdir(prebuilds)) if (dir !== `darwin-${arch}`) await rm(join(prebuilds, dir), { recursive: true, force: true });
}

// 4. Tools and licences.
await mkdir(join(resourcesRoot, 'bin'), { recursive: true });
await cp(join(toolsRoot, 'bin'), join(resourcesRoot, 'bin'), { recursive: true });
await mkdir(join(resourcesRoot, 'licenses/media-tools'), { recursive: true });
await cp(join(toolsRoot, 'licenses'), join(resourcesRoot, 'licenses/media-tools'), { recursive: true });
await cp(join(root, 'LICENSE'), join(resourcesRoot, 'licenses/Rough-Cut-AGPL-3.0.txt'));
await cp(join(root, 'build-resources/font-licenses'), join(resourcesRoot, 'licenses/fonts'), { recursive: true });
await writeFile(join(resourcesRoot, 'bundled-tools.json'), `${JSON.stringify({ version: 1, platform: `darwin-${arch}`, files: toolsLock.files[arch], source: toolsLock.source }, null, 2)}\n`);
for (const name of ['README.md', 'RELEASE-NOTES.md', 'CLAUDE-SETUP.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md']) await cp(join(root, name), join(appRoot, name)).catch(() => undefined);
// The repo's INSTALL.md is the Linux guide (it says there is no macOS build); the Mac app carries the Mac one.
await cp(join(root, 'docs/MAC-BETA-OPEN-UNSIGNED.md'), join(appRoot, 'INSTALL.md'));
await mkdir(join(appRoot, 'docs'), { recursive: true });
for (const name of ['RELEASE-REQUIREMENTS.md', 'MEDIA-SOURCE-BUILD.md', 'UPDATE-SIGNING.json', 'publisher-public-key.pem', 'MAC-BETA-OPEN-UNSIGNED.md']) await cp(join(root, 'docs', name), join(appRoot, 'docs', name)).catch(() => undefined);

// 5. App metadata (the updater stays disabled: an unsigned Mac app cannot update itself).
await writeFile(join(appRoot, 'app-update.yml'), 'updaterCacheDirName: rough-cut-updater\n');
await cp(join(root, 'release-policy.json'), join(appRoot, 'release-policy.json'));
const rendererAssetsRoot = join(appRoot, 'apps/desktop/dist/renderer/assets');
const rendererBundleNames = (await readdir(rendererAssetsRoot)).filter((name) => /^index-.*\.js$/.test(name)).sort();
if (rendererBundleNames.length !== 1) throw new Error(`Expected exactly one packaged renderer bundle, found ${rendererBundleNames.length}`);
const sourceIdentity = await releaseSourceIdentity(root, { extraFiles: ['scripts/package-mac.mjs', 'scripts/prepare-mac-tools.mjs', 'scripts/bundled-tools-mac.lock.json'] });
const electronVersion = JSON.parse(await readFile(join(root, 'apps/desktop/node_modules/electron/package.json'), 'utf8')).version;
await writeFile(join(appRoot, 'package-identity.json'), `${JSON.stringify({
  version: 1,
  platform: `darwin-${arch}`,
  sourceCommit: sourceIdentity.sourceCommit,
  sourceSha256: sourceIdentity.sourceSha256,
  electronVersion,
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

// 6. The bundle's identity: name, id, version, the privacy prompts' wording, and the icon.
//    The executable keeps Electron's name so its helper apps are still found; the user only sees "Rough Cut".
const plist = join(appBundle, 'Contents', 'Info.plist');
const setPlist = (key, type, value) => {
  const exists = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist]).status === 0;
  run('/usr/libexec/PlistBuddy', ['-c', exists ? `Set :${key} ${value}` : `Add :${key} ${type} ${value}`, plist]);
};
setPlist('CFBundleName', 'string', productName);
setPlist('CFBundleDisplayName', 'string', productName);
setPlist('CFBundleIdentifier', 'string', 'org.roughcut.desktop');
setPlist('CFBundleShortVersionString', 'string', desktopVersion.split('-')[0]);
setPlist('CFBundleVersion', 'string', desktopVersion);
setPlist('LSMinimumSystemVersion', 'string', '12.0');
setPlist('NSHumanReadableCopyright', 'string', 'AGPL-3.0-only');
setPlist('NSCameraUsageDescription', 'string', 'Rough Cut records your camera next to the screen when you turn the camera on.');
setPlist('NSMicrophoneUsageDescription', 'string', 'Rough Cut records your voice when you turn the microphone on.');
setPlist('NSScreenCaptureUsageDescription', 'string', 'Rough Cut records your screen.');
const iconset = join(artifactRoot, 'rough-cut.iconset');
await mkdir(iconset, { recursive: true });
const iconSource = join(root, 'apps/desktop/assets/rough-cut-mvp-icon.png');
for (const size of [16, 32, 128, 256, 512]) {
  run('sips', ['-z', String(size), String(size), iconSource, '--out', join(iconset, `icon_${size}x${size}.png`)]);
  run('sips', ['-z', String(size * 2), String(size * 2), iconSource, '--out', join(iconset, `icon_${size}x${size}@2x.png`)]);
}
run('iconutil', ['-c', 'icns', iconset, '-o', join(resourcesRoot, 'electron.icns')]);
await rm(iconset, { recursive: true, force: true });
await rm(join(resourcesRoot, 'default_app.asar'), { force: true });
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'RELEASE-NOTES.md', 'CHANGELOG.md']) await cp(join(root, name), join(artifactRoot, name)).catch(() => undefined);

// 7. Ad-hoc signature, inside out: loose binaries first (codesign --deep only reaches bundle-shaped code), then the
//    whole bundle. Apple Silicon refuses to run unsigned code; an ad-hoc signature is enough for that.
const machO = [join(resourcesRoot, 'bin', 'ffmpeg'), join(resourcesRoot, 'bin', 'ffprobe')];
for (const file of await readdir(join(appRoot, 'node_modules'), { recursive: true })) if (String(file).endsWith('.node')) machO.push(join(appRoot, 'node_modules', String(file)));
for (const file of machO) run('codesign', ['--force', '--sign', '-', '--timestamp=none', file]);
run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appBundle]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appBundle]);
run('xattr', ['-cr', appBundle]);

console.info(JSON.stringify({ ok: true, arch, artifactRoot, app: appBundle, executable: join(appBundle, 'Contents', 'MacOS', 'Electron') }, null, 2));

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
    filter: (path) => path !== join(source, 'node_modules') && !path.includes(join('node_modules', '.cache')),
  });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) await copyProductionDependencies(dependency, metadata, copied);
}
