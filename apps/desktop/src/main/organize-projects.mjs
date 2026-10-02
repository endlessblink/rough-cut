// Sort a flat projects folder into one dated folder per video, without breaking a single project.
//
//   plan  = planOrganize(root)        read-only: what would move where, and what is left alone
//   run   = applyOrganize(root, plan) moves files, rewrites the paths inside the moved projects, verifies,
//                                     and rolls EVERYTHING back if anything does not check out
//   undo  = undoOrganize(manifest)    puts every file and project back byte for byte
//
// Safety rules: files are only renamed inside the same folder tree (instant, no copying of gigabytes);
// original project files are saved first; a project that cannot be read is never touched; anything the
// tool does not recognise stays exactly where it is.

import { mkdir, readFile, readdir, rename, rmdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { projectFolderName } from './project-folders.mjs';

const STAMP_IN_NAME = /^rough-cut-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?=[.\-])/;
const STAMP_ANYWHERE = /rough-cut-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/g;
const VIDEO_EXTENSION = /\.(mp4|mkv|webm|mov)$/i;
const PROJECT_EXTENSION = '.roughcut';
/** Recordings that no project uses live together here, so they do not bury the real projects. */
export const UNFILED_FOLDER = '_Unfiled recordings';

function stampToDate(stamp) {
  const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function projectStem(fileName) {
  return fileName.slice(0, -PROJECT_EXTENSION.length);
}

/** Read-only. Decide which files belong together and where each group would live. */
export async function planOrganize(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const existingFolders = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  const sizes = new Map();
  const mtimes = new Map();
  for (const name of fileNames) {
    const info = await stat(join(root, name));
    sizes.set(name, info.size);
    mtimes.set(name, info.mtime);
  }

  // 1. Read every project. One that cannot be read is never moved (its paths cannot be rewritten safely).
  const projectNames = fileNames.filter((name) => name.toLowerCase().endsWith(PROJECT_EXTENSION));
  const projects = [];
  const unreadable = [];
  for (const name of projectNames) {
    const text = await readFile(join(root, name), 'utf8');
    let document = null;
    try { document = JSON.parse(text); } catch { /* reported below */ }
    if (!document || typeof document !== 'object') { unreadable.push(name); continue; }
    const referenced = new Set([...text.matchAll(STAMP_ANYWHERE)].map((match) => match[1]));
    const ownStamp = name.match(STAMP_IN_NAME)?.[1] ?? null;
    projects.push({ name, document, referenced, ownStamp });
  }

  // 2. Who owns each recording? The project named after it first, otherwise the first named project that uses it.
  const owner = new Map();
  const claimOrder = [...projects].sort((a, b) => Number(Boolean(b.ownStamp)) - Number(Boolean(a.ownStamp)) || a.name.localeCompare(b.name));
  for (const project of claimOrder) {
    if (project.ownStamp && !owner.has(project.ownStamp)) owner.set(project.ownStamp, project.name);
  }
  for (const project of claimOrder) {
    for (const stamp of project.referenced) if (!owner.has(stamp)) owner.set(stamp, project.name);
  }

  // 3. Build one group per project: its own files, plus every file of the recordings it owns.
  const claimed = new Map(); // file name -> group key
  const groups = [];
  const filesOfStamp = (stamp) => fileNames.filter((name) => name.startsWith(`rough-cut-${stamp}`) && /^[.\-]/.test(name.slice(`rough-cut-${stamp}`.length)));
  for (const project of claimOrder) {
    const stem = projectStem(project.name);
    const files = new Set(fileNames.filter((name) => name === project.name || name.startsWith(`${stem}.`)));
    for (const [stamp, ownerName] of owner) if (ownerName === project.name) for (const name of filesOfStamp(stamp)) files.add(name);
    const mine = [...files].filter((name) => !claimed.has(name));
    mine.forEach((name) => claimed.set(name, project.name));
    const stamps = [...owner].filter(([, ownerName]) => ownerName === project.name).map(([stamp]) => stamp).sort();
    const created = Date.parse(project.document.createdAt ?? '');
    const date = (project.ownStamp ? stampToDate(project.ownStamp) : null)
      ?? (stamps[0] ? stampToDate(stamps[0]) : null)
      ?? (Number.isFinite(created) ? new Date(created) : null)
      ?? mtimes.get(project.name) ?? null;
    // A recording's default name is just its timestamp; the folder already starts with the date, so call it a recording.
    const rawName = String(project.document.name ?? stem);
    const displayName = /^rough-cut-\d{4}-\d{2}-\d{2}T/.test(rawName) ? 'Recording' : rawName;
    groups.push({ kind: 'project', key: project.name, projectFile: project.name, displayName, date, files: mine });
  }

  // 4. Recordings nobody uses: keep each video recording together; stray logs go to one leftovers folder.
  const orphanStamps = new Map();
  for (const name of fileNames) {
    if (claimed.has(name)) continue;
    const stamp = name.match(STAMP_IN_NAME)?.[1];
    if (!stamp) continue;
    if (!orphanStamps.has(stamp)) orphanStamps.set(stamp, []);
    orphanStamps.get(stamp).push(name);
  }
  const leftovers = [];
  for (const [stamp, names] of [...orphanStamps].sort()) {
    // A project we cannot read may still own these; never move them out from under it.
    if (unreadable.some((unreadableName) => unreadableName.includes(stamp))) continue;
    names.forEach((name) => claimed.set(name, `orphan:${stamp}`));
    if (names.some((name) => VIDEO_EXTENSION.test(name))) {
      groups.push({ kind: 'orphan', key: `orphan:${stamp}`, projectFile: null, displayName: 'Recording', date: stampToDate(stamp), parentFolder: UNFILED_FOLDER, files: names });
    } else {
      leftovers.push(...names);
    }
  }
  if (leftovers.length > 0) groups.push({ kind: 'leftovers', key: 'leftovers', projectFile: null, displayName: 'Leftover logs (no video)', date: null, files: leftovers });

  // 5. Folder names: dated, unique within their parent, never colliding with anything already there.
  const takenIn = new Map([['', new Set(existingFolders)]]);
  const takenFor = async (parent) => {
    if (takenIn.has(parent)) return takenIn.get(parent);
    const names = await readdir(join(root, parent)).catch(() => []);
    takenIn.set(parent, new Set(names));
    return takenIn.get(parent);
  };
  for (const group of groups) {
    const parent = group.parentFolder ?? '';
    const taken = await takenFor(parent);
    const base = group.kind === 'leftovers' ? '_Leftover logs (no video)' : projectFolderName(group.date ?? new Date(0), group.displayName);
    let folderName = base;
    for (let n = 2; taken.has(folderName); n += 1) folderName = `${base} (${n})`;
    taken.add(folderName);
    group.folderName = folderName;
    group.files = group.files.sort().map((name) => ({ name, bytes: sizes.get(name) ?? 0 }));
    group.bytes = group.files.reduce((sum, file) => sum + file.bytes, 0);
  }

  const leftInPlace = fileNames.filter((name) => !claimed.has(name)).map((name) => ({ name, reason: unreadable.includes(name) ? 'project file cannot be read' : 'not recognised' }));
  return {
    root,
    groups: groups.filter((group) => group.files.length > 0),
    leftInPlace,
    unreadable,
    totals: {
      folders: groups.filter((group) => group.files.length > 0).length,
      files: groups.reduce((sum, group) => sum + group.files.length, 0),
      bytes: groups.reduce((sum, group) => sum + group.bytes, 0),
    },
  };
}

function rewritePaths(value, { root, projectDir, destinationOf }) {
  if (Array.isArray(value)) return value.map((item) => rewritePaths(item, { root, projectDir, destinationOf }));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritePaths(item, { root, projectDir, destinationOf })]));
  }
  if (typeof value !== 'string') return value;
  if (value.startsWith(`${root}/`) && !value.slice(root.length + 1).includes('/')) {
    const destination = destinationOf(value.slice(root.length + 1));
    return destination ?? value;
  }
  if (value.length > 0 && !value.includes('/')) {
    const destination = destinationOf(value);
    if (destination && dirname(destination) !== projectDir) return relative(projectDir, destination);
  }
  return value;
}

function collectStrings(value, out = []) {
  if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, out));
  else if (typeof value === 'string') out.push(value);
  return out;
}

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

/** Do the move. Everything is verified; on any problem everything is put back and the error says why. */
export async function applyOrganize(root, plan, { now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupDir = join(root, `.organized-${stamp}`);
  await mkdir(backupDir, { recursive: true });
  const manifestPath = join(backupDir, 'manifest.json');
  const moves = [];
  const createdFolders = [];
  const backups = [];
  const manifest = { createdAt: now.toISOString(), root, moves, createdFolders, backups };
  const save = () => writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const folderOf = (group) => join(root, ...(group.parentFolder ? [group.parentFolder] : []), group.folderName);
  const destinations = new Map(); // file name -> new absolute path
  for (const group of plan.groups) for (const file of group.files) destinations.set(file.name, join(folderOf(group), file.name));
  const destinationOf = (name) => destinations.get(name) ?? null;

  try {
    // Phase 1: move (rename only; never copy).
    for (const group of plan.groups) {
      const folder = folderOf(group);
      if (group.parentFolder && !(await exists(join(root, group.parentFolder)))) {
        await mkdir(join(root, group.parentFolder));
        createdFolders.push(join(root, group.parentFolder));
      }
      await mkdir(folder);
      createdFolders.push(folder);
      for (const file of group.files) {
        const from = join(root, file.name);
        const to = join(folder, file.name);
        await rename(from, to);
        moves.push({ from, to });
      }
      await save();
    }
    // Phase 2: rewrite the paths inside every moved project (originals saved first).
    const rewritten = [];
    for (const group of plan.groups) {
      if (!group.projectFile) continue;
      const projectPath = destinations.get(group.projectFile);
      const original = await readFile(projectPath, 'utf8');
      const backupPath = join(backupDir, `${group.folderName}__${group.projectFile}`);
      await writeFile(backupPath, original, 'utf8');
      backups.push({ projectPath, backupPath });
      const document = JSON.parse(original);
      const updated = rewritePaths(document, { root, projectDir: dirname(projectPath), destinationOf });
      const indent = /^\{\n\s+"/.test(original) ? 2 : 0;
      const temp = `${projectPath}.organize-tmp`;
      await writeFile(temp, `${JSON.stringify(updated, null, indent)}${original.endsWith('\n') ? '\n' : ''}`, 'utf8');
      await rename(temp, projectPath);
      rewritten.push({ projectPath, group });
      await save();
    }
    // Phase 3: verify. Every path a moved project points at must exist.
    const problems = [];
    for (const { projectPath } of rewritten) {
      const document = JSON.parse(await readFile(projectPath, 'utf8'));
      for (const value of collectStrings(document)) {
        const looksLikeFile = /\.(mp4|mkv|json|jpg|png|webm|mov|wav|log)$/i.test(value) && (value.startsWith(`${root}/`) || (!value.includes('/') && /^rough-cut-/.test(value)) || value.startsWith('../'));
        if (!looksLikeFile) continue;
        const absolute = value.startsWith('/') ? value : join(dirname(projectPath), value);
        // A path that pointed into the folder before and does not exist now is a real break; one that never existed is not ours.
        if (!(await exists(absolute)) && destinations.has(basename(value))) problems.push(`${basename(projectPath)} -> ${value}`);
      }
    }
    if (problems.length > 0) throw new Error(`After moving, ${problems.length} project path(s) do not resolve: ${problems.slice(0, 5).join('; ')}`);
    await save();
    return { manifestPath, backupDir, moved: moves.length, folders: createdFolders.length, projectsRewritten: rewritten.length };
  } catch (error) {
    await save().catch(() => undefined);
    await undoOrganize(manifestPath).catch((undoError) => { error.message += ` (and rolling back failed: ${undoError.message})`; });
    throw error;
  }
}

/** Put everything back exactly as it was: originals restored, files returned, empty folders removed. */
export async function undoOrganize(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const { projectPath, backupPath } of [...manifest.backups].reverse()) {
    if (await exists(backupPath)) await writeFile(projectPath, await readFile(backupPath, 'utf8'), 'utf8');
  }
  for (const { from, to } of [...manifest.moves].reverse()) {
    if (await exists(to)) await rename(to, from);
  }
  for (const folder of [...manifest.createdFolders].reverse()) await rmdir(folder).catch(() => undefined);
  return { restored: manifest.moves.length };
}
