// Pick a save path or a folder with the best file dialog this desktop has.
//
// On KDE (Dolphin's world) that is `kdialog`: the real KDE file dialog, with the places panel,
// bookmarks and folder tree the person already knows. Anywhere else, or if kdialog is missing or
// fails to start, the standard Electron dialog is used (which itself goes through the desktop
// portal or GTK). A person cancelling is never mistaken for a failure.

import { spawn } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { accessSync, constants } from 'node:fs';

function defaultCommandExists(command) {
  for (const dir of String(process.env.PATH ?? '').split(delimiter)) {
    try {
      accessSync(join(dir, command), constants.X_OK);
      return true;
    } catch { /* keep looking */ }
  }
  return false;
}

function defaultRun(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', () => resolve({ code: -1, stdout: '' }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout }));
  });
}

function shouldUseKdialog({ platform, desktop, commandExists }) {
  return platform === 'linux' && /kde/i.test(String(desktop ?? '')) && commandExists('kdialog');
}

/** Resolves to the chosen path, or null when the person cancelled. */
export async function pickSavePath({
  title,
  defaultPath,
  extension = 'mp4',
  filterLabel = 'MP4 video',
  electronDialog,
  parentWindow,
  platform = process.platform,
  desktop = process.env.XDG_CURRENT_DESKTOP,
  commandExists = defaultCommandExists,
  run = defaultRun,
} = {}) {
  if (shouldUseKdialog({ platform, desktop, commandExists })) {
    const result = await run('kdialog', ['--title', title, '--getsavefilename', defaultPath, `*.${extension}|${filterLabel} (*.${extension})`]);
    if (result.code === 0) {
      const chosen = result.stdout.trim();
      if (chosen) return chosen.toLowerCase().endsWith(`.${extension}`) ? chosen : `${chosen}.${extension}`;
      return null;
    }
    if (result.code === 1) return null; // cancelled
    // any other exit: kdialog could not run here, fall through to the standard dialog
  }
  const result = await electronDialog.showSaveDialog(...(parentWindow ? [parentWindow] : []), {
    title,
    defaultPath,
    filters: [{ name: filterLabel, extensions: [extension] }],
  });
  return result.canceled || !result.filePath ? null : result.filePath;
}

/** Resolves to the chosen folder, or null when the person cancelled. */
export async function pickDirectory({
  title,
  defaultPath,
  electronDialog,
  parentWindow,
  platform = process.platform,
  desktop = process.env.XDG_CURRENT_DESKTOP,
  commandExists = defaultCommandExists,
  run = defaultRun,
} = {}) {
  if (shouldUseKdialog({ platform, desktop, commandExists })) {
    const result = await run('kdialog', ['--title', title, '--getexistingdirectory', defaultPath]);
    if (result.code === 0) return result.stdout.trim() || null;
    if (result.code === 1) return null;
  }
  const result = await electronDialog.showOpenDialog(...(parentWindow ? [parentWindow] : []), {
    title,
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled || !result.filePaths?.[0] ? null : result.filePaths[0];
}
