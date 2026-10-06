import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { configureBundledTools } from './bundled-tools.mjs';
test('media tool selection leaves Electron library lookup untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'rough-cut-tool-isolation-'));
  try {
    mkdirSync(join(root, 'bin'));
    const env = { PATH: '/usr/bin', LD_LIBRARY_PATH: '/existing/library' };
    for (const name of ['ffmpeg','ffprobe','xdotool','xinput']) writeFileSync(join(root, 'bin', name), 'fixture');
    assert.equal(configureBundledTools({resourcesPath:root,env}).bundled, false);
    assert.equal(env.PATH, '/usr/bin');
    writeFileSync(join(root, 'bin', 'pactl'), 'fixture');
    assert.equal(configureBundledTools({resourcesPath:root,env}).bundled, true);
    assert.equal(env.PATH, join(root, 'bin') + ':/usr/bin');
    assert.equal(env.LD_LIBRARY_PATH, '/existing/library');
    const clean = {PATH:'/usr/bin'};
    configureBundledTools({resourcesPath:root,env:clean});
    assert.equal(Object.hasOwn(clean, 'LD_LIBRARY_PATH'), false);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
