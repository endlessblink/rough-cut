// House style for Claude-made graphics (fonts, colours, notes), shared by every
// project. Kept under appData rather than userData: the dock launcher gives each
// packaged build its own userData folder, which would reset the style on update.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { DEFAULT_GRAPHICS_STYLE } from './claude-graphics-service.mjs';
import { normalizeCreativity, resolveGraphicStyle } from '../shared/graphics-styles.mjs';

const COLOR = /^#[0-9a-f]{6}$/i;

export function defaultGraphicsStylePath(appDataDir) {
  return join(appDataDir, 'rough-cut-mvp', 'graphics-style.json');
}

export function normalizeGraphicsStyle(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const pickColor = (key) => (typeof input[key] === 'string' && COLOR.test(input[key]) ? input[key] : DEFAULT_GRAPHICS_STYLE[key]);
  const fontFamily = typeof input.fontFamily === 'string' && /^[\w\s-]{1,60}$/.test(input.fontFamily.trim())
    ? input.fontFamily.trim()
    : DEFAULT_GRAPHICS_STYLE.fontFamily;
  return {
    fontFamily,
    textColor: pickColor('textColor'),
    primaryColor: pickColor('primaryColor'),
    accentColor: pickColor('accentColor'),
    notes: typeof input.notes === 'string' ? input.notes.slice(0, 400) : '',
    styleId: resolveGraphicStyle(input.styleId).id,
    creativity: normalizeCreativity(input.creativity ?? DEFAULT_GRAPHICS_STYLE.creativity),
  };
}

export function createGraphicsStyleStore({ filePath }) {
  return {
    async get() {
      try {
        return normalizeGraphicsStyle(JSON.parse(await readFile(filePath, 'utf8')));
      } catch {
        return normalizeGraphicsStyle(null);
      }
    },
    async set(patch) {
      let current = {};
      try {
        current = JSON.parse(await readFile(filePath, 'utf8'));
      } catch {
        current = {};
      }
      const next = normalizeGraphicsStyle({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
      await mkdir(dirname(filePath), { recursive: true });
      const temp = `${filePath}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`);
      await rename(temp, filePath);
      return next;
    },
  };
}
