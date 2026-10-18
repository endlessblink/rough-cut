// Wraps the portable package (dist/rough-cut-mvp-win32-x64) into release/windows: an NSIS installer and a portable zip.
//
//   pnpm build && node scripts/prepare-windows-tools.mjs && node scripts/package-windows.mjs && node scripts/build-windows-release.mjs
//
// Offline preparation only: nothing is published and the updater stays off. The installer is per-user (no admin
// rights) and, like the exe, UNSIGNED until a code-signing certificate exists, so Windows SmartScreen will warn.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Arch, Platform, build } from 'electron-builder';

if (process.platform !== 'win32') throw new Error('build-windows-release.mjs runs on Windows.');

const root = resolve(import.meta.dirname, '..');
const packageRoot = resolve(root, 'dist/rough-cut-mvp-win32-x64');
const projectMetadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = JSON.parse(await readFile(resolve(packageRoot, 'resources/app/package.json'), 'utf8')).version;

const result = await build({
  projectDir: resolve(packageRoot, 'resources/app'),
  prepackaged: packageRoot,
  targets: Platform.WINDOWS.createTarget(['nsis', 'zip'], Arch.x64),
  publish: 'never',
  config: {
    appId: 'org.roughcut.desktop',
    productName: 'Rough Cut',
    copyright: 'AGPL-3.0-only',
    electronVersion: '43.7.7',
    directories: { output: resolve(root, 'release/windows') },
    extraMetadata: { version, homepage: projectMetadata.homepage, repository: projectMetadata.repository },
    win: {
      icon: resolve(root, 'build-resources/windows-tools/rough-cut.ico'),
      // The exe already carries its icon and version info (scripts/package-windows.mjs set them with rcedit).
      signAndEditExecutable: false,
      artifactName: 'Rough-Cut-${version}-win-x64.${ext}',
    },
    nsis: {
      artifactName: 'Rough-Cut-${version}-Setup.${ext}',
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Rough Cut',
      // Recordings and projects live in the user's Documents folder; uninstalling must never touch them.
      deleteAppDataOnUninstall: false,
      license: resolve(root, 'LICENSE'),
    },
    // Packaging is offline preparation. Publication and updater activation are separate approvals.
    publish: null,
  },
});

console.info(JSON.stringify({ ok: true, artifacts: result }, null, 2));
