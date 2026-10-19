import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { createReadStream, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { publisherSignaturePayload, UPDATE_PLATFORMS, validateUpdateInfo } from '../apps/desktop/src/main/update-controller.mjs';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const semver = createRequire(require.resolve('electron-updater'))('semver');
const destination = 'https://github.com/endlessblink/rough-cut/releases/';
// The artifact is the AppImage on Linux and the Setup.exe installer on Windows; the platform is part of what is signed.
const artifactOf = (platform, { appImagePath, installerPath }) => (platform === 'win32' ? installerPath : appImagePath);
function requirePlatform(platform) {
  if (!UPDATE_PLATFORMS[platform]) throw new Error('Unsupported update platform.');
  return UPDATE_PLATFORMS[platform];
}
export async function prepareMetadata({ version, appImagePath, installerPath, platform = 'linux' }) {
  const rules = requirePlatform(platform);
  if (!semver.valid(version) || semver.prerelease(version)?.[0] !== 'beta') throw new Error('A valid beta version is required.');
  const artifactPath = artifactOf(platform, { appImagePath, installerPath });
  const file = lstatSync(artifactPath);
  if (!file.isFile() || file.isSymbolicLink() || !rules.assetPattern.test(basename(artifactPath))) throw new Error(`A regular ${platform === 'win32' ? 'Windows installer (Rough-Cut-<version>-Setup.exe)' : 'AppImage'} with a safe asset basename is required.`);
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(artifactPath)) hash.update(chunk);
  const sha512 = hash.digest('base64');
  return { version, files: [{ url: basename(artifactPath), sha512, size: file.size }], path: basename(artifactPath), sha512 };
}
export function signMetadata({ metadata, encryptedKeyPath, passphrase, platform = 'linux' }) {
  requirePlatform(platform);
  if (!semver.valid(metadata.version) || semver.prerelease(metadata.version)?.[0] !== 'beta') throw new Error('Only the approved beta channel may be signed.');
  const stat = lstatSync(encryptedKeyPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error('Private key must be an owner-only regular file.');
  const pem = readFileSync(encryptedKeyPath, 'utf8');
  if (!pem.startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----')) throw new Error('An encrypted PKCS8 private key is required.');
  const key = createPrivateKey({ key: pem, format: 'pem', passphrase });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 publisher key is required.');
  const signed = { ...metadata, publisherSignature: sign(null, publisherSignaturePayload(metadata, platform), key).toString('base64') };
  validateUpdateInfo(signed, { currentVersion: '0.0.0', feedURL: destination, provider: 'github', publisherPublicKey: createPublicKey(key).export({ type: 'spki', format: 'pem' }), platform });
  return signed;
}
export function verifyMetadata({ metadata, publicKeyPath, currentVersion, platform = 'linux' }) {
  requirePlatform(platform);
  return validateUpdateInfo(metadata, { currentVersion, feedURL: destination, provider: 'github', publisherPublicKey: readFileSync(publicKeyPath, 'utf8'), platform });
}
export async function verifyArtifactMetadata({ metadata, appImagePath, installerPath, platform = 'linux' }) {
  const actual = await prepareMetadata({ version: metadata.version, appImagePath, installerPath, platform });
  if (metadata.files?.length !== 1 || metadata.files[0].url !== actual.files[0].url || metadata.files[0].sha512 !== actual.files[0].sha512 || metadata.files[0].size !== actual.files[0].size) throw new Error('Artifact bytes, size or filename differ from the metadata.');
  return actual;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || args[i + 1] === undefined || options[args[i]] !== undefined) throw new Error('Invalid arguments.');
    options[args[i]] = args[i + 1];
  }
  // Linux (default): --appimage <file>. Windows: --platform win32 --installer <Rough-Cut-<version>-Setup.exe>.
  const platform = options['--platform'] ?? 'linux';
  const artifacts = { appImagePath: options['--appimage'], installerPath: options['--installer'] };
  let result;
  if (command === 'prepare') result = await prepareMetadata({ version: options['--version'], ...artifacts, platform });
  else if (command === 'sign') {
    const fd = Number(options['--passphrase-fd']);
    if (!Number.isInteger(fd) || fd < 3) throw new Error('Supply the passphrase through a private file descriptor >=3.');
    const metadata = JSON.parse(readFileSync(options['--metadata'], 'utf8'));
    await verifyArtifactMetadata({ metadata, ...artifacts, platform });
    const secret = readFileSync(fd);
    try { result = signMetadata({ metadata, encryptedKeyPath: options['--key'], passphrase: secret.toString('utf8').replace(/\r?\n$/, ''), platform }); }
    finally { secret.fill(0); }
  } else if (command === 'verify') {
    const metadata = JSON.parse(readFileSync(options['--metadata'], 'utf8'));
    verifyMetadata({ metadata, publicKeyPath: options['--public-key'], currentVersion: options['--current-version'], platform });
    await verifyArtifactMetadata({ metadata, ...artifacts, platform });
    console.log(`Publisher signature, version, release asset path and actual ${platform === 'win32' ? 'installer' : 'AppImage'} bytes verified.`); return;
  } else throw new Error('Use prepare, sign or verify. This tool never creates keys, activates updates or publishes releases.');
  if (!options['--output']) throw new Error('An explicit output path is required.');
  // JSON is valid YAML and preserves exact custom fields through installed js-yaml.
  writeFileSync(options['--output'], JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
  console.log('Metadata written. No upload, activation or key creation occurred.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Metadata operation failed. Check the inputs, ownership, permissions and passphrase. No secret values are printed.'); process.exitCode = 1; });
}
