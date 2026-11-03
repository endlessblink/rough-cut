// Wraps the Mac app (dist/rough-cut-mvp-darwin-<arch>/Rough Cut.app) into release/mac: a disk image and a zip, plus
// SHA-256 checksums.
//
//   pnpm build && node scripts/prepare-mac-tools.mjs && node scripts/package-mac.mjs && node scripts/build-mac-release.mjs
//
// Offline preparation only: nothing is published. Uses only the Mac's own tools (ditto, hdiutil), no signing
// identity: the app inside is ad-hoc signed and not notarized, so macOS asks the user to confirm the first launch.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { macReleaseManifest } from './lib/mac-release-metadata.mjs';

if (process.platform !== 'darwin') throw new Error('build-mac-release.mjs runs on a Mac.');

const root = resolve(import.meta.dirname, '..');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const appBundle = join(root, 'dist', `rough-cut-mvp-darwin-${arch}`, 'Rough Cut.app');
const version = JSON.parse(await readFile(join(appBundle, 'Contents/Resources/app/package.json'), 'utf8')).version;
const outDir = join(root, 'release', 'mac');
const base = `Rough-Cut-${version}-mac-${arch}`;
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed: ${(result.stderr || result.stdout || '').trim().slice(-600)}`);
};

await mkdir(outDir, { recursive: true });
const zipPath = join(outDir, `${base}.zip`);
const dmgPath = join(outDir, `${base}.dmg`);
await rm(zipPath, { force: true });
await rm(dmgPath, { force: true });

// ditto keeps the bundle's symlinks and signature intact (a plain zip would break the signature).
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appBundle, zipPath]);

// The disk image shows the app next to an Applications shortcut, the usual drag-to-install window.
const staging = join(root, 'dist', `mac-dmg-staging-${arch}`);
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
run('ditto', [appBundle, join(staging, 'Rough Cut.app')]);
await symlink('/Applications', join(staging, 'Applications'));
run('hdiutil', ['create', '-volname', `Rough Cut ${version}`, '-srcfolder', staging, '-ov', '-format', 'UDZO', dmgPath]);
await rm(staging, { recursive: true, force: true });

const baseVersion = JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8')).version;
const manifestPath = join(outDir, 'mac-latest.json');
await writeFile(manifestPath, `${JSON.stringify(macReleaseManifest(version, `v${baseVersion}`), null, 2)}\n`);
const lines = [];
for (const file of [dmgPath, zipPath, manifestPath]) {
  lines.push(`${createHash('sha256').update(await readFile(file)).digest('hex')} *${file.split('/').pop()}`);
}
const sums = join(outDir, `SHA256SUMS-mac-${arch}-${version.replace(/^.*-/, '')}.txt`);
await writeFile(sums, `${lines.join('\n')}\n`);
console.info(JSON.stringify({ ok: true, arch, files: [dmgPath, zipPath, manifestPath, sums] }, null, 2));
