import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AiAssetSchema } from '@rough-cut/project-model';

const FILE_VERSION = 1;
const INDEX_FILE = 'index.json';

const AiAssetsIndexSchema = z.object({
  version: z.literal(FILE_VERSION),
  assets: z.array(AiAssetSchema),
});

function newId() {
  return `ai_${randomBytes(8).toString('hex')}`;
}

function safeSegment(value, fallback) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function inferExtension({ sourceFilePath, fileName, extension }) {
  const raw = extension ?? extname(fileName ?? sourceFilePath ?? '');
  if (!raw) return '';
  const normalized = raw.startsWith('.') ? raw : `.${raw}`;
  return normalized.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
}

function sortNewestFirst(assets) {
  return [...assets].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function defaultAiAssetsRoot(userDataDir) {
  return join(userDataDir, 'ai-assets');
}

export function defaultAiAssetsIndexPath(userDataDir) {
  return join(defaultAiAssetsRoot(userDataDir), INDEX_FILE);
}

export function createAiAssetsStore({ rootDir, now = () => new Date().toISOString(), onLog = () => undefined }) {
  if (typeof rootDir !== 'string' || !rootDir) throw new Error('AI assets rootDir is required');
  const indexPath = join(rootDir, INDEX_FILE);
  let writeQueue = Promise.resolve();
  const queue = (work) => {
    const next = writeQueue.then(work, work);
    writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  async function readIndexSafe() {
    try {
      const raw = await readFile(indexPath, 'utf8');
      const parsed = JSON.parse(raw);
      const result = AiAssetsIndexSchema.safeParse(parsed);
      if (!result.success) {
        onLog(`[ai-assets] malformed index at ${indexPath}, returning empty list`);
        return [];
      }
      return result.data.assets;
    } catch (err) {
      if (err?.code === 'ENOENT') return [];
      onLog(`[ai-assets] read error: ${err?.message ?? err}`);
      return [];
    }
  }

  async function writeIndexAtomic(assets) {
    const payload = `${JSON.stringify({ version: FILE_VERSION, assets: sortNewestFirst(assets) }, null, 2)}\n`;
    await mkdir(dirname(indexPath), { recursive: true });
    const tmp = `${indexPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, indexPath);
  }

  function assetFilePath({ id, kind, sessionId, sourceFilePath, fileName, extension }) {
    const safeKind = safeSegment(kind, 'unknown');
    const safeSession = safeSegment(sessionId, 'default');
    const ext = inferExtension({ sourceFilePath, fileName, extension });
    return join(rootDir, safeKind, safeSession, `${id}${ext}`);
  }

  return {
    list() {
      return queue(async () => sortNewestFirst(await readIndexSafe()));
    },

    async add(input = {}) {
      const id = typeof input.id === 'string' && input.id ? input.id : newId();
      const createdAt = typeof input.createdAt === 'string' ? input.createdAt : now();
      const sessionId = safeSegment(input.sessionId, 'default');
      const filePath = assetFilePath({ ...input, id, sessionId });
      const asset = AiAssetSchema.parse({
        id,
        kind: input.kind,
        providerId: input.providerId,
        sourcePrompt: input.sourcePrompt ?? '',
        createdAt,
        tags: Array.isArray(input.tags) ? input.tags : [],
        sessionId,
        filePath,
      });

      return queue(async () => {
        const assets = await readIndexSafe();
        if (assets.some((item) => item.id === asset.id)) throw new Error(`AI asset already exists: ${asset.id}`);
        await mkdir(dirname(filePath), { recursive: true });
        if (typeof input.sourceFilePath === 'string' && input.sourceFilePath) {
          await copyFile(input.sourceFilePath, filePath);
        } else if (input.bytes !== undefined) {
          await writeFile(filePath, input.bytes);
        } else {
          await writeFile(filePath, '');
        }
        const next = [...assets, asset];
        await writeIndexAtomic(next);
        return asset;
      });
    },

    async update(id, patch = {}) {
      if (typeof id !== 'string' || !id) throw new Error('AI asset id is required');
      return queue(async () => {
        const assets = await readIndexSafe();
        const index = assets.findIndex((asset) => asset.id === id);
        if (index < 0) throw new Error(`AI asset not found: ${id}`);
        const updated = AiAssetSchema.parse({
          ...assets[index],
          ...(Array.isArray(patch.tags) ? { tags: patch.tags } : {}),
          ...(typeof patch.sourcePrompt === 'string' ? { sourcePrompt: patch.sourcePrompt } : {}),
          ...(typeof patch.providerId === 'string' ? { providerId: patch.providerId } : {}),
        });
        const next = [...assets];
        next[index] = updated;
        await writeIndexAtomic(next);
        return updated;
      });
    },

    async resolve(id) {
      if (typeof id !== 'string' || !id) throw new Error('AI asset id is required');
      return queue(async () => (await readIndexSafe()).find((asset) => asset.id === id) ?? null);
    },

    async delete(id) {
      if (typeof id !== 'string' || !id) throw new Error('AI asset id is required');
      return queue(async () => {
        const assets = await readIndexSafe();
        const asset = assets.find((item) => item.id === id);
        if (!asset) return { removed: false };
        await rm(asset.filePath, { force: true });
        await writeIndexAtomic(assets.filter((item) => item.id !== id));
        return { removed: true };
      });
    },
  };
}
