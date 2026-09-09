import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceValue } from '../src/lib/node-rules.ts';
import { isImageFile } from '../src/lib/image-files.ts';

test('image columns only store bounded, local asset references', () => {
  const field = { id: 'images', kind: 'image' as const, archived: false };
  const url = '/api/doc-assets/12345678-1234-1234-1234-123456789abc';
  assert.deepEqual(coerceValue(field, [url, url]), [url]);
  assert.equal(coerceValue(field, null), null);
  for (const value of ['image.png', ['https://example.com/a.png'], ['javascript:alert(1)'], [{}], Array(21).fill(url)]) {
    assert.throws(() => coerceValue(field, value));
  }
});

test('image picker supports clipboard MIME types and uncommon image extensions', () => {
  for (const name of ['photo.HEIC', 'camera.CR3', 'scan.tiff', 'picture.avif', 'art.psd', 'vector.svg']) {
    assert.equal(isImageFile({ name, type: '' }), true);
  }
  assert.equal(isImageFile({ name: 'clipboard', type: 'image/png' }), true);
  assert.equal(isImageFile({ name: 'script.html', type: 'text/html' }), false);
});
