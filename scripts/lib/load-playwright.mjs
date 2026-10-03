import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Resolve Playwright without any machine-specific path: normal resolution,
// then $PLAYWRIGHT_PATH (package dir or its parent), then `npm root -g`.
export function loadPlaywright() {
  const attempts = [
    () => createRequire(import.meta.url)('playwright'),
    () => {
      const p = process.env.PLAYWRIGHT_PATH;
      if (!p) throw new Error('PLAYWRIGHT_PATH not set');
      const req = createRequire(join(p, 'noop.js'));
      try { return req('playwright'); } catch { return createRequire(join(p, 'package.json'))('playwright'); }
    },
    () => {
      const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
      return createRequire(join(globalRoot, 'playwright/package.json'))('playwright');
    },
  ];
  let last;
  for (const attempt of attempts) {
    try { return attempt(); } catch (error) { last = error; }
  }
  throw new Error(`Playwright not found. Install it (npm i -g playwright) or set PLAYWRIGHT_PATH. ${last?.message ?? ''}`);
}
