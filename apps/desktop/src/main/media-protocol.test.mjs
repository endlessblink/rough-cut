import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMediaFetchResponse, createMediaFileResponse, parseByteRange, toMediaUrl } from './media-protocol.mjs';

test('toMediaUrl encodes local file paths for the media protocol', () => {
  assert.equal(
    toMediaUrl('/home/endlessblink/Documents/Rough Cut MVP/recordings/capture.mp4'),
    'media://file/%2Fhome%2Fendlessblink%2FDocuments%2FRough%20Cut%20MVP%2Frecordings%2Fcapture.mp4',
  );
});

test('createMediaFetchResponse delegates to file URL fetch with request headers', async () => {
  const calls = [];
  const headers = new Headers({ range: 'bytes=0-' });
  const response = new Response('ok');
  const result = await createMediaFetchResponse('/tmp/Rough Cut/clip.mp4', headers, async (url, options) => {
    calls.push({ url, options });
    return response;
  });

  assert.equal(result, response);
  assert.equal(calls[0].url, 'file:///tmp/Rough%20Cut/clip.mp4');
  assert.equal(calls[0].options.headers, headers);
});

test('parseByteRange supports normal and suffix ranges', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.equal(parseByteRange('bytes=100-110', 100), null);
});

test('media file response returns partial content for video seeking', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-media-protocol-'));
  const filePath = join(dir, 'clip.mp4');
  await writeFile(filePath, Buffer.from('0123456789'));

  const response = await createMediaFileResponse(filePath, 'bytes=2-5');
  const body = Buffer.from(await response.arrayBuffer()).toString('utf8');

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('content-length'), '4');
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(body, '2345');
});

test('media file response rejects invalid ranges with 416', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rough-cut-media-protocol-'));
  const filePath = join(dir, 'clip.mp4');
  await writeFile(filePath, Buffer.from('0123456789'));

  const response = await createMediaFileResponse(filePath, 'bytes=20-30');

  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), 'bytes */10');
});
