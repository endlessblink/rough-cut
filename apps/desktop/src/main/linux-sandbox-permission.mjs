// Ubuntu 24.04+ blocks the user namespaces Chromium's sandbox runs in, unless an AppArmor rule
// allows them for that program. The .deb installs that rule. The AppImage cannot, and its
// generated launcher then adds --no-sandbox, which Rough Cut refuses. Instead of starting
// unprotected, the AppImage asks once to add the same rule (password prompt), then runs the
// real app sandboxed as a child of this process (which keeps the AppImage mounted).
// This runs before Electron is ready (top-level await in the main module), so the question uses
// the desktop's own dialog tool (zenity/kdialog) like the portable launcher, not Electron's.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

export const APPIMAGE_PROFILE_NAME = 'rough-cut-appimage';
export const APPIMAGE_PROFILE_PATH = `/etc/apparmor.d/${APPIMAGE_PROFILE_NAME}`;
const SANDBOX_OFF_ARG = /^--(?:no-sandbox|disable-(?:setuid|gpu|seccomp-filter|namespace)-sandbox)(?:=|$)/;
const PROMPT = 'This version of Linux blocks the protection Rough Cut runs inside. Allow a small system rule just for Rough Cut (the same one the Debian package adds)? Your system will ask for your password once.';
const DENIED = 'Rough Cut cannot start without its protection. Nothing was changed. Start it again to allow it, or install the Debian package (.deb), which sets this up during install.';

export function sandboxDisabledByArgs(argv) {
  return argv.some((arg) => SANDBOX_OFF_ARG.test(arg));
}

// ROUGH_CUT_USERNS_RESTRICT_FILE is a test hook (same as the portable launcher's) to rehearse a restricted system.
export function userNamespacesRestricted({ readText = (path) => readFileSync(path, 'utf8'), env = process.env } = {}) {
  try {
    return readText(env.ROUGH_CUT_USERNS_RESTRICT_FILE || '/proc/sys/kernel/apparmor_restrict_unprivileged_userns').trim() === '1';
  } catch {
    return false;
  }
}

/** The same rule the .deb installs, attached to this binary wherever an AppImage mounts or extracts it. */
export function buildAppImageProfile(executableName) {
  return [
    'abi <abi/4.0>,',
    'include <tunables/global>',
    '',
    `profile ${APPIMAGE_PROFILE_NAME} "/{tmp/.mount_*,tmp/appimage_extracted_*}/${executableName}" flags=(unconfined) {`,
    '  userns,',
    '',
    `  include if exists <local/${APPIMAGE_PROFILE_NAME}>`,
    '}',
    '',
  ].join('\n');
}

/** The AppImage launcher added --no-sandbox: run the real app sandboxed instead. */
export function shouldHandOffAppImage({ platform = process.platform, env = process.env, argv = process.argv } = {}) {
  return platform === 'linux'
    && Boolean(env.APPIMAGE)
    && !(env.ELECTRON_DISABLE_SANDBOX && env.ELECTRON_DISABLE_SANDBOX !== '0')
    && !env.ROUGH_CUT_SANDBOX_HANDOFF
    && sandboxDisabledByArgs(argv.slice(1));
}

export function sandboxedChildArgs(argv) {
  return ['--enable-sandbox', ...argv.slice(1).filter((arg) => !SANDBOX_OFF_ARG.test(arg))];
}

const hasCommand = (name) => spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0;

/** Yes/no through the desktop's dialog tool; with none available, pkexec's own password prompt is the confirmation. */
function askWithDesktopDialog() {
  if (hasCommand('zenity')) return spawnSync('zenity', ['--question', '--no-markup', '--title', 'Rough Cut', '--ok-label', 'Allow', '--cancel-label', 'Quit', '--text', PROMPT], { stdio: 'ignore' }).status === 0;
  if (hasCommand('kdialog')) return spawnSync('kdialog', ['--title', 'Rough Cut', '--yesno', PROMPT], { stdio: 'ignore' }).status === 0;
  return true;
}

function tellWithDesktopDialog(text) {
  console.error(text);
  if (hasCommand('zenity')) spawnSync('zenity', ['--warning', '--no-markup', '--title', 'Rough Cut', '--text', text], { stdio: 'ignore' });
  else if (hasCommand('kdialog')) spawnSync('kdialog', ['--title', 'Rough Cut', '--msgbox', text], { stdio: 'ignore' });
}

function installProfileWithPkexec(profileText) {
  const workDir = mkdtempSync(join(tmpdir(), 'rough-cut-apparmor-'));
  const source = join(workDir, APPIMAGE_PROFILE_NAME);
  try {
    writeFileSync(source, profileText, 'utf8');
    return spawnSync('pkexec', ['sh', '-c', 'install -m 0644 "$1" "$2" && apparmor_parser --replace --write-cache --skip-read-cache "$2"', 'sh', source, APPIMAGE_PROFILE_PATH], { stdio: 'inherit' }).status === 0;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Never resolves: the process exits with the sandboxed app's exit code, or 64 when the rule
 * could not be added. Call it before anything else (single-instance lock, windows) runs.
 */
export function runAppImageSandboxed({
  argv = process.argv,
  env = process.env,
  execPath = process.execPath,
  restricted = userNamespacesRestricted({ env }),
  profileInstalled = existsSync(APPIMAGE_PROFILE_PATH),
  ask = askWithDesktopDialog,
  tell = tellWithDesktopDialog,
  installProfile = installProfileWithPkexec,
  spawnChild = spawn,
  exit = (code) => process.exit(code),
  onSignal = (signal, handler) => process.on(signal, handler),
} = {}) {
  if (restricted && !profileInstalled) {
    if (!ask() || !installProfile(buildAppImageProfile(basename(execPath)))) {
      tell(DENIED);
      exit(64);
      return new Promise(() => {});
    }
  }
  const child = spawnChild(execPath, sandboxedChildArgs(argv), { stdio: 'inherit', env: { ...env, ROUGH_CUT_SANDBOX_HANDOFF: '1' } });
  child.on('error', () => exit(64));
  child.on('exit', (code, signal) => exit(code ?? (signal ? 1 : 0)));
  // Closing this process (logout, kill) closes the app too.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) onSignal(signal, () => child.kill(signal));
  return new Promise(() => {});
}
