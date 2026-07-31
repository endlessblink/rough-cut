import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import electron from 'electron';

const { BrowserWindow } = electron;

let freecutWindow = null;
let freecutServer = null;
let freecutServerRoot = null;

export async function resolveFreecutRoot({ app, env = process.env } = {}) {
  const candidates = [];
  if (env.ROUGH_CUT_FREECUT_DIST) candidates.push(resolve(env.ROUGH_CUT_FREECUT_DIST));
  // The Linux dock artifact is an unpacked Electron app. Depending on how
  // Electron was launched, getAppPath() may point at an app root that is
  // resolved differently from resourcesPath; check both package layouts.
  if (app?.getAppPath) candidates.push(join(app.getAppPath(), 'freecut'));
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'app', 'freecut'));
    candidates.push(join(process.resourcesPath, 'freecut'));
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

  const freecutUrl = await startFreecutServer(root);

  freecutWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'FreeCut',
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
    if (freecutServer) {
      freecutServer.close();
      freecutServer = null;
      freecutServerRoot = null;
    }
  });

  await freecutWindow.loadURL(freecutUrl);
  freecutWindow.show();
  return { ok: true, reused: false };
}

export function closeFreecutEditor() {
  if (freecutWindow && !freecutWindow.isDestroyed()) freecutWindow.close();
  freecutWindow = null;
  if (freecutServer) {
    freecutServer.close();
    freecutServer = null;
    freecutServerRoot = null;
  }
}

export async function startFreecutServer(root) {
  if (freecutServer && freecutServerRoot === root) {
    const address = freecutServer.address();
    if (address && typeof address === 'object') return `http://127.0.0.1:${address.port}/projects`;
  }

  if (freecutServer) {
    await new Promise((resolveClose) => freecutServer.close(resolveClose));
    freecutServer = null;
    freecutServerRoot = null;
  }

  freecutServer = createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://freecut.local').pathname);
      const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
      let filePath = resolve(root, relativePath);
      const insideRoot = relative(root, filePath) && !relative(root, filePath).startsWith('..');
      if (!insideRoot) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }
      try {
        await access(filePath);
      } catch {
        if (extname(relativePath)) throw new Error('FreeCut asset not found.');
        filePath = resolve(root, 'index.html');
      }
      const body = await readFile(filePath);
      response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-cache' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  freecutServerRoot = root;
  await new Promise((resolveListen, rejectListen) => {
    freecutServer.once('error', rejectListen);
    freecutServer.listen(0, '127.0.0.1', resolveListen);
  });
  const address = freecutServer.address();
  if (!address || typeof address !== 'object') throw new Error('FreeCut server did not expose a local port.');
  return `http://127.0.0.1:${address.port}/projects`;
}

function contentType(filePath) {
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json',
  }[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}
