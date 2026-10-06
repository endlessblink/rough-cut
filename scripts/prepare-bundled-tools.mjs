import { mkdir, readFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
const root = process.cwd();
const lock = JSON.parse(await readFile(join(root, 'scripts/bundled-tools.lock.json'), 'utf8'));
const destination = join(root, 'build-resources/linux-tools');
const checksum = async (path) => { const hash = createHash('sha256'); for await (const part of createReadStream(path)) hash.update(part); return hash.digest('hex'); };
async function verify() { for (const [file, expected] of Object.entries(lock.files)) if (await checksum(join(destination, file)) !== expected) throw new Error(`Bundled tool integrity failed: ${file}`); }
try { await verify(); console.info('Preserved source-built tools match all pinned checksums.'); process.exit(0); } catch {}
const cache = resolve(process.env.ROUGH_CUT_TOOL_CACHE ?? join(root, 'build-resources/tool-cache'));
const archive = join(cache, lock.runtimeArchive.file);
if (await checksum(archive) !== lock.runtimeArchive.sha256) throw new Error('Preserved runtime archive checksum mismatch');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
execFileSync('tar', ['-xJf', archive, '-C', destination]);
await verify();
console.info('Restored preserved source-built media tools; no download or host package installation.');
