import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDirectory, pickSavePath } from './file-picker.mjs';

const kde = { platform: 'linux', desktop: 'KDE', commandExists: () => true };
const electronDialog = (answer) => ({
  calls: [],
  async showSaveDialog(...args) { this.calls.push(['save', ...args]); return answer; },
  async showOpenDialog(...args) { this.calls.push(['open', ...args]); return answer; },
});

test('on KDE the save dialog is kdialog, started in the default folder with an mp4 filter', async () => {
  const calls = [];
  const dialog = electronDialog({ canceled: true });
  const chosen = await pickSavePath({
    ...kde, title: 'Export MP4', defaultPath: '/data/exports/Demo/Demo.mp4', electronDialog: dialog,
    run: async (command, args) => { calls.push([command, args]); return { code: 0, stdout: '/data/exports/Demo/Pick.mp4\n' }; },
  });
  assert.equal(chosen, '/data/exports/Demo/Pick.mp4');
  assert.deepEqual(calls, [['kdialog', ['--title', 'Export MP4', '--getsavefilename', '/data/exports/Demo/Demo.mp4', '*.mp4|MP4 video (*.mp4)']]]);
  assert.equal(dialog.calls.length, 0, 'the standard dialog is not opened');
});

test('a name typed without an extension gets .mp4, and cancelling returns null without a second dialog', async () => {
  const dialog = electronDialog({ canceled: true });
  assert.equal(await pickSavePath({ ...kde, title: 't', defaultPath: '/x/a.mp4', electronDialog: dialog, run: async () => ({ code: 0, stdout: '/x/typed name\n' }) }), '/x/typed name.mp4');
  assert.equal(await pickSavePath({ ...kde, title: 't', defaultPath: '/x/a.mp4', electronDialog: dialog, run: async () => ({ code: 1, stdout: '' }) }), null);
  assert.equal(dialog.calls.length, 0);
});

test('without KDE, or if kdialog cannot run, the standard dialog is used', async () => {
  const gnome = electronDialog({ canceled: false, filePath: '/home/me/out.mp4' });
  assert.equal(await pickSavePath({ platform: 'linux', desktop: 'GNOME', commandExists: () => true, title: 't', defaultPath: '/x/a.mp4', electronDialog: gnome, run: async () => assert.fail('must not run') }), '/home/me/out.mp4');
  assert.equal(gnome.calls[0][0], 'save');
  assert.deepEqual(gnome.calls[0][1].filters, [{ name: 'MP4 video', extensions: ['mp4'] }]);

  const missing = electronDialog({ canceled: false, filePath: '/home/me/two.mp4' });
  assert.equal(await pickSavePath({ platform: 'linux', desktop: 'KDE', commandExists: () => false, title: 't', defaultPath: '/x/a.mp4', electronDialog: missing }), '/home/me/two.mp4');

  const broken = electronDialog({ canceled: false, filePath: '/home/me/three.mp4' });
  assert.equal(await pickSavePath({ ...kde, title: 't', defaultPath: '/x/a.mp4', electronDialog: broken, run: async () => ({ code: -1, stdout: '' }) }), '/home/me/three.mp4');
});

test('the folder picker follows the same rules', async () => {
  const dialog = electronDialog({ canceled: false, filePaths: ['/std/folder'] });
  const calls = [];
  assert.equal(await pickDirectory({ ...kde, title: 'Choose', defaultPath: '/data', electronDialog: dialog, run: async (c, a) => { calls.push([c, a]); return { code: 0, stdout: '/kde/folder\n' }; } }), '/kde/folder');
  assert.deepEqual(calls[0][1], ['--title', 'Choose', '--getexistingdirectory', '/data']);
  assert.equal(await pickDirectory({ ...kde, title: 'Choose', defaultPath: '/data', electronDialog: dialog, run: async () => ({ code: 1, stdout: '' }) }), null);
  assert.equal(await pickDirectory({ platform: 'linux', desktop: 'XFCE', commandExists: () => true, title: 'Choose', defaultPath: '/data', electronDialog: dialog }), '/std/folder');
});
