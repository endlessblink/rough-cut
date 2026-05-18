import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Regression guard for the App view registry. app-views.ts owns the bottom
// tab strip's order, labels, and icons; main.tsx owns the render switch
// that picks which view component to mount. Three failure modes have bitten
// us before or would silently break the shell:
//
//   1. A view id is removed from the AppViewId union but a render branch
//      in main.tsx still references it — typecheck catches the union
//      mismatch, but a missed branch in main.tsx remains.
//   2. APP_VIEWS gets reordered (e.g. someone drops NLE between Projects
//      and Recording edit) and the bottom strip no longer matches the
//      product spec.
//   3. The URL ?view= allowlist in main.tsx falls out of sync with the
//      union (a real view id can't be opened via deep-link).
//
// This test parses app-views.ts and main.tsx as text — node:test doesn't
// load .ts directly — and asserts the registry shape plus the existence
// of each view's render branch and URL-allowlist entry.

async function readSource(name) {
  return readFile(join(here, name), 'utf8');
}

function extractAppViewIds(source) {
  const match = source.match(/export type AppViewId =\s*([^;]+);/);
  assert.ok(match, 'app-views.ts must declare `export type AppViewId = ...`');
  return match[1]
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

function extractAppViewEntries(source) {
  // Pull each `{ id: '...', label: '...', iconName: '...' }` block out of
  // APP_VIEWS. Order matters — the bottom strip iterates this array.
  const opener = source.indexOf('export const APP_VIEWS');
  assert.ok(opener >= 0, 'app-views.ts must declare `export const APP_VIEWS`');
  const arrStart = source.indexOf('[', opener);
  const arrEnd = source.indexOf(']', arrStart);
  assert.ok(arrStart > 0 && arrEnd > arrStart, 'APP_VIEWS array must be parseable');
  const body = source.slice(arrStart + 1, arrEnd);
  const entries = [];
  const re = /\{\s*id:\s*'([a-z]+)'\s*,\s*label:\s*'([^']+)'\s*,\s*iconName:\s*'([a-z]+)'\s*\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    entries.push({ id: m[1], label: m[2], iconName: m[3] });
  }
  return entries;
}

test('AppViewId union and APP_VIEWS registry agree on the four shipped views', async () => {
  const source = await readSource('app-views.ts');
  const ids = extractAppViewIds(source);
  const entries = extractAppViewEntries(source);

  const expected = [
    { id: 'projects', label: 'Projects', iconName: 'folder' },
    { id: 'editor', label: 'Recording edit', iconName: 'timeline' },
    { id: 'nle', label: 'Editor', iconName: 'sliders' },
    { id: 'ai', label: 'AI', iconName: 'sparkle' },
  ];

  assert.deepEqual(entries, expected);
  // The union must contain exactly the registry's ids (order in the union
  // is irrelevant; coverage is what matters).
  assert.deepEqual(new Set(ids), new Set(expected.map((v) => v.id)));
});

test('main.tsx has a render branch for each AppViewId and a URL-allowlist entry', async () => {
  const source = await readSource('main.tsx');
  const ids = extractAppViewIds(await readSource('app-views.ts'));

  for (const id of ids) {
    if (id === 'editor') {
      // The editor view is the implicit fallthrough in the render switch
      // (ProjectPreview when a project is loaded, EditorEmptyState otherwise).
      // We assert the fallthrough still exists by checking for ProjectPreview
      // in the same render area.
      assert.ok(
        source.includes('<ProjectPreview'),
        'main.tsx must still render <ProjectPreview /> as the editor fallthrough',
      );
    } else {
      assert.ok(
        source.includes(`activeAppView === '${id}'`),
        `main.tsx must contain an \`activeAppView === '${id}'\` render branch`,
      );
    }
    // Every real view must be acceptable as a ?view= URL param so the
    // main process can deep-link into it.
    assert.ok(
      source.includes(`requested === '${id}'`),
      `main.tsx URL-allowlist must accept \`?view=${id}\``,
    );
  }
});
