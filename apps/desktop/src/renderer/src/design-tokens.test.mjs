import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The app looked sloppy because every panel hand-tuned its own sizes (36 font
// sizes, 15 weights, 25 radii, 176 paddings). These guards keep the type,
// weight, radius and spacing scales in :root the only source of those values.
const here = dirname(fileURLToPath(import.meta.url));
const css = await readFile(join(here, 'styles.css'), 'utf8');
const rootEnd = css.indexOf('\n}', css.indexOf(':root {'));
const body = css.slice(rootEnd);

function offenders(pattern) {
  return body.split('\n').filter((line) => pattern.test(line)).map((line) => line.trim());
}

test('font sizes come from the type scale', () => {
  assert.deepEqual(offenders(/(^|[;{\s])font-size:\s*[0-9.]+(rem|px)\b/), []);
});

test('font weights come from the weight scale', () => {
  assert.deepEqual(offenders(/(^|[;{\s])font-weight:\s*[0-9]{3}\b/), []);
});

test('corner radii come from the radius scale', () => {
  assert.deepEqual(offenders(/(^|[;{\s])border-radius:\s*([2-9]|[1-9][0-9]+)px\s*[;}]/), []);
});

test('padding, margin and gap use the spacing scale for rem lengths', () => {
  const spacing = /(^|[;{\s])(padding|margin|gap|row-gap|column-gap)(-[a-z-]+)?:\s*[^;}]*(^|[\s(,])(0?\.[1-9]|[1-9])[0-9.]*rem\b/;
  assert.deepEqual(offenders(spacing), []);
});
