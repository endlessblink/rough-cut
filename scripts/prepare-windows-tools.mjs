// Fetches the pinned FFmpeg build that the Windows package ships, verifies it, and unpacks only what we ship.
//
//   node scripts/prepare-windows-tools.mjs            download (if needed), verify, extract to build-resources/windows-tools
//   node scripts/prepare-windows-tools.mjs --record   also (re)write the per-file hashes into the lock file
//
// The archive is pinned by URL and SHA-256 in scripts/bundled-tools-windows.lock.json. The pin was taken from the
// publisher's own winget manifest (Gyan.FFmpeg), an independent source from the download itself. The build is GPL-3.0
// (it contains libx264); Rough Cut is AGPL-3.0, so shipping it is fine, but the licence text and a pointer to the
// corresponding source go with the package (see docs/MEDIA-SOURCE-BUILD.md).

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(import.meta.dirname, '..');
const lockPath = join(root, 'scripts', 'bundled-tools-windows.lock.json');
const outDir = join(root, 'build-resources', 'windows-tools');
const cacheDir = join(root, 'build-resources', '.windows-tools-cache');
const record = process.argv.includes('--record');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

const sha256 = (file) => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', () => resolveHash(hash.digest('hex'))).on('error', reject);
});

mkdirSync(cacheDir, { recursive: true });
const archive = join(cacheDir, `ffmpeg-${lock.source.version}-full_build.zip`);

if (!existsSync(archive) || (await sha256(archive)) !== lock.source.zipSha256) {
  console.info(`[tools] downloading ${lock.source.url}`);
  const response = await fetch(lock.source.url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
}
const actual = await sha256(archive);
if (actual !== lock.source.zipSha256) {
  rmSync(archive, { force: true });
  throw new Error(`FFmpeg archive hash mismatch.\n  expected ${lock.source.zipSha256}\n  actual   ${actual}\nThe download was removed; nothing was extracted.`);
}
console.info(`[tools] archive verified (${lock.source.zipSha256.slice(0, 12)}…)`);

const extractDir = join(cacheDir, 'extract');
rmSync(extractDir, { recursive: true, force: true });
mkdirSync(extractDir, { recursive: true });
// Windows' own bsdtar reads zip files. Call it by full path: a GNU tar earlier on PATH (Git for Windows) reads
// `C:` as a remote host.
const systemTar = join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe');
const untar = spawnSync(existsSync(systemTar) ? systemTar : 'tar', ['-xf', archive, '-C', extractDir], { encoding: 'utf8' });
if (untar.status !== 0) throw new Error(`Could not extract the archive: ${untar.stderr}`);
const top = readdirSync(extractDir).find((name) => name.startsWith('ffmpeg-'));
if (!top) throw new Error('Unexpected archive layout (no ffmpeg-* folder).');
const base = join(extractDir, top);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'bin'), { recursive: true });
mkdirSync(join(outDir, 'licenses'), { recursive: true });
for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) copyFileSync(join(base, 'bin', exe), join(outDir, 'bin', exe));
for (const doc of ['LICENSE', 'README.txt']) if (existsSync(join(base, doc))) copyFileSync(join(base, doc), join(outDir, 'licenses', doc));

const files = {};
for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) files[`bin/${exe}`] = await sha256(join(outDir, 'bin', exe));
if (record) {
  lock.files = files;
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.info('[tools] recorded file hashes in the lock file');
} else {
  for (const [name, expected] of Object.entries(lock.files ?? {})) {
    if (files[name] !== expected) throw new Error(`Bundled tool integrity check failed: ${name}`);
  }
  console.info('[tools] file hashes match the lock file');
}
rmSync(extractDir, { recursive: true, force: true });
console.info(`[tools] ready: ${outDir}`);
