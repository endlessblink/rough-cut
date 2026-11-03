// Fetches the pinned FFmpeg build that the Mac package ships, verifies it, and unpacks only what we ship.
//
//   node scripts/prepare-mac-tools.mjs [--arch arm64|x64]   download (if needed), verify, extract to build-resources/mac-tools
//
// The zips are pinned by URL and SHA-256 in scripts/bundled-tools-mac.lock.json, and so are the two binaries inside.
// The build is GPL-3.0 (it contains libx264); Rough Cut is AGPL-3.0, so shipping it is fine, but the licence text
// and a pointer to the corresponding source go with the package (see docs/MEDIA-SOURCE-BUILD.md).
// Runs on any OS (it only downloads and unzips), so the pin can be checked from Linux too.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arch = args.includes('--arch') ? args[args.indexOf('--arch') + 1] : process.arch;
const lock = JSON.parse(await readFile(join(root, 'scripts', 'bundled-tools-mac.lock.json'), 'utf8'));
const sources = lock.source[arch];
const expectedFiles = lock.files[arch];
if (!sources || !expectedFiles) throw new Error(`No pinned Mac tools for arch "${arch}" (expected arm64 or x64).`);

const outDir = join(root, 'build-resources', 'mac-tools');
const cacheDir = join(root, 'build-resources', '.mac-tools-cache');
const sha256 = (file) => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('end', () => resolveHash(hash.digest('hex'))).on('error', reject);
});

mkdirSync(cacheDir, { recursive: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'bin'), { recursive: true });
mkdirSync(join(outDir, 'licenses'), { recursive: true });

for (const [tool, { url, zipSha256 }] of Object.entries(sources)) {
  const archive = join(cacheDir, `${tool}-${lock.source.version}-${arch}.zip`);
  if (!existsSync(archive) || (await sha256(archive)) !== zipSha256) {
    console.info(`[mac-tools] downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  }
  const actual = await sha256(archive);
  if (actual !== zipSha256) {
    rmSync(archive, { force: true });
    throw new Error(`${tool} archive hash mismatch.\n  expected ${zipSha256}\n  actual   ${actual}\nThe download was removed; nothing was extracted.`);
  }
  const extractDir = join(cacheDir, `extract-${tool}`);
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  const unzip = spawnSync('unzip', ['-oq', archive, '-d', extractDir], { encoding: 'utf8' });
  if (unzip.status !== 0) throw new Error(`Could not extract ${archive}: ${unzip.stderr}`);
  const binary = readdirSync(extractDir, { recursive: true }).map(String).find((name) => name.split(/[\\/]/).pop() === tool);
  if (!binary) throw new Error(`Unexpected archive layout: no ${tool} in ${archive}.`);
  const target = join(outDir, 'bin', tool);
  copyFileSync(join(extractDir, binary), target);
  chmodSync(target, 0o755);
  const binarySha = await sha256(target);
  if (binarySha !== expectedFiles[`bin/${tool}`]) throw new Error(`Bundled tool integrity check failed: bin/${tool}`);
  rmSync(extractDir, { recursive: true, force: true });
  console.info(`[mac-tools] ${tool} ${arch} verified (${binarySha.slice(0, 12)}…)`);
}

writeFileSync(join(outDir, 'licenses', 'README.txt'), [
  `FFmpeg ${lock.source.version} static build for macOS (${arch}) by Martin Riedl: ${lock.source.homepage}`,
  `Licence: ${lock.source.license} (built with --enable-gpl --enable-libx264). FFmpeg source: https://ffmpeg.org/download.html`,
  'See docs/MEDIA-SOURCE-BUILD.md in the Rough Cut repository for how to obtain the corresponding source.',
  '',
].join('\n'));
console.info(`[mac-tools] ready: ${outDir}`);
