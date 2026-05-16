import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createZoomMarker, createDefaultRecordingPresentation } from '@rough-cut/project-model';
import { removeMarker, listMarkers } from './zoom-markers.mjs';

function makeDocWithMarkers(markers) {
  return {
    id: 'doc1',
    version: 1,
    name: 'test',
    createdAt: '2026-05-16T00:00:00.000Z',
    modifiedAt: '2026-05-16T00:00:00.000Z',
    settings: { fps: 30, sourceWidth: 1920, sourceHeight: 1080 },
    motionPresets: [],
    motionCompositions: [],
    libraryReferences: [],
    aiAnnotations: { keepRedundantPhrases: false, keepLowConfidence: false, keepClickSounds: false },
    exportSettings: {},
    composition: { duration: 90, tracks: [] },
    assets: [
      {
        id: 'asset1',
        type: 'recording',
        sourcePath: '/tmp/r.mp4',
        duration: 90,
        presentation: {
          ...createDefaultRecordingPresentation(),
          zoom: { ...createDefaultRecordingPresentation().zoom, markers },
        },
      },
    ],
  };
}

describe('removeMarker', () => {
  it('removes only the requested marker (two markers, delete one)', () => {
    const a = createZoomMarker(0, 30);
    const b = createZoomMarker(40, 70);
    assert.notEqual(a.id, b.id, 'two consecutive createZoomMarker calls must produce distinct IDs');
    const doc = makeDocWithMarkers([a, b]);
    const next = removeMarker(doc, a.id);
    const remaining = listMarkers(next);
    assert.equal(remaining.length, 1, `expected exactly 1 marker, got ${remaining.length}`);
    assert.equal(remaining[0].id, b.id, 'remaining marker should be b');
  });

  it('returns the same document reference when removing a non-existent id', () => {
    const a = createZoomMarker(0, 30);
    const doc = makeDocWithMarkers([a]);
    const next = removeMarker(doc, 'does-not-exist');
    assert.equal(next, doc, 'no-op should return identical reference');
    assert.equal(listMarkers(next).length, 1);
  });

  it('removes the only marker leaving zero', () => {
    const a = createZoomMarker(0, 30);
    const doc = makeDocWithMarkers([a]);
    const next = removeMarker(doc, a.id);
    assert.equal(listMarkers(next).length, 0);
  });

  it('removing one of three preserves the other two with correct ids', () => {
    const a = createZoomMarker(0, 30);
    const b = createZoomMarker(40, 70);
    const c = createZoomMarker(80, 90);
    const doc = makeDocWithMarkers([a, b, c]);
    const next = removeMarker(doc, b.id);
    const ids = listMarkers(next).map((m) => m.id);
    assert.equal(ids.length, 2);
    assert.ok(ids.includes(a.id));
    assert.ok(ids.includes(c.id));
    assert.ok(!ids.includes(b.id));
  });

  it('createZoomMarker called rapidly produces unique ids', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i += 1) {
      ids.add(createZoomMarker(0, 30).id);
    }
    assert.equal(ids.size, 100, 'all 100 ids should be distinct');
  });
});
