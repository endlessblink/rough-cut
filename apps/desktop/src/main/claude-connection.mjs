import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

// Logging out of Rough Cut only. Claude Code's own login (terminal, other tools) is left alone: the app just stops
// using it until Connect Claude is pressed again. The state is one small marker file in the app's data folder.
let disconnectMarker = null;
export function configureClaudeDisconnect(path) { disconnectMarker = path; }
export const isClaudeDisconnected = () => Boolean(disconnectMarker && existsSync(disconnectMarker));
export function setClaudeDisconnected(value) {
  if (!disconnectMarker) return;
  if (value) writeFileSync(disconnectMarker, 'Rough Cut is disconnected from Claude. Claude Code itself is still signed in.');
  else rmSync(disconnectMarker, { force: true });
}

export const CLAUDE_MINIMUM_VERSION = '2.1.248';
const API_ENVIRONMENT_NAMES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];
function probe(binary, args, spawnImpl, env = process.env) {
  return new Promise(resolve => {
    const child = spawnImpl(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, env });
    let stdout = '';
    child.stdout.on('data', chunk => { if (stdout.length < 65536) stdout += String(chunk); });
    child.stderr.on('data', () => {});
    child.on('error', () => resolve({ code: -1, stdout: '' }));
    child.on('close', code => resolve({ code, stdout }));
  });
}

const SETUP_ACTIONS = { login: ['auth', 'login'], update: ['update'] };
export const CLAUDE_INSTALL_URL = 'https://docs.claude.com/en/docs/claude-code/setup';

// Runs the official CLI on the user's click so they never need a terminal.
// `login` opens Anthropic's browser sign-in and returns when it ends. This app
// never sees the password or tokens; it only waits for the CLI to finish.
export function runClaudeSetup({ binary, action, env = process.env, spawnImpl = spawn, timeoutMs = 300000 } = {}) {
  return new Promise(resolve => {
    const args = SETUP_ACTIONS[action];
    if (!binary || !args) { resolve({ ok: false, code: -1 }); return; }
    let settled = false;
    const done = result => { if (!settled) { settled = true; resolve(result); } };
    const child = spawnImpl(binary, args, { stdio: ['ignore', 'ignore', 'ignore'], timeout: timeoutMs, env });
    child.on('error', () => done({ ok: false, code: -1 }));
    child.on('close', code => done({ ok: code === 0, code }));
  });
}

// Anthropic's own installer (the same command their setup page shows). It is only
// run when the user clicks Connect and Claude Code is not on the computer yet.
export function claudeInstallerCommand(platform = process.platform) {
  return platform === 'win32'
    ? { command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'] }
    : { command: 'bash', args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'] };
}

export function runClaudeInstaller({ platform = process.platform, spawnImpl = spawn, timeoutMs = 600000 } = {}) {
  return new Promise(resolve => {
    const { command, args } = claudeInstallerCommand(platform);
    let settled = false;
    const done = result => { if (!settled) { settled = true; resolve(result); } };
    const child = spawnImpl(command, args, { stdio: ['ignore', 'ignore', 'ignore'], timeout: timeoutMs });
    child.on('error', () => done({ ok: false, code: -1 }));
    child.on('close', code => done({ ok: code === 0, code }));
  });
}

// One button: install if missing, update if too old, sign in if needed, then report.
// Each step is injected so tests never touch a real CLI or account.
export async function connectClaude({ resolveBinary, env = process.env, inspect = inspectClaudeSubscription, install = runClaudeInstaller, setup = runClaudeSetup } = {}) {
  setClaudeDisconnected(false);
  let result = await inspect({ binary: resolveBinary(), env });
  if (result.status === 'missing') {
    await install();
    result = await inspect({ binary: resolveBinary(), env });
  }
  if (result.status === 'unsupported-version') {
    await setup({ binary: resolveBinary(), action: 'update', env });
    result = await inspect({ binary: resolveBinary(), env });
  }
  if (result.status === 'not-signed-in') {
    await setup({ binary: resolveBinary(), action: 'login', env });
    result = await inspect({ binary: resolveBinary(), env });
  }
  return result;
}

// Read-only CLI metadata, never credentials or a model request. Do not forward
// identity fields (email, organization, tokens) to the renderer or diagnostics.
export async function inspectClaudeSubscription({ binary, env = process.env, spawnImpl = spawn } = {}) {
  const failure = (status, reason, extra = {}) => ({ ok: false, status, reason, ...extra });
  if (isClaudeDisconnected()) return failure('not-signed-in', 'Rough Cut is logged out of Claude. Press Connect Claude to use your subscription again.');
  if (!binary) return failure('missing', 'Install Claude Code, then run claude auth login to connect your subscription.');

  // Strip ANTHROPIC_* env vars that block subscription login. Pass cleaned env to claude spawns.
  const strippedVars = [];
  let cleanEnv = env;
  if (API_ENVIRONMENT_NAMES.some(name => Boolean(env[name]))) {
    cleanEnv = { ...env };
    for (const name of API_ENVIRONMENT_NAMES) {
      if (cleanEnv[name]) {
        strippedVars.push(name);
        delete cleanEnv[name];
      }
    }
  }

  const versionResult = await probe(binary, ['--version'], spawnImpl, cleanEnv);
  const match = versionResult.stdout.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  if (versionResult.code !== 0 || !match) return failure('unavailable', 'Could not check Claude Code. Run claude --version in your terminal.');
  const version = match.slice(1).join('.');
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major < 2 || (major === 2 && (minor < 1 || (minor === 1 && patch < 248)))) return failure('unsupported-version', `Claude Code ${CLAUDE_MINIMUM_VERSION} or later is required. Update Claude Code, then check again.`, { version });
  const result = await probe(binary, ['auth', 'status'], spawnImpl, cleanEnv);
  let status;
  try { status = JSON.parse(result.stdout); } catch { return failure('unavailable', 'Could not check your Claude connection. Run claude auth status, then check again.', { version }); }
  if (!status.loggedIn || result.code !== 0) return failure('not-signed-in', 'Sign in or renew your login with claude auth login, then check again.', { version });
  if (status.authMethod !== 'claude.ai') return failure('api-mode', 'Connect your Claude subscription with claude auth login. API billing and other provider connections are not used by this app. No AI request was sent.', { version });
  const subscriptionType = String(status.subscriptionType ?? '').toLowerCase();
  if (!['pro', 'max', 'team', 'teams', 'enterprise'].includes(subscriptionType)) return failure('subscription-required', 'A Claude plan with Claude Code access is required. Check your subscription in Claude Code, then check again.', { version });

  let reason = 'Connected through your Claude Code subscription. Your plan limits apply.';
  if (strippedVars.length > 0) {
    reason = `Found ${strippedVars.length} environment variable(s) from launchctl (${strippedVars.join(', ')}) that were blocking your subscription. These were removed from Claude's environment. If the connection still fails, clear them with: launchctl unsetenv ${strippedVars[0]}`;
  }
  return { ok: true, status: 'ready', version, subscriptionType, reason };
}
