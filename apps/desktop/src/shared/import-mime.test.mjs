import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isImportableMimeType,
  mimeForExtension,
  ALLOWED_IMPORT_EXTENSIONS,
} from './import-mime.mjs';

test('isImportableMimeType accepts each canonical mime', () => {
  for (const mime of [
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'image/png',
    'image/jpeg',
  ]) {
    assert.equal(isImportableMimeType(mime), true, `should accept ${mime}`);
  }
});

test('isImportableMimeType accepts common audio mime aliases', () => {
  assert.equal(isImportableMimeType('audio/mp3'), true);
  assert.equal(isImportableMimeType('audio/x-wav'), true);
  assert.equal(isImportableMimeType('audio/wave'), true);
});

test('isImportableMimeType is case-insensitive', () => {
  assert.equal(isImportableMimeType('VIDEO/MP4'), true);
  assert.equal(isImportableMimeType('Image/Png'), true);
});

test('isImportableMimeType rejects non-whitelisted mimes', () => {
  for (const mime of [
    'video/x-matroska',
    'video/webm',
    'audio/flac',
    'image/heic',
    'image/gif',
    'application/octet-stream',
    '',
  ]) {
    assert.equal(isImportableMimeType(mime), false, `should reject ${mime}`);
  }
});

test('isImportableMimeType rejects non-string input', () => {
  assert.equal(isImportableMimeType(null), false);
  assert.equal(isImportableMimeType(undefined), false);
  assert.equal(isImportableMimeType(42), false);
  assert.equal(isImportableMimeType({}), false);
});

test('mimeForExtension maps the documented set of extensions', () => {
  assert.equal(mimeForExtension('mp4'), 'video/mp4');
  assert.equal(mimeForExtension('mov'), 'video/quicktime');
  assert.equal(mimeForExtension('mp3'), 'audio/mpeg');
  assert.equal(mimeForExtension('wav'), 'audio/wav');
  assert.equal(mimeForExtension('png'), 'image/png');
  assert.equal(mimeForExtension('jpg'), 'image/jpeg');
  assert.equal(mimeForExtension('jpeg'), 'image/jpeg');
});

test('mimeForExtension accepts a full path with extension', () => {
  assert.equal(mimeForExtension('/Users/x/clip.MP4'), 'video/mp4');
  assert.equal(mimeForExtension('photo.JPG'), 'image/jpeg');
});

test('mimeForExtension returns null for unsupported types and bad input', () => {
  assert.equal(mimeForExtension('mkv'), null);
  assert.equal(mimeForExtension('clip.mkv'), null);
  assert.equal(mimeForExtension(''), null);
  assert.equal(mimeForExtension(null), null);
});

test('ALLOWED_IMPORT_EXTENSIONS is the documented set in lowercase', () => {
  assert.deepEqual(
    [...ALLOWED_IMPORT_EXTENSIONS].sort(),
    ['jpeg', 'jpg', 'mov', 'mp3', 'mp4', 'png', 'wav'],
  );
});
