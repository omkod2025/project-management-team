import test from 'node:test';
import assert from 'node:assert/strict';
import { tableFilterData, matchingTableRows } from '../src/lib/doc-table-filter.ts';
import type { RichNode } from '../src/lib/doc-rich-content.ts';

const row = (...values: string[]): RichNode => ({ type: 'tableRow', content: values.map(text => ({ type: 'tableCell', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })) });
test('table filters combine columns, preserve Thai and leave source rows intact', () => {
  const table: RichNode = { type: 'table', content: [row('ชื่อ', 'ทีม'), row('สมชาย', 'Alpha'), row('สมหญิง', 'Beta'), row('', 'Alpha')] };
  const data = tableFilterData(table);
  assert.deepEqual([...matchingTableRows(data, { 0: ['สมชาย', 'สมหญิง'], 1: ['Alpha'] })], [1]);
  assert.deepEqual([...matchingTableRows(data, { 1: ['Alpha', 'Beta'] })], [1, 2, 3]);
  assert.deepEqual([...matchingTableRows(data, { 0: [''] })], [3]);
  assert.deepEqual([...matchingTableRows(data, { 1: [] })], []);
  assert.deepEqual([...matchingTableRows(data, {})], [1, 2, 3]);
  assert.equal(table.content!.length, 4);
});
