import { spawn } from 'node:child_process';

export const CLAUDE_MINIMUM_VERSION = '2.1.248';
const API_ENVIRONMENT_NAMES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];
function probe(binary, args, spawnImpl) {
  return new Promise(resolve => {
    const child = spawnImpl(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
    let stdout = '';
    child.stdout.on('data', chunk => { if (stdout.length < 65536) stdout += String(chunk); });
    child.stderr.on('data', () => {});
    child.on('error', () => resolve({ code: -1, stdout: '' }));
    child.on('close', code => resolve({ code, stdout }));
  });
}

// Read-only CLI metadata, never credentials or a model request. Do not forward
// identity fields (email, organization, tokens) to the renderer or diagnostics.
export async function inspectClaudeSubscription({ binary, env = process.env, spawnImpl = spawn } = {}) {
  const failure = (status, reason, extra = {}) => ({ ok: false, status, reason, ...extra });
  if (!binary) return failure('missing', 'Install Claude Code, then run claude auth login to connect your subscription.');
  if (API_ENVIRONMENT_NAMES.some(name => Boolean(env[name]))) return failure('api-mode', 'This app uses your Claude subscription. API or third-party provider settings are active; launch without those settings and sign in with claude auth login. No AI request was sent.');
  const versionResult = await probe(binary, ['--version'], spawnImpl);
  const match = versionResult.stdout.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  if (versionResult.code !== 0 || !match) return failure('unavailable', 'Could not check Claude Code. Run claude --version in your terminal.');
  const version = match.slice(1).join('.');
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major < 2 || (major === 2 && (minor < 1 || (minor === 1 && patch < 248)))) return failure('unsupported-version', `Claude Code ${CLAUDE_MINIMUM_VERSION} or later is required. Update Claude Code, then check again.`, { version });
  const result = await probe(binary, ['auth', 'status'], spawnImpl);
  let status;
  try { status = JSON.parse(result.stdout); } catch { return failure('unavailable', 'Could not check your Claude connection. Run claude auth status, then check again.', { version }); }
  if (!status.loggedIn || result.code !== 0) return failure('not-signed-in', 'Sign in or renew your login with claude auth login, then check again.', { version });
  if (status.authMethod !== 'claude.ai') return failure('api-mode', 'Connect your Claude subscription with claude auth login. API billing and other provider connections are not used by this app. No AI request was sent.', { version });
  const subscriptionType = String(status.subscriptionType ?? '').toLowerCase();
  if (!['pro', 'max', 'team', 'teams', 'enterprise'].includes(subscriptionType)) return failure('subscription-required', 'A Claude plan with Claude Code access is required. Check your subscription in Claude Code, then check again.', { version });
  return { ok: true, status: 'ready', version, subscriptionType, reason: 'Connected through your Claude Code subscription. Your plan limits apply.' };
}
