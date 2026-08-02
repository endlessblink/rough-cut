import { access, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
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

export async function getFreecutEditorUrl(options = {}) {
  const root = await resolveFreecutRoot(options);
  if (!root) {
    return {
      ok: false,
      reason: 'FreeCut is not included in this Rough Cut package.',
    };
  }
  const baseUrl = await startFreecutServer(root, options.host);
  const projectId = typeof options.projectId === 'string' ? options.projectId.trim() : '';
  return { ok: true, url: projectId ? `${baseUrl}/editor/${encodeURIComponent(projectId)}` : `${baseUrl}/projects` };
}

export async function openFreecutEditor({ app, parent = null, env = process.env, host = null } = {}) {
  return {
    ok: false,
    reason: 'Standalone FreeCut windows are disabled; use the embedded Editor view.',
  };
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

export async function startFreecutServer(root, host = null) {
  if (freecutServer && freecutServerRoot === root) {
    const address = freecutServer.address();
    if (address && typeof address === 'object') return `http://127.0.0.1:${address.port}`;
  }

  if (freecutServer) {
    await new Promise((resolveClose) => freecutServer.close(resolveClose));
    freecutServer = null;
    freecutServerRoot = null;
  }

  freecutServer = createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://freecut.local').pathname);
      if (requestPath === '/__rough_cut__/snapshot' && host?.getSnapshot) {
        const snapshot = await host.getSnapshot();
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(snapshot));
        return;
      }
      if (requestPath === '/__rough_cut__/save' && request.method === 'POST' && host?.saveProject) {
        const body = await readRequestBody(request);
        const saved = await host.saveProject(JSON.parse(body));
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ ok: true, path: saved.path }));
        return;
      }
      if (requestPath.startsWith('/__rough_cut__/media/') && host?.resolveMedia) {
        const [, , , projectId, assetId] = requestPath.split('/');
        const media = await host.resolveMedia(projectId, assetId);
        if (!media) {
          response.writeHead(404);
          response.end('Media not found');
          return;
        }
        await serveMedia(media, request, response);
        return;
      }
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
  return `http://127.0.0.1:${address.port}`;
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

async function serveMedia(media, request, response) {
  const info = await stat(media.path);
  const range = parseRange(request.headers.range, info.size);
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': media.mimeType,
  };
  if (!range) {
    response.writeHead(200, { ...headers, 'Content-Length': String(info.size) });
    createReadStream(media.path).pipe(response);
    return;
  }
  response.writeHead(206, {
    ...headers,
    'Content-Length': String(range.end - range.start + 1),
    'Content-Range': `bytes ${range.start}-${range.end}/${info.size}`,
  });
  createReadStream(media.path, { start: range.start, end: range.end }).pipe(response);
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? '');
  if (!match || size <= 0) return null;
  const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', rejectBody);
  });
}
