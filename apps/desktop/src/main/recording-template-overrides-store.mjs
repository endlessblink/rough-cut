import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const FILE_VERSION = 1;

function stripUndefined(value) {
  if (!value || typeof value !== 'object') return value;
  const next = Array.isArray(value) ? [] : {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    next[key] = stripUndefined(entry);
  }
  return next;
}

function normalizeOverride(input, now) {
  if (!input || typeof input !== 'object') throw new Error('Template override payload is required');
  if (typeof input.templateId !== 'string' || !input.templateId.trim()) {
    throw new Error('Template id is required');
  }
  if (typeof input.aspectRatio !== 'string' || !input.aspectRatio) {
    throw new Error('Template aspect ratio is required');
  }
  if (!input.background || typeof input.background !== 'object') {
    throw new Error('Template background is required');
  }
  if (!input.camera || typeof input.camera !== 'object') {
    throw new Error('Template camera is required');
  }
  const presentation = input.presentation && typeof input.presentation === 'object' ? input.presentation : {};
  return stripUndefined({
    templateId: input.templateId.trim(),
    aspectRatio: input.aspectRatio,
    background: input.background,
    camera: input.camera,
    screenFrame: presentation.screenFrame ?? input.screenFrame ?? null,
    cameraFrame: presentation.cameraFrame ?? input.cameraFrame ?? null,
    updatedAt: now(),
  });
}

function parseOverrides(raw, onLog, filePath) {
  if (!raw || typeof raw !== 'object' || raw.version !== FILE_VERSION || !Array.isArray(raw.overrides)) {
    onLog(`[recording-template-overrides] malformed file at ${filePath}, returning empty list`);
    return [];
  }
  return raw.overrides.filter((entry) => entry && typeof entry.templateId === 'string');
}

export function createRecordingTemplateOverridesStore({ filePath, now = () => Date.now(), onLog = () => undefined }) {
  let writeQueue = Promise.resolve();
  const queue = (work) => {
    const next = writeQueue.then(work, work);
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  async function readFileSafe() {
    try {
      const raw = await readFile(filePath, 'utf8');
      return parseOverrides(JSON.parse(raw), onLog, filePath);
    } catch (err) {
      if (err?.code === 'ENOENT') return [];
      onLog(`[recording-template-overrides] read error: ${err?.message ?? err}`);
      return [];
    }
  }

  async function writeAtomic(overrides) {
    const payload = JSON.stringify({ version: FILE_VERSION, overrides }, null, 2);
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, filePath);
  }

  return {
    list() {
      return queue(() => readFileSafe());
    },

    save(payload) {
      return queue(async () => {
        const override = normalizeOverride(payload, now);
        const overrides = await readFileSafe();
        const next = overrides.filter((entry) => entry.templateId !== override.templateId);
        next.push(override);
        await writeAtomic(next);
        return override;
      });
    },
  };
}

export function defaultRecordingTemplateOverridesPath(userDataDir) {
  return join(userDataDir, 'recording-template-overrides.json');
}
