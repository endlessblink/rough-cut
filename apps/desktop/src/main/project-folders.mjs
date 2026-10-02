// One folder per video: <projects folder>/<YYYY-MM-DD_HHMM> <name>/ holds the recording, the
// camera file, cursor data, logs, thumbnail and the .roughcut project together, so a video is
// one thing you can see, move, back up or delete — not a dozen loose files in a shared pile.

import { mkdir, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const PROJECT_FOLDER_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}( .*)?$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

/** `2026-10-02_1459 Walkthrough` — local time, because that is the clock the person reads. */
export function projectFolderName(date = new Date(), name = 'Recording') {
  const d = date instanceof Date ? date : new Date(date);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const safe = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[\s.]+$/g, '')
    .slice(0, 60);
  return `${stamp} ${safe || 'Recording'}`;
}

/** Create a new, empty project folder under `root`, never reusing an existing one. */
export async function createProjectFolder(root, { date = new Date(), name = 'Recording' } = {}) {
  await mkdir(root, { recursive: true });
  const base = projectFolderName(date, name);
  for (let attempt = 1; attempt <= 99; attempt += 1) {
    const candidate = join(root, attempt === 1 ? base : `${base} (${attempt})`);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  const fallback = join(root, `${base} (${Date.now()})`);
  await mkdir(fallback);
  return fallback;
}

/**
 * After a project is deleted, remove its video folder — camera file, logs, cursor data and all — when it is one
 * of our dated folders and no OTHER project lives in it. A folder with another project, or one the person made
 * themselves, is never touched.
 */
export async function removeProjectFolderIfSolo(projectPath) {
  const folder = dirname(projectPath);
  if (!PROJECT_FOLDER_PATTERN.test(basename(folder))) return false;
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return false;
  }
  const projectFile = basename(projectPath).toLowerCase();
  const otherProject = entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.roughcut') && entry.name.toLowerCase() !== projectFile);
  if (otherProject) return false;
  await rm(folder, { recursive: true, force: true });
  return true;
}
