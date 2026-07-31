import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import electron from 'electron';

const { BrowserWindow } = electron;

let freecutWindow = null;

export async function resolveFreecutRoot({ app, env = process.env } = {}) {
  const candidates = [];
  if (env.ROUGH_CUT_FREECUT_DIST) candidates.push(resolve(env.ROUGH_CUT_FREECUT_DIST));
  if (app?.isPackaged) {
    // The Linux dock artifact is an unpacked Electron app. Depending on how
    // Electron was launched, getAppPath() may point at an app root that is
    // resolved differently from resourcesPath; check both package layouts.
    if (app.getAppPath) candidates.push(join(app.getAppPath(), 'freecut'));
    if (process.resourcesPath) {
      candidates.push(join(process.resourcesPath, 'app', 'freecut'));
      candidates.push(join(process.resourcesPath, 'freecut'));
    }
  }

  for (const candidate of candidates) {
    try {
      await access(join(candidate, 'index.html'));
      return candidate;
    } catch {
      // Try the next configured or packaged location.
    }
  }

  return null;
}

export async function getFreecutStatus(options = {}) {
  const root = await resolveFreecutRoot(options);
  return { available: Boolean(root), root };
}

export async function openFreecutEditor({ app, parent = null, env = process.env } = {}) {
  const root = await resolveFreecutRoot({ app, env });
  if (!root) {
    return {
      ok: false,
      reason: 'FreeCut is not packaged. Set ROUGH_CUT_FREECUT_DIST to a built FreeCut dist folder before packaging.',
    };
  }

  if (freecutWindow && !freecutWindow.isDestroyed()) {
    freecutWindow.show();
    freecutWindow.focus();
    return { ok: true, reused: true };
  }

  freecutWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'FreeCut — Rough Cut Editor',
    backgroundColor: '#111827',
    parent: parent ?? undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  freecutWindow.on('closed', () => {
    freecutWindow = null;
  });

  await freecutWindow.loadFile(join(root, 'index.html'));
  freecutWindow.show();
  return { ok: true, reused: false };
}

export function closeFreecutEditor() {
  if (freecutWindow && !freecutWindow.isDestroyed()) freecutWindow.close();
  freecutWindow = null;
}
