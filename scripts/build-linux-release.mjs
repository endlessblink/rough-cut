import { build, Platform, Arch } from 'electron-builder';
import { resolve, join } from 'node:path';
import { cp, mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const root = process.cwd();
const projectMetadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
// The portable app already contains the verified flat production dependency graph.
// Stage outside the pnpm workspace so electron-builder's collector does not
// apply workspace filters to this standalone application. No dependency install.
const stage = await mkdtemp(join(tmpdir(), 'rough-cut-distribution-'));
try {
await cp(resolve(root, 'dist/rough-cut-mvp-linux-x64/resources/app'), stage, { recursive: true });
await build({
  projectDir: stage,
  targets: Platform.LINUX.createTarget(['AppImage', 'deb'], Arch.x64),
  publish: 'never',
  config: {
    appId: 'org.roughcut.desktop', productName: 'RoughCut',
    electronVersion: '43.7.7', electronDist: resolve(root, 'apps/desktop/node_modules/electron/dist'),
    directories: { app: stage, output: resolve(root, 'release') },
    asar: false, npmRebuild: false,
    files: ['**/*'],
    extraResources: ['bin', 'media-tools', 'licenses', 'bundled-tools.json'].map((name) => ({ from: resolve(root, 'dist/rough-cut-mvp-linux-x64/resources', name), to: name })),
    extraMetadata: { desktopName: 'rough-cut.desktop', homepage: projectMetadata.homepage, repository: projectMetadata.repository },
    linux: { syncDesktopName: true, desktop: { entry: { Name: 'Rough Cut' } }, maintainer: 'Rough Cut contributors', executableName: 'rough-cut', category: 'AudioVideo', icon: resolve(root, 'apps/desktop/assets/rough-cut-mvp-icon.png'), artifactName: 'Rough-Cut-${version}-${arch}.${ext}', synopsis: 'Screen recording and video editing' },
    deb: { depends: ['libc6 (>= 2.35)', 'libgtk-3-0', 'libnss3', 'libxss1', 'libasound2', 'libxtst6', 'libx11-xcb1', 'libdrm2', 'libgbm1', 'libxrandr2', 'libxi6', 'libxinerama1', 'libxcursor1', 'libxfixes3', 'libxkbcommon0'] },
    // Packaging is offline preparation. Publication and updater activation are separate approvals.
    publish: null,
  },
});

} finally { await rm(stage, { recursive: true, force: true }); }
