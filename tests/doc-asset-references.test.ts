import test from 'node:test';
import assert from 'node:assert/strict';
import { docAssetIds, removedDocAssetIds } from '../src/lib/doc-asset-references.ts';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const url = (id: string) => `/api/doc-assets/${id}`;

test('finds image, attachment and cover links in Markdown and rich JSON', () => {
  assert.deepEqual([...docAssetIds({ body: `![image](${url(first)}) [file](${url(second)})`, cover: url(first) })], [first, second]);
  assert.deepEqual([...docAssetIds('fieldbook-rich-v1:' + JSON.stringify({ type: 'image', attrs: { src: url(first) } }))], [first]);
  assert.deepEqual([...docAssetIds(url(first).replaceAll('/', '\\/'))], [first]);
  assert.deepEqual([...docAssetIds('/api/doc-assets/not-a-uuid')], []);
});

test('only stages references removed from the current content', () => {
  assert.deepEqual(removedDocAssetIds([url(first), url(second)], url(second)), [first]);
  assert.deepEqual(removedDocAssetIds([url(first), url(first)], url(first)), []);
});

test('a custom prefix finds wiki asset links, and the default prefix ignores them', () => {
  const wiki = `/api/wiki-assets/${first}`;
  assert.deepEqual([...docAssetIds(wiki, '/api/wiki-assets/')], [first]);
  assert.deepEqual([...docAssetIds(wiki)], []);
  assert.deepEqual([...docAssetIds(url(first), '/api/wiki-assets/')], []);
  assert.deepEqual(removedDocAssetIds([wiki, `/api/wiki-assets/${second}`], wiki, '/api/wiki-assets/'), [second]);
});
