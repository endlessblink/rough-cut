import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

test('NLE program monitor uses the shared styled preview without editor controls', () => {
  const source = readFileSync(join(here, 'program-monitor.tsx'), 'utf8');

  assert.match(source, /StyledVideoPreview/);
  assert.match(source, /showControls=\{false\}/);
  assert.match(source, /timeMode="timeline"/);
  assert.doesNotMatch(source, /className="nleProgramMonitorVideo"/);
});
