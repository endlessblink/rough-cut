import { copyFileSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const hooksPath = join(homedir(), '.codex', 'hooks.json');
const command = `node "${join(root, 'scripts', 'ui-visual-proof-hook.mjs')}"`;
const config = JSON.parse(readFileSync(hooksPath, 'utf8'));
config.hooks ??= {};
config.hooks.Stop ??= [];

const installed = config.hooks.Stop.some((entry) =>
  entry.hooks?.some((hook) => hook.command === command));

if (!installed) {
  config.hooks.Stop.push({
    matcher: '.*',
    hooks: [{
      type: 'command',
      command,
      timeout: 10,
      statusMessage: 'Requiring fresh UI visual proof',
    }],
  });
  const backupPath = `${hooksPath}.before-rough-cut-visual-proof`;
  const temporaryPath = `${hooksPath}.tmp-rough-cut-visual-proof`;
  copyFileSync(hooksPath, backupPath);
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(temporaryPath, hooksPath);
}

process.stdout.write(installed ? 'Visual proof hook already installed.\n' : 'Installed visual proof Stop hook.\n');
