import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEV_FEATURES_SWITCH_FILE,
  buildTakeRemuxArgs,
  classifyInsertPick,
  createTakeWriter,
  describeInsertableVideo,
  devFeaturesEnabled,
  exportProjectForInsert,
} from './dev-media-service.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('dev features are off unless the local switch is on', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'rc-dev-switch-'));
  assert.equal(devFeaturesEnabled({ env: {}, userDataDir }), false);
  assert.equal(devFeaturesEnabled({ env: { ROUGH_CUT_DEV_FEATURES: '1' }, userDataDir }), true);
  await writeFile(join(userDataDir, DEV_FEATURES_SWITCH_FILE), '');
  assert.equal(devFeaturesEnabled({ env: {}, userDataDir }), true);
  // The env var can force it off even with the file present.
  assert.equal(devFeaturesEnabled({ env: { ROUGH_CUT_DEV_FEATURES: '0' }, userDataDir }), false);
  assert.equal(devFeaturesEnabled({ env: {}, userDataDir: null }), false);
});

test('with the switch off, main registers no dev handlers; the status answers false', async () => {
  const source = await readFile(join(here, 'index.mjs'), 'utf8');
  assert.match(source, /const devFeaturesOn = devFeaturesEnabled\(\{ userDataDir: app\.getPath\('userData'\) \}\);/);
  assert.match(source, /if \(devFeaturesOn\) registerDevMediaHandlers\(\);/);
  const outside = source.replace(/function registerDevMediaHandlers\(\) \{[\s\S]*?\n\}\n/, '');
  for (const channel of ['DEV_INSERT_PICK', 'DEV_INSERT_PREPARE', 'DEV_TAKE_BEGIN', 'DEV_TAKE_CHUNK', 'DEV_TAKE_FINISH', 'DEV_TAKE_CANCEL']) {
    assert.doesNotMatch(outside, new RegExp(`IPC_CHANNELS\\.${channel}\\b`), `${channel} must only be handled inside registerDevMediaHandlers`);
  }
});

test('the release launcher and packaging never turn the dev switch on', async () => {
  const root = join(here, '..', '..', '..', '..');
  for (const relative of ['scripts/package-linux.mjs', 'scripts/build-linux-release.mjs']) {
    const path = join(root, relative);
    if (!existsSync(path)) continue;
    assert.doesNotMatch(await readFile(path, 'utf8'), /ROUGH_CUT_DEV_FEATURES|dev-features\.on/, `${relative} must not enable dev features`);
  }
});

test('picks are videos or Rough Cut projects', () => {
  assert.equal(classifyInsertPick('/a/b/clip.MP4'), 'video');
  assert.equal(classifyInsertPick('/a/b/take.webm'), 'video');
  assert.equal(classifyInsertPick('/a/b/other.roughcut'), 'project');
  assert.equal(classifyInsertPick('/a/b/notes.txt'), null);
});

test('a picked video is measured in the project frame rate', async () => {
  const described = await describeInsertableVideo('/x/clip.mp4', {
    projectFps: 30,
    probe: async () => ({ durationSeconds: 2.5, hasAudio: true, width: 1280, height: 720, fps: 25 }),
  });
  assert.deepEqual(
    { durationFrames: described.durationFrames, hasAudio: described.hasAudio, fps: described.fps },
    { durationFrames: 75, hasAudio: true, fps: 25 },
  );
});

test('another project comes in as a finished export saved beside the current project', async () => {
  const calls = [];
  const root = await mkdtemp(join(tmpdir(), 'rc-insert-project-'));
  const outputPath = await exportProjectForInsert({
    sourceProjectPath: join(root, 'other', 'Other.roughcut'),
    targetProjectPath: join(root, 'launch', 'Launch.roughcut'),
    openProject: async () => ({ document: { assets: [] } }),
    exportProject: async (options) => { calls.push(options); return { outputPath: options.outputPath }; },
    now: new Date('2026-10-20T10:00:00Z'),
  });
  assert.equal(outputPath, join(root, 'launch', 'added-media', 'Other-2026-10-20T10-00-00-000Z.mp4'));
  assert.equal(calls[0].mode, 'styled');
  await assert.rejects(() => exportProjectForInsert({
    sourceProjectPath: '/p/A.roughcut',
    targetProjectPath: '/p/A.roughcut',
    openProject: async () => ({}),
    exportProject: async () => ({}),
  }), /into itself/);
});

test('a camera take is streamed to a part file and remuxed next to the project', async () => {
  const projectDir = await mkdtemp(join(tmpdir(), 'rc-take-'));
  const writer = createTakeWriter({ now: () => new Date('2026-10-20T10:00:00Z'), uuid: () => 'take-1' });
  const { id, path } = await writer.begin({ projectPath: join(projectDir, 'Launch.roughcut') });
  assert.equal(path, join(projectDir, 'added-media', 'camera-take-2026-10-20T10-00-00-000Z.webm'));
  await writer.append(id, new Uint8Array([1, 2, 3]).buffer);
  await writer.append(id, new Uint8Array([4]).buffer);
  let remuxed = null;
  const finalPath = await writer.finish(id, {
    remux: async (input, output) => { remuxed = [input, output]; await writeFile(output, await readFile(input)); return true; },
  });
  assert.equal(finalPath, path);
  assert.deepEqual([...await readFile(finalPath)], [1, 2, 3, 4]);
  assert.ok(remuxed[0].endsWith('.part.webm'));
  assert.equal(existsSync(remuxed[0]), false, 'the part file is removed after a good remux');
  assert.equal(writer.activeCount(), 0);
});

test('a take is kept even when the remux fails, and an unsaved project is refused', async () => {
  const projectDir = await mkdtemp(join(tmpdir(), 'rc-take-'));
  const writer = createTakeWriter({ uuid: () => 'take-2' });
  const { id, path } = await writer.begin({ projectPath: join(projectDir, 'Launch.roughcut') });
  await writer.append(id, new Uint8Array([9]).buffer);
  await writer.finish(id, { remux: async () => false });
  assert.deepEqual([...await readFile(path)], [9]);
  await assert.rejects(() => writer.begin({ projectPath: null }), /Save the project/);
});

test('the take remux copies streams without re-encoding, on two threads', () => {
  const args = buildTakeRemuxArgs('/in.part.webm', '/out.webm');
  assert.deepEqual(args.slice(args.indexOf('-c'), args.indexOf('-c') + 2), ['-c', 'copy']);
  assert.ok(args.includes('-threads'));
});
