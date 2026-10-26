import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildSupportSummary, createSupportReport, readBoundedLogTail, readLastRecordingSummary, redactDiagnosticText, supportIssueUrl } from './support-diagnostics.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-support-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const desktopPath = join(dir, 'Desktop');
  await mkdir(desktopPath);
  return { dir, desktopPath };
}
function unpackStoredZip(buffer) {
  const files = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0, 'uncompressed zip');
    const size = buffer.readUInt32LE(offset + 18), nameSize = buffer.readUInt16LE(offset + 26), extraSize = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameSize).toString();
    const start = offset + 30 + nameSize + extraSize;
    files[name] = buffer.subarray(start, start + size).toString();
    offset = start + size;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'central directory exists');
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50, 'end of central directory exists');
  assert.equal(buffer.readUInt16LE(buffer.length - 12), Object.keys(files).length);
  return files;
}

test('redacts credentials, environment values, home names, identity and private payloads', () => {
  const source = [
    'ok capturing 1920x1080',
    '/Users/jane/Movies/capture.mp4 /home/bob/private.wav C:\\Users\\sam\\Videos\\take.mp4',
    'Authorization: Bearer unrelatedOpaqueValue',
    '{"apiKey":{"nested":"opaque-credential"}}',
    'password="unknown-password-value"',
    'AUTH_TOKEN=small',
    'opaque-known-secret',
    'custom-env-value',
    'sk-ant-api03-a-secret-key',
    'ghp_randomgithubsecret',
    'https://name:secret@example.com/path',
    'https://example.com/?access_token=opaque-query-value',
    'contact jane@example.com',
    '{"messages":[{"content":"private customer conversation"}]}',
    'transcript: private spoken words',
    '-----BEGIN RSA PRIVATE KEY-----\nvery-private-key-body\n-----END RSA PRIVATE KEY-----',
  ].join('\n');
  const result = redactDiagnosticText(source, { home: '/Users/jane', env: { ANTHROPIC_API_KEY: 'opaque-known-secret', CUSTOM_VALUE: 'custom-env-value', AUTH_TOKEN: 'small' } });
  assert.match(result, /ok capturing 1920x1080/);
  for (const secret of ['jane', 'bob', 'sam', 'capture.mp4', 'private.wav', 'take.mp4', 'unrelatedOpaqueValue', 'opaque-credential', 'unknown-password-value', 'small', 'opaque-known-secret', 'custom-env-value', 'a-secret-key', 'randomgithubsecret', 'name:secret', 'opaque-query-value', 'private customer conversation', 'private spoken words', 'very-private-key-body']) {
    assert.ok(!result.includes(secret), `leaked ${secret}`);
  }
});

test('removes multiline private log records without losing the following safe record', () => {
  const log = '2026-10-26T08:00:00.000Z INFO prompt:\nprivate customer input\nand more private words\n2026-10-26T08:00:01.000Z INFO capture ready\n';
  const redacted = redactDiagnosticText(log, { env: {} });
  assert.ok(!redacted.includes('customer input'));
  assert.ok(!redacted.includes('private words'));
  assert.match(redacted, /capture ready/);
});

test('reads a bounded tail and discards a partial first line; missing log is nonfatal', async t => {
  const { dir } = await fixture(t);
  const path = join(dir, 'app-runtime.log');
  await writeFile(path, 'secret-first-line'.repeat(1000) + '\nlast safe line\n');
  const tail = await readBoundedLogTail(path, 64);
  assert.equal(tail.bytesRead, 64);
  assert.equal(tail.truncated, true);
  assert.equal(tail.text, 'last safe line\n');
  assert.equal((await readBoundedLogTail(join(dir, 'missing'))).bytesRead, 0);
  assert.equal((await readBoundedLogTail(dir)).bytesRead, 0);
});

test('allowlists summary fields; drops paths, CLI identities, telemetry, media and arbitrary state', () => {
  const summary = buildSupportSummary({
    appVersion: '0.1.0-beta.13', platform: 'darwin', arch: 'arm64', osVersion: '24.6.0', env: { ANTHROPIC_API_KEY: 'credential-value', CLAUDE_CODE_USE_BEDROCK: '1', CUSTOM_SECRET: 'other-private' },
    permissions: { screen: 'granted', microphone: 'denied', camera: 'not-determined', accessibility: 'granted' },
    devices: { cameras: [{ label: 'FaceTime HD', deviceId: 'private-device-id' }], microphones: ['Built-in microphone'] },
    claude: { ok: true, status: 'ready', version: '2.1.248', email: 'customer@example.com', accessToken: 'hidden-token' },
    transcription: { available: true, engine: 'faster-whisper', transcript: 'private words' },
    lastRecording: { status: 'ok', recording: { startedAt: '2026-10-26T08:00:00.000Z', width: 1920, height: 1080, rawPath: '/Users/name/private.mov', projectPath: 'private-project' }, media: { hasVideo: true, hasAudio: true }, cursor: { totalEvents: 10, cursorEvents: ['private telemetry'] }, remux: { frameDrops: 1, warningLines: ['private-media-path'] } },
    selfCheck: { checks: [{ id: 'screen', status: 'pass', detail: 'Thumbnail captured', thumbnail: 'data:private-image' }, { id: 'injected-id', status: 'pass', detail: 'bad' }] },
  });
  assert.deepEqual(summary.claude.environmentVariableNames, ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_USE_BEDROCK']);
  assert.equal(summary.app.platform, 'darwin');
  assert.equal(summary.app.chip, 'arm64');
  assert.equal(summary.lastRecording.width, 1920);
  assert.equal(summary.lastRecording.remux.frameDrops, 1);
  assert.equal(summary.selfCheck.checks.length, 1);
  assert.deepEqual(summary.devices.cameras, ['FaceTime HD']);
  const text = JSON.stringify(summary);
  for (const secret of ['credential-value', 'other-private', 'customer@example', 'hidden-token', 'private words', 'private.mov', 'private-project', 'private telemetry', 'private-media-path', 'data:private-image', 'private-device-id']) assert.ok(!text.includes(secret), `leaked ${secret}`);
});

test('creates one private Desktop zip, with the same self-check and a redacted log; does not send anything', async t => {
  const { dir, desktopPath } = await fixture(t);
  const runtimeLogPath = join(dir, 'app-runtime.log');
  await writeFile(runtimeLogPath, 'screen capture available\naccess_token=top-secret\n');
  const result = await createSupportReport({ desktopPath, runtimeLogPath, appVersion: '0.1.0-beta.13', platform: 'darwin', arch: 'x64', env: {}, selfCheck: [{ id: 'app', status: 'pass', detail: 'App opens' }] });
  assert.equal(result.zipPath.startsWith(desktopPath), true);
  const files = unpackStoredZip(await readFile(result.zipPath));
  assert.deepEqual(result.fileNames, ['summary.json', 'self-check.json', 'app-runtime.log', 'README.txt']);
  assert.deepEqual(Object.keys(files), result.fileNames);
  assert.deepEqual(JSON.parse(files['summary.json']).selfCheck, JSON.parse(files['self-check.json']));
  assert.match(files['app-runtime.log'], /screen capture available/);
  assert.ok(!files['app-runtime.log'].includes('top-secret'));
  assert.equal(new URL(result.issueUrl).searchParams.get('template'), 'mac-alpha-bug.yml');
  if (process.platform !== 'win32') assert.equal((await stat(result.zipPath)).mode & 0o777, 0o600);
  // Independently check ZIP CRC/structure with the OS reader where one is available (macOS/Linux).
  const unzip = spawnSync('unzip', ['-t', result.zipPath], { encoding: 'utf8' });
  if (!unzip.error) assert.equal(unzip.status, 0, unzip.stdout + unzip.stderr);
});

test('does not overwrite an existing report, and fails explicitly if the Desktop cannot be used', async t => {
  const { dir, desktopPath } = await fixture(t);
  const options = { desktopPath, appVersion: '0.1.0-beta.13', env: {}, now: new Date('2026-10-26T08:00:00.000Z') };
  const first = await createSupportReport(options), second = await createSupportReport(options);
  assert.notEqual(first.zipPath, second.zipPath);
  await assert.rejects(createSupportReport({ desktopPath: join(dir, 'missing'), env: {} }));
  const file = join(dir, 'not-a-folder'); await writeFile(file, '');
  await assert.rejects(createSupportReport({ desktopPath: file, env: {} }), /Desktop folder unavailable/);
});

test('issue URL contains version metadata only, never arbitrary user content', () => {
  const url = new URL(supportIssueUrl('secret\n/Users/jane'));
  assert.equal(url.hostname, 'github.com');
  assert.ok(!url.toString().includes('secret'));
  assert.deepEqual([...url.searchParams.keys()], ['template', 'title']);
});

test('finds the latest bounded session diagnostics after restart and excludes private payloads', async t => {
  const { dir } = await fixture(t);
  const recordings = join(dir, 'recordings'), older = join(recordings, '2026-10-25_1230 Recording'), newer = join(recordings, '2026-10-26_1230 Recording');
  await mkdir(older, { recursive: true }); await mkdir(newer);
  const oldPath = join(older, 'take.diagnostics.json'), newPath = join(newer, 'take.diagnostics.json');
  await writeFile(oldPath, JSON.stringify({ recording: { width: 800 }, status: 'ok' }));
  await utimes(oldPath, 1000, 1000);
  await writeFile(newPath, JSON.stringify({ status: 'warning', recording: { width: 1920, rawPath: '/Users/secret/media.mp4' }, media: { hasAudio: true }, remux: { frameDrops: 2 }, transcript: 'private content' }));
  const found = await readLastRecordingSummary(recordings);
  assert.equal(found.recording.width, 1920);
  assert.equal(found.media.hasAudio, true);
  assert.equal(found.remux.frameDrops, 2);
  assert.equal(found.status, 'warning');
  assert.ok(!JSON.stringify(found).includes('private content'));
  assert.ok(!JSON.stringify(found).includes('/Users/secret'));
  assert.equal(buildSupportSummary({ lastRecording: found }).lastRecording.width, 1920);
});

test('session discovery skips huge/malformed files, media and symlink escapes', async t => {
  const { dir } = await fixture(t);
  const recordings = join(dir, 'recordings'), outside = join(dir, 'outside');
  await mkdir(recordings); await mkdir(outside);
  await writeFile(join(recordings, 'huge.diagnostics.json'), ' '.repeat(1024 * 1024 + 1));
  await writeFile(join(recordings, 'bad.diagnostics.json'), '{');
  await writeFile(join(recordings, 'media.mp4'), JSON.stringify({ recording: { width: 900 } }));
  await writeFile(join(outside, 'outside.diagnostics.json'), JSON.stringify({ recording: { width: 999 } }));
  if (process.platform !== 'win32') {
    await symlink(outside, join(recordings, 'linked-folder'));
    await symlink(join(outside, 'outside.diagnostics.json'), join(recordings, 'linked.diagnostics.json'));
  }
  assert.equal(await readLastRecordingSummary(recordings), null);
  assert.equal(await readLastRecordingSummary(join(dir, 'missing')), null);
});
