import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  UserRecordingTemplatesFileSchema,
  captureUserTemplate,
  renameUserTemplate as renameUserTemplateModel,
} from '@rough-cut/project-model';

// On-disk shape lives in userData/user-templates.json (next to recording-recovery.json).
// We serialize all writes through a per-store queue so concurrent IPC calls cannot interleave.

const FILE_VERSION = 1;
const MAX_TEMPLATES = 64;

function newId() {
  return `tpl_${randomBytes(8).toString('hex')}`;
}

export function createUserTemplatesStore({ filePath, now = () => Date.now(), onLog = () => undefined }) {
  let writeQueue = Promise.resolve();
  const queue = (work) => {
    const next = writeQueue.then(work, work);
    // Don't let one failure poison the queue; keep going with a resolved chain.
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  async function readFileSafe() {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const result = UserRecordingTemplatesFileSchema.safeParse(parsed);
      if (!result.success) {
        onLog(`[user-templates] malformed file at ${filePath}, returning empty list`);
        return [];
      }
      return result.data.templates;
    } catch (err) {
      if (err?.code === 'ENOENT') return [];
      onLog(`[user-templates] read error: ${err?.message ?? err}`);
      return [];
    }
  }

  async function writeAtomic(templates) {
    const payload = JSON.stringify({ version: FILE_VERSION, templates }, null, 2);
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, filePath);
  }

  return {
    list() {
      return queue(() => readFileSafe());
    },

    async save({ label, aspectRatio, background, camera, presentation }) {
      if (typeof label !== 'string' || !label.trim()) {
        throw new Error('Template label is required');
      }
      return queue(async () => {
        const templates = await readFileSafe();
        if (templates.length >= MAX_TEMPLATES) {
          throw new Error(`User template limit reached (${MAX_TEMPLATES}).`);
        }
        const template = captureUserTemplate({
          id: newId(),
          label,
          aspectRatio,
          background,
          camera,
          presentation,
          now: now(),
        });
        const next = [...templates, template];
        await writeAtomic(next);
        return template;
      });
    },

    async rename({ id, label }) {
      if (typeof id !== 'string' || !id) throw new Error('Template id is required');
      if (typeof label !== 'string' || !label.trim()) throw new Error('Template label is required');
      return queue(async () => {
        const templates = await readFileSafe();
        const idx = templates.findIndex((t) => t.id === id);
        if (idx < 0) throw new Error(`Template not found: ${id}`);
        const updated = renameUserTemplateModel(templates[idx], label, now());
        const next = [...templates];
        next[idx] = updated;
        await writeAtomic(next);
        return updated;
      });
    },

    async delete({ id }) {
      if (typeof id !== 'string' || !id) throw new Error('Template id is required');
      return queue(async () => {
        const templates = await readFileSafe();
        const next = templates.filter((t) => t.id !== id);
        if (next.length === templates.length) return { removed: false };
        await writeAtomic(next);
        return { removed: true };
      });
    },
  };
}

export function defaultUserTemplatesPath(userDataDir) {
  return join(userDataDir, 'user-templates.json');
}
