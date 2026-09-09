import test from 'node:test';
import assert from 'node:assert/strict';
import { docAssetStorageKey } from '../src/lib/doc-asset-path.ts';

const asset = { id: '00000000-0000-4000-8000-000000000001', filename: 'เอกสาร.pdf', createdAt: new Date('2026-12-31T17:00:00Z') };

test('asset folders follow Bangkok year/month across the UTC year boundary', () => {
  assert.equal(docAssetStorageKey(asset), `27/01/${asset.id}-เอกสาร.pdf`);
  assert.match(docAssetStorageKey({ ...asset, createdAt: new Date('2026-12-31T16:59:59Z') }), /^26\/12\//);
});

test('stored filenames cannot traverse directories and remain bounded for Thai names', () => {
  for (const filename of ['../../name.pdf', '..\\..\\name.pdf', 'C:\\file:stream.pdf', '.', 'CON', '']) {
    const key = docAssetStorageKey({ ...asset, filename });
    assert.equal(key.split('/').length, 3);
    assert.doesNotMatch(key.split('/')[2]!, /[<>:"\\|?*]/);
  }
  const filename = docAssetStorageKey({ ...asset, filename: 'ก'.repeat(200) + '.pdf' }).split('/')[2]!;
  assert.ok(Buffer.byteLength(filename) < 255);
  assert.ok(filename.endsWith('.pdf'));
  assert.throws(() => docAssetStorageKey({ ...asset, id: '../escape' }));
});

test('duplicate original filenames have distinct storage keys', () => {
  assert.notEqual(docAssetStorageKey(asset), docAssetStorageKey({ ...asset, id: '00000000-0000-4000-8000-000000000002' }));
});
