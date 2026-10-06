import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export async function releaseSourceIdentity(root) {
  const files = [];
  const collect = async (path) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await collect(child);
      else if (entry.isFile()) files.push(child);
      else throw new Error(`Release source must not contain a symlink: ${relative(root, child)}`);
    }
  };
  await collect(join(root, 'apps/desktop/src'));
  for (const name of ['project-model', 'timeline-engine', 'effect-registry', 'frame-resolver']) {
    await collect(join(root, 'packages', name, 'src'));
    files.push(join(root, 'packages', name, 'package.json'));
  }
  files.push(...['package.json', 'pnpm-lock.yaml', 'release-policy.json',
    'apps/desktop/package.json', 'scripts/package-linux.mjs',
    'scripts/bundled-tools.lock.json', 'scripts/lib/release-source-identity.mjs'].map((name) => join(root, name)));
  const entries = await Promise.all(files.sort().map(async (path) => ({
    path: relative(root, path),
    sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
  })));
  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  return { version: 1, sourceCommit, files: entries,
    sourceSha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex') };
}
