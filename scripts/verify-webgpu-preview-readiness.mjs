import { spawnSync } from 'node:child_process';

const phases = [
  {
    id: 'app-default',
    description: 'Real main UI uses the app default WebGPU path.',
    env: {},
  },
  {
    id: 'motion-blur',
    description: 'Real main UI executes the WebGPU motion-blur shader branch.',
    env: {
      ROUGH_CUT_WEBGPU_MAIN_UI_MOTION_BLUR: '1',
    },
  },
  {
    id: 'compositor-parity',
    description: 'Synthetic compositor parity compares Canvas2D, WebGL, and WebGPU visual cases.',
    command: ['pnpm', 'visual:gpu-compositor'],
    env: {},
  },
  {
    id: 'fallback-matrix',
    description: 'Explicit WebGPU, WebGL, and Canvas2D preview selections remain valid.',
    command: ['pnpm', 'visual:webgpu-fallback-matrix'],
    env: {},
  },
];

if (process.env.ROUGH_CUT_WEBGPU_READINESS_ALL_REAL_PROJECTS === '1') {
  phases.splice(1, 0, {
    id: 'all-real-projects',
    description: 'All known local real projects pass the app default WebGPU path.',
    env: {
      ROUGH_CUT_WEBGPU_MAIN_UI_ALL_REAL_PROJECTS: '1',
    },
  });
}

const startedAt = new Date().toISOString();
const results = [];

for (const phase of phases) {
  const command = phase.command ?? ['pnpm', 'visual:webgpu-main-ui'];
  console.info(JSON.stringify({
    command: 'verify:webgpu-preview',
    phase: phase.id,
    description: phase.description,
    argv: command,
  }, null, 2));

  const phaseStartedAtMs = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...phase.env,
    },
    stdio: 'inherit',
  });
  const elapsedMs = Date.now() - phaseStartedAtMs;
  results.push({
    id: phase.id,
    ok: (result.status ?? 1) === 0 && !result.error,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error.message || result.error) : null,
    elapsedMs,
  });

  if (result.error) {
    printSummary(false);
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    printSummary(false);
    process.exit(result.status ?? 1);
  }
}

printSummary(true);

function printSummary(ok) {
  console.info(JSON.stringify({
    ok,
    command: 'verify:webgpu-preview',
    startedAt,
    endedAt: new Date().toISOString(),
    phases: results,
  }, null, 2));
}
