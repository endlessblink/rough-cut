import electron from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

const { protocol } = electron;

export function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'file') {
      return new Response('Unsupported media URL', { status: 400 });
    }

    const filePath = decodeURIComponent(url.pathname.slice(1));
    return createMediaFileResponse(filePath, request.headers.get('range'));
  });
}

export function toMediaUrl(filePath) {
  return `media://file/${encodeURIComponent(filePath)}`;
}

export async function createMediaFileResponse(filePath, rangeHeader = null) {
  const info = await stat(filePath);
  const contentType = contentTypeFor(filePath);
  const commonHeaders = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
  };

  if (!rangeHeader) {
    return new Response(toWebStream(createReadStream(filePath)), {
      status: 200,
      headers: {
        ...commonHeaders,
        'Content-Length': String(info.size),
      },
    });
  }

  const range = parseByteRange(rangeHeader, info.size);
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes */${info.size}`,
      },
    });
  }

  const { start, end } = range;
  return new Response(toWebStream(createReadStream(filePath, { start, end })), {
    status: 206,
    headers: {
      ...commonHeaders,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${info.size}`,
    },
  });
}

export function parseByteRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? '');
  if (!match || fileSize <= 0) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(0, fileSize - suffixLength);
    return { start, end: fileSize - 1 };
  }

  const start = Number(rawStart);
  const requestedEnd = rawEnd ? Number(rawEnd) : fileSize - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return null;
  if (start < 0 || requestedEnd < start || start >= fileSize) return null;

  return { start, end: Math.min(requestedEnd, fileSize - 1) };
}

function toWebStream(stream) {
  return Readable.toWeb(stream);
}

function contentTypeFor(filePath) {
  if (filePath.toLowerCase().endsWith('.mp4')) return 'video/mp4';
  if (filePath.toLowerCase().endsWith('.mkv')) return 'video/x-matroska';
  return 'application/octet-stream';
}
