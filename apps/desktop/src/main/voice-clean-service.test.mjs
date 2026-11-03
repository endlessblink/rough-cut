import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import {
  buildVoiceCleanExtractArgs,
  buildVoiceCleanFrameProbeArgs,
  buildVoiceCleanTimeMap,
  buildVoiceCleanWorkerArgs,
  cleanedVoicePathFor,
  createVoiceCleanService,
  isVoiceCleanSourcePath,
  parseVoiceCleanWorkerLine,
  probeVoiceCleanAvailability,
  resolveVoiceCleanHome,
  voiceCleanEnvPaths,
  wavChannelCount,
} from './voice-clean-service.mjs';

function wavBytes(channels, dataBytes = 160) {
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(48_000, 24);
  buffer.writeUInt32LE(48_000 * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}
const WAV_BYTES = wavBytes(2);

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = undefined;
  child.exitCode = null;
  child.killed = [];
  child.kill = (signal) => {
    child.killed.push(signal);
    queueMicrotask(() => child.emit('close', null, signal));
  };
  child.exit = (code) => {
    child.stdout.end();
    child.emit('close', code, null);
  };
  return child;
}

const PROBE_JSON = JSON.stringify({
  streams: [{ sample_rate: '48000', time_base: '1/48000' }],
  frames: [{ pts: 0, nb_samples: 1024 }, { pts: 1024, nb_samples: 1024 }],
});

function fakeProbe(child) {
  setImmediate(() => {
    child.stdout.write(PROBE_JSON);
    setImmediate(() => child.exit(0));
  });
}

/** ffmpeg writes the wav, ffprobe prints frame timing, the worker writes --output. */
function fakeSpawner({ holdWorker = false } = {}) {
  const calls = [];
  const spawnProcess = (command, args) => {
    const child = fakeChild();
    calls.push({ command, args, child });
    if (command === 'ffmpeg') {
      void writeFile(args.at(-1), WAV_BYTES).then(() => child.exit(0));
    } else if (command === 'ffprobe') {
      fakeProbe(child);
    } else if (!holdWorker) {
      const output = args[args.indexOf('--output') + 1];
      setImmediate(async () => {
        child.stdout.write('{"event": "progress", "progress": 0.5}\n');
        child.stdout.write('not json\n');
        child.stdout.write('{"event": "progress", "progress": 1.0}\n');
        await writeFile(output, WAV_BYTES);
        child.stdout.write('{"event": "done", "samples": 10, "sampleRate": 48000}\n');
        setImmediate(() => child.exit(0));
      });
    }
    return child;
  };
  return { spawnProcess, calls };
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'voice-clean-test-'));
  const sourcePath = join(dir, 'take.mp4');
  await writeFile(sourcePath, 'original recording bytes');
  return { dir, sourcePath };
}

const available = async () => ({ available: true, reason: null });

test('paths: cached file is a sibling with its own suffix, never the recording', { skip: process.platform === 'win32' ? 'uses POSIX paths or file modes' : false }, () => {
  assert.equal(cleanedVoicePathFor('/r/take.mp4'), '/r/take.voice-clean.wav');
  assert.equal(cleanedVoicePathFor('/r/take.mp4', '/tmp/out'), '/tmp/out/take.voice-clean.wav');
  assert.equal(isVoiceCleanSourcePath('/r/take.mp4'), true);
  assert.equal(isVoiceCleanSourcePath('relative/take.mp4'), false);
  assert.equal(isVoiceCleanSourcePath('/r/take.voice-clean.wav'), false);
  assert.equal(isVoiceCleanSourcePath('/r/notes.txt'), false);
  assert.equal(resolveVoiceCleanHome({ ROUGH_CUT_VOICE_CLEAN_HOME: '/x/vc' }), '/x/vc');
  assert.match(resolveVoiceCleanHome({}), /\.local\/share\/rough-cut\/voice-clean$/);
  assert.equal(voiceCleanEnvPaths('/h').pythonPath, '/h/venv/bin/python');
});

test('extract args keep every decoded sample (no timestamp filter); mono 48k pcm', () => {
  const args = buildVoiceCleanExtractArgs('/r/take.mp4', '/t/voice.wav');
  assert.equal(args.includes('-af'), false, 'timing is placed by the time map, not by ffmpeg');
  assert.deepEqual(args.slice(args.indexOf('-ac'), args.indexOf('-ac') + 2), ['-ac', '1']);
  assert.deepEqual(args.slice(args.indexOf('-ar'), args.indexOf('-ar') + 2), ['-ar', '48000']);
  assert.equal(args.at(-1), '/t/voice.wav');
  const worker = buildVoiceCleanWorkerArgs({ workerPath: 'w.py', modelDir: 'm', configPath: 'c', inputPath: 'i', outputPath: 'o', timeMapPath: 't.json' });
  assert.ok(worker.includes('--chunk-seconds') && worker.includes('--hop-portion'), 'both chunk flags are required');
  assert.deepEqual(worker.slice(-2), ['--time-map', 't.json']);
  assert.ok(buildVoiceCleanFrameProbeArgs('/r/take.mp4').includes('stream=sample_rate,time_base:frame=pts,nb_samples'));
});

function probe(frames, { rate = 48000, timeBase = '1/48000' } = {}) {
  return { streams: [{ sample_rate: String(rate), time_base: timeBase }], frames };
}

test('time map: steady stream is one segment with no offset', () => {
  const frames = Array.from({ length: 100 }, (_, i) => ({ pts: i * 1024, nb_samples: 1024 }));
  const map = buildVoiceCleanTimeMap(probe(frames));
  assert.deepEqual(map.segments, [[0, 0]]);
  assert.equal(map.end, 100 * 1024);
});

test('time map: timestamp jitter never makes a step; a real jump does, once', () => {
  // 1024 samples per frame, timestamps advance 1008/1040/1056/992 ticks
  // (jitter, no net drift), then one real 20 ms (960-sample) jump at frame 300.
  const pattern = [1008, 1040, 1056, 992];
  const frames = [];
  let pts = 0;
  for (let i = 0; i < 600; i += 1) {
    if (i === 300) pts += 960;
    frames.push({ pts, nb_samples: 1024 });
    pts += pattern[i % pattern.length];
  }
  const map = buildVoiceCleanTimeMap(probe(frames));
  assert.equal(map.segments.length, 2, JSON.stringify(map.segments));
  const [[, first], [at, second]] = map.segments;
  assert.ok(Math.abs(first) <= 32);
  assert.ok(Math.abs(second - first - 960) <= 32, 'the 20 ms jump is kept');
  assert.ok(Math.abs(at - (300 * 1024 + second)) <= 30 * 1024, 'step lands near the jump');
});

test('time map: slow drift steps every ~12 ms, never more', () => {
  // Timestamps run 1% slower than the samples: 10.24 samples per frame.
  const frames = Array.from({ length: 1000 }, (_, i) => ({ pts: Math.round(i * 1013.76), nb_samples: 1024 }));
  const map = buildVoiceCleanTimeMap(probe(frames));
  const steps = map.segments.slice(1).map(([, offset], i) => offset - map.segments[i][1]);
  assert.ok(steps.length >= 15, `drift is followed (${steps.length} steps)`);
  for (const delta of steps) assert.ok(delta < 0 && Math.abs(delta) <= 0.0125 * 48000, `step ${delta}`);
  for (let i = 1; i < map.segments.length; i += 1) assert.ok(map.segments[i][0] > map.segments[i - 1][0]);
});

test('time map: late audio start becomes leading silence; other rates scale to 48k', () => {
  const late = buildVoiceCleanTimeMap(probe([{ pts: 24000, nb_samples: 1024 }, { pts: 25024, nb_samples: 1024 }]));
  assert.deepEqual(late.segments, [[0, 24000]], 'first sample lands 0.5 s in');
  assert.equal(late.end, 24000 + 2048);
  const at44 = buildVoiceCleanTimeMap(probe([{ pts: 0, nb_samples: 1152 }, { pts: 1152, nb_samples: 1152 }], { rate: 44100, timeBase: '1/44100' }));
  assert.equal(at44.end, Math.round(2304 * 48000 / 44100));
  assert.equal(at44.sampleRate, 48000);
  assert.equal(buildVoiceCleanTimeMap({ streams: [{}], frames: [] }), null);
});

test('worker lines: progress clamps, junk ignored, errors carry a code', () => {
  assert.deepEqual(parseVoiceCleanWorkerLine('{"event":"progress","progress":1.4}'), { event: 'progress', progress: 1 });
  assert.equal(parseVoiceCleanWorkerLine('Initializing'), null);
  assert.deepEqual(parseVoiceCleanWorkerLine('{"event":"done"}'), { event: 'done' });
  assert.deepEqual(parseVoiceCleanWorkerLine('{"event":"error","code":"no-gpu","message":"x"}'), { event: 'error', code: 'no-gpu', message: 'x' });
});

test('availability: missing env says needs setup; no GPU says so; otherwise available', async () => {
  const missing = await probeVoiceCleanAvailability({ home: '/nope', canAccess: async () => false, hasNvidiaGpu: async () => true });
  assert.deepEqual(missing, { available: false, reason: 'needs-setup' });
  const noGpu = await probeVoiceCleanAvailability({ home: '/h', canAccess: async () => true, hasNvidiaGpu: async () => false });
  assert.deepEqual(noGpu, { available: false, reason: 'needs-nvidia-gpu' });
  const ok = await probeVoiceCleanAvailability({ home: '/h', canAccess: async () => true, hasNvidiaGpu: async () => true });
  assert.deepEqual(ok, { available: true, reason: null });
});

test('clean: extract -> worker -> cached sibling; original untouched; reused next time', { skip: process.platform === 'win32' ? 'uses POSIX paths or file modes' : false }, async () => {
  const { dir, sourcePath } = await fixture();
  try {
    const { spawnProcess, calls } = fakeSpawner();
    const service = createVoiceCleanService({ home: '/h', spawnProcess, probeAvailability: available, lowerPriority: () => undefined });
    const before = await service.status({ sourcePath });
    assert.equal(before.state, 'none');
    const progress = [];
    const result = await service.clean({ sourcePath, onProgress: (event) => progress.push(event) });
    assert.equal(result.cleanedPath, join(dir, 'take.voice-clean.wav'));
    assert.equal(result.reused, false);
    assert.deepEqual(calls.map((call) => call.command), ['ffmpeg', 'ffprobe', '/h/venv/bin/python']);
    const worker = calls[2].args;
    const mapPath = worker[worker.indexOf('--time-map') + 1];
    assert.ok(mapPath.endsWith('time-map.json'), 'worker gets the time map');
    assert.equal(await readFile(sourcePath, 'utf8'), 'original recording bytes');
    assert.deepEqual((await readdir(dir)).sort(), ['take.mp4', 'take.voice-clean.wav'], 'no partial files left');
    const values = progress.map((event) => event.progress);
    assert.deepEqual([...values].sort((a, b) => a - b), values, 'progress never goes backwards');
    assert.equal(progress.at(-1).phase, 'ready');
    const after = await service.status({ sourcePath });
    assert.equal(after.state, 'ready');
    assert.equal(after.cleanedPath, result.cleanedPath);
    const again = await service.clean({ sourcePath });
    assert.equal(again.reused, true);
    assert.equal(calls.length, 3, 'a fresh cache skips the job');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('wav header: only a 2-channel (original + cleaned) WAV counts as a cache', async () => {
  assert.equal(wavChannelCount(wavBytes(2)), 2);
  assert.equal(wavChannelCount(wavBytes(1)), 1);
  assert.equal(wavChannelCount(Buffer.from('not a wav at all')), null);
  const { dir, sourcePath } = await fixture();
  try {
    const service = createVoiceCleanService({ home: '/h', spawnProcess: fakeSpawner().spawnProcess, probeAvailability: available });
    await writeFile(join(dir, 'take.voice-clean.wav'), wavBytes(1));
    assert.equal((await service.status({ sourcePath })).state, 'none', 'mono file from elsewhere is ignored');
    await writeFile(join(dir, 'take.voice-clean.wav'), wavBytes(2));
    assert.equal((await service.status({ sourcePath })).state, 'ready');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('clean: a cache older than the recording is stale', async () => {
  const { dir, sourcePath } = await fixture();
  try {
    const cached = join(dir, 'take.voice-clean.wav');
    await writeFile(cached, WAV_BYTES);
    const old = new Date(Date.now() - 60_000);
    await utimes(cached, old, old);
    const service = createVoiceCleanService({ home: '/h', spawnProcess: fakeSpawner().spawnProcess, probeAvailability: available });
    assert.equal((await service.status({ sourcePath })).state, 'none');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('clean: jobs run one at a time', { skip: process.platform === 'win32' ? 'uses POSIX paths or file modes' : false }, async () => {
  const one = await fixture();
  const two = await fixture();
  try {
    const { spawnProcess, calls } = fakeSpawner({ holdWorker: true });
    const service = createVoiceCleanService({ home: '/h', spawnProcess, probeAvailability: available, lowerPriority: () => undefined });
    const first = service.clean({ sourcePath: one.sourcePath });
    const second = service.clean({ sourcePath: two.sourcePath });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(calls.map((call) => call.command), ['ffmpeg', 'ffprobe', '/h/venv/bin/python'], 'second job waits');
    assert.equal((await service.status({ sourcePath: two.sourcePath })).state, 'running');
    service.cancel({ sourcePath: one.sourcePath });
    await assert.rejects(first, (error) => error.code === 'cancelled');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(calls.length, 6, 'second job starts after the first ends');
    service.cancel({ sourcePath: two.sourcePath });
    await assert.rejects(second, (error) => error.code === 'cancelled');
  } finally {
    await rm(one.dir, { recursive: true, force: true });
    await rm(two.dir, { recursive: true, force: true });
  }
});

test('cancel: kills the worker, leaves no partial file and keeps the original', { skip: process.platform === 'win32' ? 'uses POSIX paths or file modes' : false }, async () => {
  const { dir, sourcePath } = await fixture();
  try {
    const { spawnProcess, calls } = fakeSpawner({ holdWorker: true });
    const service = createVoiceCleanService({ home: '/h', spawnProcess, probeAvailability: available, lowerPriority: () => undefined });
    const job = service.clean({ sourcePath });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const worker = calls.find((call) => call.command === '/h/venv/bin/python');
    assert.ok(worker, 'worker started');
    await writeFile(worker.args[worker.args.indexOf('--output') + 1], 'half');
    assert.equal(service.cancel({ sourcePath }), true);
    await assert.rejects(job, (error) => error.code === 'cancelled');
    assert.deepEqual(worker.child.killed, ['SIGTERM']);
    assert.deepEqual(await readdir(dir), ['take.mp4']);
    assert.equal((await stat(sourcePath)).size, 'original recording bytes'.length);
    assert.equal((await service.status({ sourcePath })).state, 'none');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('clean: unavailable env fails with the reason and spawns nothing', async () => {
  const { dir, sourcePath } = await fixture();
  try {
    const { spawnProcess, calls } = fakeSpawner();
    const service = createVoiceCleanService({
      home: '/h',
      spawnProcess,
      probeAvailability: async () => ({ available: false, reason: 'needs-nvidia-gpu' }),
    });
    await assert.rejects(service.clean({ sourcePath }), (error) => error.code === 'needs-nvidia-gpu');
    assert.equal(calls.length, 0);
    const status = await service.status({ sourcePath });
    assert.equal(status.available, false);
    assert.equal(status.reason, 'needs-nvidia-gpu');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('clean: worker error is reported with its message', async () => {
  const { dir, sourcePath } = await fixture();
  try {
    const spawnProcess = (command, args) => {
      const child = fakeChild();
      if (command === 'ffmpeg') void writeFile(args.at(-1), WAV_BYTES).then(() => child.exit(0));
      else if (command === 'ffprobe') fakeProbe(child);
      else setImmediate(() => {
        child.stdout.write('{"event":"error","code":"failed","message":"CUDA out of memory"}\n');
        setImmediate(() => child.exit(1));
      });
      return child;
    };
    const service = createVoiceCleanService({ home: '/h', spawnProcess, probeAvailability: available, lowerPriority: () => undefined });
    await assert.rejects(service.clean({ sourcePath }), /CUDA out of memory/);
    assert.deepEqual(await readdir(dir), ['take.mp4']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
