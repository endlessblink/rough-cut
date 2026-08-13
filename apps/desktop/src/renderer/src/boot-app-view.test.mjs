import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { APP_VIEW_IDS, resolveProjectOpenAppView, resolveRequestedAppView } from './boot-app-view.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// A deep link carries two independent instructions: which project to open
// (`projectPath`) and which view to land on (`view`). The boot effect that
// opens the project used to unconditionally retarget the shell to Recording
// edit, so `view=nle` was honoured for exactly one render and then thrown
// away. That silently defeated ROUGH_CUT_STARTUP_VIEW, the `freecut` startup
// mode, and any "open this project in the Editor" deep link — and it is what
// made the packaged FreeCut smoke report activeAppView=editor while asking
// for nle.

test('an explicitly requested view is recognised', () => {
  assert.equal(resolveRequestedAppView('nle'), 'nle');
  assert.equal(resolveRequestedAppView('editor'), 'editor');
  assert.equal(resolveRequestedAppView(' projects '), 'projects');
});

test('an absent or unknown view is not a request', () => {
  assert.equal(resolveRequestedAppView(null), null);
  assert.equal(resolveRequestedAppView(''), null);
  assert.equal(resolveRequestedAppView('timeline'), null);
  assert.equal(resolveRequestedAppView(undefined), null);
});

test('opening a project keeps the explicitly requested view', () => {
  assert.equal(resolveProjectOpenAppView('nle'), 'nle');
  assert.equal(resolveProjectOpenAppView('projects'), 'projects');
  assert.equal(resolveProjectOpenAppView('ai'), 'ai');
});

test('opening a project with no requested view lands on Recording edit', () => {
  assert.equal(resolveProjectOpenAppView(null), 'editor');
  assert.equal(resolveProjectOpenAppView(''), 'editor');
  assert.equal(resolveProjectOpenAppView('nope'), 'editor');
});

test('the id list stays in step with the AppViewId union', async () => {
  const source = await readFile(join(here, 'app-views.ts'), 'utf8');
  const match = source.match(/export type AppViewId\s*=\s*([^;]+);/);
  assert.ok(match, 'AppViewId union was not found in app-views.ts');
  const unionIds = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  assert.deepEqual([...APP_VIEW_IDS].sort(), [...unionIds].sort());
});

// There used to be two of these effects, both reading `projectPath` off the
// URL and both opening it at boot. They raced, parsed the project twice, and
// the later one silently won every disagreement — which is how a fix applied
// to the first one changed nothing at all.
test('exactly one boot effect opens the URL project', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');
  const opens = [...source.matchAll(/window\.roughCut\.openProjectPath\(requestedProjectPath\)/g)];
  assert.equal(opens.length, 1, 'main.tsx must open the deep-linked project exactly once at boot');
  assert.ok(
    !/new URLSearchParams\(window\.location\.search\)\.get\('projectPath'\)/.test(source),
    'the boot project path must come from the single `requestedProjectPath` const, not a re-parsed URL',
  );
});

test('the project-open boot effect defers to the helper', async () => {
  const source = await readFile(join(here, 'main.tsx'), 'utf8');
  const effect = source.slice(source.indexOf('if (!requestedProjectPath) return;'));
  const body = effect.slice(0, effect.indexOf('}, [requestedProjectPath'));
  assert.ok(body.length > 0, 'the project-open boot effect was not found in main.tsx');
  assert.ok(
    body.includes('resolveProjectOpenAppView'),
    'the project-open boot effect must resolve the view through resolveProjectOpenAppView',
  );
  assert.ok(
    !/setActiveAppView\('editor'\)/.test(body),
    'the project-open boot effect must not hard-code the Recording edit view',
  );
});
