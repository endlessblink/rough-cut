import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GRAPHIC_JSON_SCHEMA,
  buildClaudeArgs,
  buildGraphicsSystemPrompt,
  buildGraphicsUserPrompt,
  generateGraphic,
  parseClaudeResult,
  resolveClaudeBinary,
  runClaudeOnce,
} from './claude-graphics-service.mjs';

const GOOD = {
  title: 'Lower third',
  durationSec: 4,
  startSec: 5,
  html: '<style>.b{position:absolute;left:96px;bottom:120px;animation:in .6s both}@keyframes in{from{opacity:0}}</style><div class="b" data-rc-field="name">Noam</div>',
  fields: [{ key: 'name', label: 'Name', type: 'text', value: 'Noam' }],
};

test('the claude binary is found in the usual install locations when PATH lacks it', () => {
  const home = '/home/someone';
  const found = resolveClaudeBinary({ env: { PATH: '/usr/bin' }, home, exists: (path) => path === '/home/someone/.npm-global/bin/claude' });
  assert.equal(found, '/home/someone/.npm-global/bin/claude');
  assert.equal(resolveClaudeBinary({ env: { PATH: '' }, home, exists: () => false }), null);
  assert.equal(resolveClaudeBinary({ env: { ROUGH_CUT_CLAUDE_BIN: '/x/claude' }, home, exists: (p) => p === '/x/claude' }), '/x/claude');
});

test('the call is one-shot, tool-less and ignores personal settings and MCP servers', () => {
  const args = buildClaudeArgs({ systemPrompt: 'SYS' });
  assert.equal(args[0], '-p');
  assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', '']);
  for (const flag of ['--restricted', '--strict-mcp-config', '--no-session-persistence']) assert.ok(args.includes(flag), flag);
  assert.equal(JSON.parse(args[args.indexOf('--json-schema') + 1]).required.join(), GRAPHIC_JSON_SCHEMA.required.join());
  assert.equal(args[args.indexOf('--system-prompt') + 1], 'SYS');
});

test('the system prompt states the canvas, the seek contract, the field contract and the house style', () => {
  const prompt = buildGraphicsSystemPrompt({ width: 1080, height: 1920, fps: 30, style: { primaryColor: '#123456' } });
  assert.match(prompt, /1080x1920/);
  assert.match(prompt, /animation-fill-mode: both/);
  assert.match(prompt, /window\.rcSeek/);
  assert.match(prompt, /data-rc-field/);
  assert.match(prompt, /#123456/);
  assert.match(prompt, /dir="rtl"/);
});

test('a revision request carries the current graphic and any rejection reasons', () => {
  const prompt = buildGraphicsUserPrompt({ request: 'slide in from the left', existing: GOOD, validationErrors: ['external URL'] });
  assert.match(prompt, /Requested change: slide in from the left/);
  assert.match(prompt, /data-rc-field="name"/);
  assert.match(prompt, /- external URL/);
});

test('structured output is read from either envelope shape, errors are reported', () => {
  assert.deepEqual(parseClaudeResult(JSON.stringify({ subtype: 'success', structured_output: GOOD })).value, GOOD);
  assert.deepEqual(parseClaudeResult(JSON.stringify({ subtype: 'success', result: '```json\n' + JSON.stringify(GOOD) + '\n```' })).value, GOOD);
  assert.equal(parseClaudeResult(JSON.stringify({ is_error: true, result: 'Not logged in' })).ok, false);
  assert.equal(parseClaudeResult('nope').ok, false);
});

async function fakeClaude(script) {
  const dir = await mkdtemp(join(tmpdir(), 'fake-claude-'));
  const bin = join(dir, 'claude');
  await writeFile(bin, `#!/usr/bin/env node\n${script}\n`);
  await chmod(bin, 0o755);
  return { bin, dir };
}

test('a real child process is spawned with the prompt on stdin', async () => {
  const { bin, dir } = await fakeClaude(`
let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  require('fs').writeFileSync(${JSON.stringify(join(tmpdir(), 'x'))}.replace('x', 'rc-fake-claude-' + process.pid), input);
  process.stdout.write(JSON.stringify({ subtype: 'success', structured_output: ${JSON.stringify(GOOD)}, argv: process.argv.slice(2) }));
});`);
  const result = await generateGraphic({ request: 'lower third for Noam at 0:05', binary: bin });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.graphic.title, 'Lower third');
  assert.equal(result.graphic.startSec, 5);
  assert.ok(dir);
});

test('an invalid first answer is retried once with the reasons, then accepted', async () => {
  const prompts = [];
  let calls = 0;
  const runOnce = async ({ prompt }) => {
    prompts.push(prompt);
    calls += 1;
    const spec = calls === 1 ? { ...GOOD, html: '<img src="https://x.com/a.png">' } : GOOD;
    return { ok: true, stdout: JSON.stringify({ subtype: 'success', structured_output: spec }) };
  };
  const result = await generateGraphic({ request: 'lower third', binary: '/fake', runOnce });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.match(prompts[1], /external URL/);
});

test('two bad answers fail closed with the reasons', async () => {
  const runOnce = async () => ({ ok: true, stdout: JSON.stringify({ subtype: 'success', structured_output: { ...GOOD, html: '' } }) });
  const result = await generateGraphic({ request: 'x', binary: '/fake', runOnce });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test('missing Claude, empty requests and a failing process give plain reasons', async () => {
  assert.match((await generateGraphic({ request: 'x', binary: null })).reason, /not installed/);
  assert.match((await generateGraphic({ request: '  ', binary: '/fake' })).reason, /Describe/);
  const { bin } = await fakeClaude('process.stderr.write("Please run /login"); process.exit(1);');
  const result = await generateGraphic({ request: 'x', binary: bin });
  assert.equal(result.ok, false);
  assert.match(result.reason, /login/);
});

test('cancelling stops the child and reports it as cancelled', async () => {
  const { bin } = await fakeClaude('setTimeout(() => {}, 60000);');
  const controller = new AbortController();
  const pending = runClaudeOnce({ binary: bin, args: [], prompt: '', signal: controller.signal, cwd: tmpdir() });
  setTimeout(() => controller.abort(), 50);
  const result = await pending;
  assert.equal(result.cancelled, true);
});

test('the service never reads the Claude credentials file itself', async () => {
  const source = await readFile(new URL('./claude-graphics-service.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /credentials\.json|api\.anthropic\.com|ANTHROPIC_API_KEY/);
  const cli = await readFile(new URL('./claude-cli.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(cli, /credentials\.json|api\.anthropic\.com|ANTHROPIC_API_KEY/);
});

test('the brief follows the chosen style and creativity level', () => {
  const calm = buildGraphicsSystemPrompt({ width: 1920, height: 1080, fps: 30, style: { styleId: 'velvet', creativity: 1 } });
  assert.match(calm, /Visual style: Velvet/);
  assert.match(calm, /Creativity: 1\/5 — Calm/);
  const wild = buildGraphicsSystemPrompt({ width: 1920, height: 1080, fps: 30, style: { styleId: 'maximal', creativity: 5 } });
  assert.match(wild, /Visual style: Maximal Type/);
  assert.match(wild, /Creativity: 5\/5 — Wild/);
  assert.match(wild, /Break the grid/);
  const fallback = buildGraphicsSystemPrompt({ width: 1920, height: 1080, fps: 30, style: { styleId: 'nope', creativity: 99 } });
  assert.match(fallback, /Visual style: Studio/);
  assert.match(fallback, /Creativity: 5\/5/);
});

test('right-to-left never mirrors non-directional icons, and kinetic type survives field edits', () => {
  const prompt = buildGraphicsSystemPrompt({ width: 1920, height: 1080, fps: 30, style: {} });
  assert.match(prompt, /NEVER mirror or flip \(scaleX\(-1\)\) glyphs and icons that are not directional: question marks/);
  assert.match(prompt, /rc:fields/);
  assert.match(prompt, /--rc-duration/);
});
