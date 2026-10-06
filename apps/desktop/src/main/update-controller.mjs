import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, createPublicKey, verify, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const semver = createRequire(require.resolve('electron-updater'))('semver');
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function validateReleasePolicy(value, { allowLoopbackForTests = false } = {}) {
  if (value?.approved !== true || !value?.url) return null;
  if (value.provider === 'github') {
    if (value.owner !== 'endlessblink' || value.repo !== 'rough-cut' || value.url !== 'https://github.com/endlessblink/rough-cut/releases/' || value.channel !== 'beta') throw new Error('Unapproved GitHub release destination.');
    if (value.activated !== true) return null;
    if (createPublicKey(value.publisherPublicKey ?? '').asymmetricKeyType !== 'ed25519') throw new Error('A pinned Ed25519 publisher key is required.');
    return {url:value.url,channel:value.channel,provider:'github',owner:value.owner,repo:value.repo,publisherPublicKey:value.publisherPublicKey};
  }
  const url = new URL(value.url);
  const loopback = allowLoopbackForTests && ['127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!loopback && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) throw new Error('Update feed must use an approved HTTPS URL without credentials or query parameters.');
  if (!['beta', 'latest'].includes(value.channel)) throw new Error('Unsupported update channel.');
  return { url: url.href, channel: value.channel };
}

export function publisherSignaturePayload(info) {
  return Buffer.from(JSON.stringify({ version: info.version, platform: 'linux', arch: 'x64', files: info.files.map(({ url, sha512 }) => ({ url, sha512 })) }));
}

export function validateUpdateInfo(info, { currentVersion, feedURL, publisherPublicKey = null, provider = null }) {
  if (!semver.valid(info?.version) || !semver.gt(info.version, currentVersion)) throw new Error('Update is not a newer valid version.');
  if (!Array.isArray(info.files) || info.files.length === 0) throw new Error('Update has no integrity-checked files.');
  const feed = new URL(feedURL);
  if (provider === 'github') {
    if (!publisherPublicKey || typeof info.publisherSignature !== 'string') throw new Error('Signed publisher metadata is required.');
    if (info.tag && info.tag !== `v${info.version}`) throw new Error('Release tag/version mismatch.');
    const payload = publisherSignaturePayload(info);
    const sig=Buffer.from(info.publisherSignature,'base64');
    if (sig.length !== 64 || sig.toString('base64') !== info.publisherSignature || !verify(null,payload,createPublicKey(publisherPublicKey),sig)) throw new Error('Publisher signature verification failed.');
  }
  for (const file of info.files) {
    if (typeof file.sha512 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) || Buffer.from(file.sha512, 'base64').length !== 64) throw new Error('Update file is missing a SHA512 checksum.');
    let url;
    if (provider === 'github') {
      const releaseBase = `https://github.com/endlessblink/rough-cut/releases/download/v${info.version}/`;
      if (typeof file.url !== 'string' || !/^[A-Za-z0-9._-]+\.AppImage$/.test(file.url)) throw new Error('Invalid release asset path.');
      url = new URL(file.url, releaseBase);
      if (!url.href.startsWith(releaseBase) || url.pathname.slice(new URL(releaseBase).pathname.length).includes('/')) throw new Error('Asset is not in the signed release.');
    } else url = new URL(file.url, feed);
    if (url.origin !== feed.origin || url.username || url.password || url.hash || url.search || !url.pathname.endsWith('.AppImage')) throw new Error('Update file is outside the approved feed or is not an AppImage.');
  }
  return info;
}

function requireRegularImage(path) {
  if (!isAbsolute(path ?? '') || path.includes('\0')) throw new Error('AppImage must have an absolute path.');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('AppImage must be a regular file.');
  return stat;
}

function atomicCopy(source, destination) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try { copyFileSync(source, temporary, constants.COPYFILE_EXCL); renameSync(temporary, destination); }
  finally { rmSync(temporary, { force: true }); }
}

export function saveUpdateBackup({ appImagePath, journalPath, version }) {
  requireRegularImage(appImagePath);
  const backupPath = `${appImagePath}.previous`;
  if (existsSync(backupPath)) requireRegularImage(backupPath);
  atomicCopy(appImagePath, backupPath);
  mkdirSync(dirname(journalPath), { recursive: true });
  const journal = { version: 1, originalPath: appImagePath, destinationPath: appImagePath, backupPath, previousVersion: version, previousSha256: hash(backupPath) };
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  return journal;
}

export function restoreUpdateBackup({ appImagePath, journalPath }) {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  if (journal.version !== 1 || journal.destinationPath !== appImagePath || dirname(journal.backupPath) !== dirname(appImagePath) || journal.backupPath !== `${journal.originalPath}.previous`) throw new Error('Rollback journal does not match this AppImage.');
  requireRegularImage(journal.backupPath);
  if (hash(journal.backupPath) !== journal.previousSha256) throw new Error('Rollback backup integrity check failed.');
  if (existsSync(appImagePath)) requireRegularImage(appImagePath);
  atomicCopy(journal.backupPath, appImagePath);
  return { version: journal.previousVersion, sha256: journal.previousSha256 };
}

export function createUpdateController({ backend, releasePolicy, appImagePath, userDataDir, version, isBusy = () => false, onStatus = () => {}, allowLoopbackForTests = false } = {}) {
  let policy;
  let state = { status: 'disabled', reason: releasePolicy?.provider === 'github' && releasePolicy?.approved === true && releasePolicy?.activated !== true ? 'Updates are inactive until signed-release and install/rollback acceptance are verified.' : 'Release destination is not approved.' };
  const journalPath = join(userDataDir, 'update-rollback.json');
  let downloaded = null;
  let checking = null;
  try { policy = validateReleasePolicy(releasePolicy, { allowLoopbackForTests }); } catch { state = { status: 'disabled', reason: 'Invalid update policy.' }; }
  if (!appImagePath) state = { status: 'unsupported', reason: 'Use your package manager for this build; in-app updates use AppImage.' };
  const set = (next) => { state = next; onStatus({ ...state }); };
  if (policy && appImagePath && backend) {
    // electron-updater's staged-rollout ID is unnecessary here. Never create or transmit a user identifier.
    backend.getOrCreateStagingUserId = async () => '00000000-0000-4000-8000-000000000000';
    const computeHeaders = backend.computeFinalHeaders?.bind(backend);
    if (computeHeaders) backend.computeFinalHeaders = (headers) => {
      const result = computeHeaders(headers);
      for (const key of Object.keys(result)) if (key.toLowerCase() === 'x-user-staging-id') delete result[key];
      return result;
    };
    backend.autoDownload = false; // validate the feed before any download
    backend.autoInstallOnAppQuit = false; // never interrupt recording or silently restart
    backend.channel = policy.channel;
    backend.allowPrerelease = policy.channel === 'beta';
    backend.allowDowngrade = false;
    backend.setFeedURL(policy.provider === 'github' ? {provider:'github',owner:policy.owner,repo:policy.repo,private:false,channel:policy.channel} : { provider: 'generic', url: policy.url, channel: policy.channel });
    backend.on('error', () => {
      downloaded = null;
      let recovered = false;
      if (state.status === 'install-requested' && !existsSync(appImagePath)) {
        try { restoreUpdateBackup({ appImagePath, journalPath }); recovered = true; } catch {}
      }
      set({ status: 'error', reason: recovered ? 'Installation failed. The verified previous version was restored.' : 'Update failed. No successful installation is claimed; your previous-version backup remains available if installation had begun.' });
    });
    backend.on('appimage-filename-updated', (destinationPath) => {
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
      if (dirname(destinationPath) !== dirname(appImagePath)) throw new Error('Unexpected update destination.');
      writeFileSync(journalPath, JSON.stringify({ ...journal, destinationPath }, null, 2) + '\n', { mode: 0o600 });
    });
    state = { status: 'idle' };
  }
  return {
    status: () => ({ ...state }),
    async check() {
      if (!policy || !appImagePath || !backend) return { ...state };
      if (checking) return checking;
      checking = (async () => {
        try {
          set({ status: 'checking' });
          const result = await backend.checkForUpdates();
          if (!result?.updateInfo || !semver.gt(result.updateInfo.version, version)) { set({ status: 'current' }); return state; }
          validateUpdateInfo(result.updateInfo, { currentVersion: version, feedURL: policy.url,publisherPublicKey:policy.publisherPublicKey,provider:policy.provider });
          set({ status: 'downloading', version: result.updateInfo.version });
          await backend.downloadUpdate(); // electron-updater checks SHA512 before declaring success
          downloaded = result.updateInfo.version;
          set({ status: 'downloaded', version: downloaded });
        } catch { downloaded = null; set({ status: 'error', reason: 'Update check or integrity-checked download failed. Your current version was not replaced.' }); }
        finally { checking = null; }
        return { ...state };
      })();
      return checking;
    },
    install() {
      if (!downloaded) return { status: 'not-ready' };
      if (isBusy()) return { status: 'busy' };
      try {
        saveUpdateBackup({ appImagePath, journalPath, version });
        set({ status: 'install-requested', version: downloaded });
        backend.quitAndInstall(false, true);
        return { ...state };
      } catch { set({ status: 'error', reason: 'Update could not be installed. Use the verified previous-version backup if necessary.' }); return { ...state }; }
    },
    rollback() {
      if (isBusy()) return { status: 'busy' };
      return restoreUpdateBackup({ appImagePath, journalPath });
    },
    canRollback: () => existsSync(journalPath),
  };
}
